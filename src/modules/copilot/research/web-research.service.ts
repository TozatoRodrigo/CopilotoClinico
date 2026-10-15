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
import type { CaseUnderstanding, WebEvidenceItem } from '../../../shared/contracts/clinical';
import { calculateInferenceCost } from '../orchestrator/model-pricing';
import { buildWebEvidence } from './web-evidence';
import { buildResearchPrompt, WEB_RESEARCH_SYSTEM_PROMPT } from './web-research-prompt';
import {
  readResearchEffort,
  readResearchModel,
  readWebResearchAllowedDomains,
  readWebResearchMaxSearches,
} from './web-research.settings';

/**
 * Teto de tokens do texto de cada página lida: o bastante para a seção que
 * importa. O mesmo vale para a verificação com fonte (`verify`).
 */
export const WEB_FETCH_MAX_CONTENT_TOKENS = 6000;

export interface ResearchRequest {
  understanding: CaseUnderstanding;
  /** Sufixo dos logs, o mesmo do orquestrador: '', ' (stream)' ou ' (respond)'. */
  logLabel: string;
}

/**
 * Resultado da pesquisa. `evidence` vazia quer dizer que ela falhou e a
 * análise segue só com o conhecimento do modelo; custo, tokens e tempo contam
 * do mesmo jeito, porque a chamada foi feita.
 */
export interface ResearchOutcome {
  evidence: WebEvidenceItem[];
  /** Modelo que respondeu; `null` quando nenhuma chamada respondeu. */
  model: string | null;
  usage: CompletionUsage | null;
  cost: number;
  latencyMs: number;
  /** `null` quando a pesquisa entregou evidência. */
  fallbackReason: string | null;
}

/**
 * F1 — etapa de pesquisa web (`COPILOT_KNOWLEDGE_SOURCE=web`): a partir do
 * entendimento do caso — nunca do texto do caso —, busca orientação em fontes
 * oficiais da lista de domínios e devolve os trechos citados.
 *
 * Nunca bloqueia a análise: erro, recusa, truncamento ou nenhuma citação de
 * fonte permitida viram `WEB_RESEARCH_FALLBACK` no log, e a decisão segue com
 * o conhecimento geral do modelo.
 */
@Injectable()
export class WebResearchService {
  private readonly logger = new Logger(WebResearchService.name);

  constructor(
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async research(request: ResearchRequest): Promise<ResearchOutcome> {
    const startedAt = Date.now();
    const { domains, rejected } = readWebResearchAllowedDomains(this.config);
    if (rejected.length > 0) {
      this.logger.warn(`WEB_RESEARCH_DOMAINS_REJECTED: ${rejected.join(', ')}`);
    }
    const maxSearches = readWebResearchMaxSearches(this.config);

    try {
      const response = await this.aiGateway.research({
        model: readResearchModel(this.config),
        effort: readResearchEffort(this.config),
        system: WEB_RESEARCH_SYSTEM_PROMPT,
        prompt: buildResearchPrompt(request.understanding),
        allowedDomains: domains,
        maxSearches,
        maxFetches: maxSearches,
        maxFetchContentTokens: WEB_FETCH_MAX_CONTENT_TOKENS,
      });
      const { items, outsideAllowlist } = buildWebEvidence(response.citations, domains);
      if (outsideAllowlist.length > 0) {
        this.logger.warn(
          `WEB_RESEARCH_CITATION_OUTSIDE_ALLOWLIST${request.logLabel}: ${outsideAllowlist.join(', ')}`,
        );
      }

      const outcome: ResearchOutcome = {
        evidence: items,
        model: response.model,
        usage: response.usage,
        cost: calculateInferenceCost({ model: response.model, usage: response.usage }),
        latencyMs: Date.now() - startedAt,
        fallbackReason:
          items.length > 0 ? null : 'nenhuma citação de fonte da lista de domínios permitidos',
      };
      this.logOutcome(outcome, request.logLabel, response.citations.length);
      return outcome;
    } catch (error) {
      const outcome = this.failedOutcome(error, startedAt);
      this.logOutcome(outcome, request.logLabel, 0);
      return outcome;
    }
  }

  private failedOutcome(error: unknown, startedAt: number): ResearchOutcome {
    const base = { evidence: [], latencyMs: Date.now() - startedAt };
    if (error instanceof AiRefusalError || error instanceof AiTruncatedError) {
      const { model, usage } = error.details;
      return {
        ...base,
        model,
        usage,
        cost: calculateInferenceCost({ model, usage }),
        fallbackReason: error.message,
      };
    }
    if (error instanceof AiCapabilityUnsupportedError) {
      return { ...base, model: null, usage: null, cost: 0, fallbackReason: error.message };
    }
    // Erro de provider ou de rede: a pesquisa é opcional, mas a falha não
    // pode sumir — vai para o log de erro e para o Sentry.
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`WEB_RESEARCH_PROVIDER_ERROR: ${message}`);
    Sentry.captureMessage(`WEB_RESEARCH_PROVIDER_ERROR: ${message}`, 'error');
    return { ...base, model: null, usage: null, cost: 0, fallbackReason: message };
  }

  private logOutcome(outcome: ResearchOutcome, logLabel: string, citations: number): void {
    const summary =
      `model=${outcome.model ?? '-'} searches=${outcome.usage?.webSearchRequests ?? 0} ` +
      `citations=${citations} items=${outcome.evidence.length} ` +
      `latencyMs=${outcome.latencyMs} cost=${outcome.cost}`;
    if (outcome.fallbackReason === null) {
      this.logger.log(`WEB_RESEARCH${logLabel} ${summary}`);
      return;
    }
    this.logger.warn(
      `WEB_RESEARCH_FALLBACK${logLabel} ${summary}: ${outcome.fallbackReason} — a decisão segue só com o conhecimento do modelo`,
    );
  }
}
