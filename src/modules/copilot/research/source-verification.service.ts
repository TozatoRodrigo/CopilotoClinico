import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../../ai-gateway/ai-gateway.errors';
import type { CompletionUsage } from '../../ai-gateway/providers/provider.interface';
import type {
  CaseUnderstanding,
  RecommendationCategory,
  WebEvidenceItem,
} from '../../../shared/contracts/clinical';
import { calculateInferenceCost } from '../orchestrator/model-pricing';
import { buildWebEvidence } from './web-evidence';
import { WEB_FETCH_MAX_CONTENT_TOKENS, type ResearchOutcome } from './web-research.service';
import {
  readResearchEffort,
  readResearchModel,
  readWebResearchAllowedDomains,
  readWebResearchMaxSearches,
} from './web-research.settings';
import {
  buildSourceAttachPrompt,
  buildSourceVerificationPrompt,
  numberActionsForVerification,
  SOURCE_ATTACH_JSON_SCHEMA,
  SOURCE_ATTACH_SYSTEM_PROMPT,
  SOURCE_VERIFICATION_SYSTEM_PROMPT,
  type VerificationAction,
} from './source-verification-prompt';
import { acceptSourceLinks, parseSourceAttachResponse, type SourceLink } from './source-links';
import { readVerifyAttachModel, VERIFY_ATTACH_EFFORT } from './source-verification.settings';

export interface SourceVerificationRequest {
  understanding: CaseUnderstanding;
  /** Recomendações da decisão já validada, na ordem da saída. */
  recommendations: ReadonlyArray<{ action: string; category: RecommendationCategory }>;
  /** Sufixo dos logs, o mesmo do orquestrador: '', ' (stream)' ou ' (respond)'. */
  logLabel: string;
}

/**
 * Resultado da verificação, no formato do rastro da pesquisa web
 * (`ResearchOutcome`) para o orquestrador gravá-lo do mesmo jeito:
 * - `model`/`usage`: os da pesquisa — é dela o `webSearchRequests` do rastro;
 * - `cost`: pesquisa + vínculo;
 * - `latencyMs`: a verificação inteira;
 * - `links`: vínculos aceitos, pelo índice da recomendação na saída da
 *   decisão. Vazio quando a verificação caiu no fallback.
 */
export interface SourceVerificationOutcome extends ResearchOutcome {
  links: ReadonlyMap<number, SourceLink>;
}

/** O que a verificação já gastou e achou até o ponto em que parou. */
interface VerificationProgress {
  model: string | null;
  usage: CompletionUsage | null;
  cost: number;
  evidence: WebEvidenceItem[];
}

const NO_LINKS: ReadonlyMap<number, SourceLink> = new Map();

/**
 * Verificação com fonte DEPOIS da decisão (`COPILOT_KNOWLEDGE_SOURCE=verify`,
 * emenda de 11/10/2026 ao ADR-013). No experimento daquele dia, a pesquisa
 * ANTES da decisão puxou o raciocínio para o que as páginas diziam (condutas
 * obrigatórias de 62% para 48%; complexo protrombínico condicionado ao INR) —
 * e, sem pesquisa, nenhuma conduta trazia dose. Aqui a decisão raciocina
 * sozinha e a fonte só confere o que ela já decidiu:
 *
 * 1. pesquisa, com os settings da pesquisa web, a partir da síndrome, dos
 *    nomes das hipóteses graves e das condutas de tratamento e estabilização
 *    — nunca do texto do caso;
 * 2. vínculo: um modelo intermediário liga cada conduta a um trecho citado,
 *    com a dose do trecho e a divergência, se houver;
 * 3. o código aceita só id desta análise e dose literal do trecho
 *    (source-links.ts).
 *
 * Nunca bloqueia: erro, recusa, truncamento, nenhuma citação ou nenhum
 * vínculo viram `SOURCE_VERIFICATION_FALLBACK` no log, e a saída da decisão
 * segue intacta. Erro de provider vai também para o Sentry.
 */
@Injectable()
export class SourceVerificationService {
  private readonly logger = new Logger(SourceVerificationService.name);

  constructor(
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async verify(request: SourceVerificationRequest): Promise<SourceVerificationOutcome> {
    const startedAt = Date.now();
    const progress: VerificationProgress = { model: null, usage: null, cost: 0, evidence: [] };
    const settle = (links: ReadonlyMap<number, SourceLink>, fallbackReason: string | null) =>
      this.settle(request.logLabel, startedAt, progress, links, fallbackReason);

    try {
      const actions = numberActionsForVerification(request.recommendations);
      if (actions.length === 0) {
        return settle(NO_LINKS, 'nenhuma conduta de tratamento ou estabilização a verificar');
      }

      progress.evidence = await this.research(request, actions, progress);
      if (progress.evidence.length === 0) {
        return settle(NO_LINKS, 'nenhuma citação de fonte da lista de domínios permitidos');
      }

      const attached = parseSourceAttachResponse(
        await this.attach(actions, progress.evidence, progress),
      );
      if (!attached.success) return settle(NO_LINKS, attached.reason);

      const links = acceptSourceLinks(actions, attached.items, progress.evidence);
      return settle(links, links.size > 0 ? null : 'nenhuma conduta vinculada a um trecho citado');
    } catch (error) {
      return settle(NO_LINKS, this.failureReason(error, progress));
    }
  }

  /** Pesquisa com os settings da pesquisa web; devolve só os trechos citados. */
  private async research(
    request: SourceVerificationRequest,
    actions: readonly VerificationAction[],
    progress: VerificationProgress,
  ): Promise<WebEvidenceItem[]> {
    const { domains, rejected } = readWebResearchAllowedDomains(this.config);
    if (rejected.length > 0) {
      this.logger.warn(`WEB_RESEARCH_DOMAINS_REJECTED: ${rejected.join(', ')}`);
    }
    const maxSearches = readWebResearchMaxSearches(this.config);

    const response = await this.aiGateway.research({
      model: readResearchModel(this.config),
      effort: readResearchEffort(this.config),
      system: SOURCE_VERIFICATION_SYSTEM_PROMPT,
      prompt: buildSourceVerificationPrompt(request.understanding, actions),
      allowedDomains: domains,
      maxSearches,
      maxFetches: maxSearches,
      maxFetchContentTokens: WEB_FETCH_MAX_CONTENT_TOKENS,
    });
    progress.model = response.model;
    progress.usage = response.usage;
    progress.cost += calculateInferenceCost({ model: response.model, usage: response.usage });

    const { items, outsideAllowlist } = buildWebEvidence(response.citations, domains);
    if (outsideAllowlist.length > 0) {
      this.logger.warn(
        `SOURCE_VERIFICATION_CITATION_OUTSIDE_ALLOWLIST${request.logLabel}: ${outsideAllowlist.join(', ')}`,
      );
    }
    return items;
  }

  /** Vínculo conduta → trecho, com saída estruturada; devolve o texto da resposta. */
  private async attach(
    actions: readonly VerificationAction[],
    evidence: readonly WebEvidenceItem[],
    progress: VerificationProgress,
  ): Promise<string> {
    const completion = await this.aiGateway.complete({
      model: readVerifyAttachModel(this.config),
      effort: VERIFY_ATTACH_EFFORT,
      stage: 'verify_attach',
      messages: [
        { role: 'system', content: SOURCE_ATTACH_SYSTEM_PROMPT },
        { role: 'user', content: buildSourceAttachPrompt(actions, evidence) },
      ],
      responseSchema: SOURCE_ATTACH_JSON_SCHEMA,
    });
    progress.cost += calculateInferenceCost({ model: completion.model, usage: completion.usage });
    return completion.content;
  }

  /**
   * Recusa e truncamento foram cobrados: o custo conta. Provider sem pesquisa
   * web não custou nada. Qualquer outro erro é de provider, rede ou
   * inesperado: a verificação é opcional, mas a falha não pode sumir — vai
   * para o log de erro e para o Sentry.
   */
  private failureReason(error: unknown, progress: VerificationProgress): string {
    if (error instanceof AiRefusalError || error instanceof AiTruncatedError) {
      const { model, usage } = error.details;
      progress.model ??= model;
      progress.usage ??= usage;
      progress.cost += calculateInferenceCost({ model, usage });
      return error.message;
    }
    if (error instanceof AiCapabilityUnsupportedError) return error.message;

    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`SOURCE_VERIFICATION_PROVIDER_ERROR: ${message}`);
    Sentry.captureMessage(`SOURCE_VERIFICATION_PROVIDER_ERROR: ${message}`, 'error');
    return message;
  }

  private settle(
    logLabel: string,
    startedAt: number,
    progress: VerificationProgress,
    links: ReadonlyMap<number, SourceLink>,
    fallbackReason: string | null,
  ): SourceVerificationOutcome {
    const outcome: SourceVerificationOutcome = {
      evidence: progress.evidence,
      model: progress.model,
      usage: progress.usage,
      cost: progress.cost,
      latencyMs: Date.now() - startedAt,
      fallbackReason,
      links,
    };
    const summary =
      `model=${outcome.model ?? '-'} searches=${outcome.usage?.webSearchRequests ?? 0} ` +
      `items=${outcome.evidence.length} links=${links.size} ` +
      `latencyMs=${outcome.latencyMs} cost=${outcome.cost}`;
    if (fallbackReason === null) {
      this.logger.log(`SOURCE_VERIFICATION${logLabel} ${summary}`);
    } else {
      this.logger.warn(
        `SOURCE_VERIFICATION_FALLBACK${logLabel} ${summary}: ${fallbackReason} — segue a saída da decisão`,
      );
    }
    return outcome;
  }
}
