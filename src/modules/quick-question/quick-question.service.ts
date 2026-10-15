import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { maskPII } from '../copilot/guardrails/pii-filter';
import { InstitutionsService } from '../institutions/institutions.service';
import {
  ReviewedCardRetrievalService,
  type ApplicableCardsResult,
} from '../knowledge-cards/card-retrieval/reviewed-card-retrieval.service';
import type {
  QuickQuestionAvailability,
  QuickQuestionRefusalReason,
  QuickQuestionResponse,
  QuickQuestionScope,
} from '../../shared/contracts/quick-question';
import { toQuickQuestionCardAnswer } from './card-answer';
import { KNOWLEDGE_GAP_RECORDER, type KnowledgeGapRecorder } from './knowledge-gap-recorder';
import type { AskQuickQuestionInput } from './quick-question.schemas';
import { isQuickQuestionEnabled } from './quick-question.settings';
import {
  QUICK_QUESTION_SCOPE_GUARD,
  accept,
  type QuickQuestionScopeGuard,
  type QuickQuestionScopeVerdict,
} from './scope-guard/quick-question-scope-guard';
import { readWeightKg } from './weight-dose';

type SearchStatus = ApplicableCardsResult['trace']['status'] | 'failed' | 'skipped';

/** O que a trilha de auditoria guarda de cada pergunta: desfecho, guarda e cartões — nunca o texto. */
interface QuickQuestionAuditPayload {
  outcome: QuickQuestionResponse['outcome'];
  refusalReason: QuickQuestionRefusalReason | null;
  scope: QuickQuestionScope;
  scopeGuard: string;
  scopeConfidence: number | null;
  /** Nomes de regra ou motivos da guarda, sem texto. */
  scopeSignals: string[];
  cards: Array<{ cardId: string; version: number; contentSha256: string }>;
  searchStatus: SearchStatus;
  gate: string | null;
  questionLength: number;
  piiDetected: boolean;
}

/** Uma pergunta em andamento, para a trilha e o log. */
interface QuestionRun {
  physicianId: string;
  questionId: string;
  startedAt: number;
  questionLength: number;
  piiDetected: boolean;
  scope: QuickQuestionScopeVerdict;
  /** `null` quando a busca não rodou (recusa) ou lançou. */
  search: ApplicableCardsResult | null;
  searchStatus: SearchStatus;
}

/**
 * CC-501 (ADR-019, emenda da pergunta rápida) — uma dúvida curta respondida
 * só por cartões revisados publicados.
 *
 * 1. A pergunta passa pela máscara (`maskPII`) antes de qualquer outra
 *    coisa: o texto bruto não vai para a guarda, embedding, log, auditoria
 *    nem banco.
 * 2. CC-503 — a guarda de escopo (`QUICK_QUESTION_SCOPE_GUARD`) recusa com
 *    educação o que não é dúvida clínica de PS, antes de qualquer busca: sem
 *    embedding e sem lacuna.
 * 3. A mesma busca e o mesmo portão da decisão (CC-406/CC-408): a pergunta
 *    mascarada é a consulta e a hipótese, sem síndrome.
 * 4. Cartão aplicável: a resposta é o cartão, sem reescrita. Nenhum: "ainda
 *    não temos um cartão revisado", a lacuna é registrada e a tela oferece
 *    abrir um caso. Sem busca: diz que a busca está fora, sem lacuna.
 *
 * Nada de texto gerado por IA neste fluxo: o único provedor chamado é o de
 * embedding, pela busca dos cartões (e o Jev, se for a guarda escolhida).
 */
@Injectable()
export class QuickQuestionService {
  private readonly logger = new Logger(QuickQuestionService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ReviewedCardRetrievalService)
    private readonly retrieval: ReviewedCardRetrievalService,
    @Inject(InstitutionsService) private readonly institutions: InstitutionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(KNOWLEDGE_GAP_RECORDER) private readonly gaps: KnowledgeGapRecorder,
    @Inject(QUICK_QUESTION_SCOPE_GUARD) private readonly scopeGuard: QuickQuestionScopeGuard,
  ) {}

  availability(): QuickQuestionAvailability {
    return { enabled: isQuickQuestionEnabled(this.config) };
  }

  async ask(physicianId: string, input: AskQuickQuestionInput): Promise<QuickQuestionResponse> {
    if (!isQuickQuestionEnabled(this.config)) {
      throw new NotFoundException('Pergunta rápida desligada');
    }
    const startedAt = Date.now();
    const questionId = randomUUID();
    const masked = maskPII(input.question);
    const question = masked.redacted;
    const run = {
      physicianId,
      questionId,
      startedAt,
      questionLength: question.length,
      piiDetected: masked.hasPII,
    };

    const scope = await this.judgeScope(questionId, question);
    if (!scope.inScope) {
      const refused: QuickQuestionResponse = {
        outcome: 'refused',
        questionId,
        reason: scope.reason,
      };
      await this.finish(refused, { ...run, scope, search: null, searchStatus: 'skipped' });
      return refused;
    }

    const institutionId = await this.institutionFor(physicianId);
    let search: ApplicableCardsResult | null;
    try {
      search = await this.retrieval.findApplicable({
        queries: [question],
        institutionId,
        syndrome: null,
        hypotheses: [question],
        problemRepresentation: null,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`QUICK_QUESTION_SEARCH_FAILED questionId=${questionId}: ${reason}`);
      Sentry.captureMessage(`QUICK_QUESTION_SEARCH_FAILED: ${reason}`, 'error');
      search = null;
    }

    const response = await this.respond(questionId, question, institutionId, search);
    await this.finish(response, {
      ...run,
      scope,
      search,
      searchStatus: search?.trace.status ?? 'failed',
    });
    return response;
  }

  /**
   * A guarda que lança não barra o médico: a pergunta segue para a busca,
   * que só responde com cartão. O erro vai para o Sentry.
   */
  private async judgeScope(
    questionId: string,
    question: string,
  ): Promise<QuickQuestionScopeVerdict> {
    try {
      return await this.scopeGuard.classify(question);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`QUICK_QUESTION_SCOPE_FAILED questionId=${questionId}: ${reason}`);
      Sentry.captureMessage(`QUICK_QUESTION_SCOPE_FAILED: ${reason}`, 'error');
      return accept(this.scopeGuard.name, ['guard_failed']);
    }
  }

  /** Trilha e log da pergunta, sem texto. */
  private async finish(response: QuickQuestionResponse, run: QuestionRun): Promise<void> {
    const cards = run.search?.cards ?? [];
    await this.record(run.physicianId, run.questionId, {
      outcome: response.outcome,
      refusalReason: response.outcome === 'refused' ? response.reason : null,
      scope: run.scope.scope,
      scopeGuard: run.scope.guard,
      scopeConfidence: run.scope.confidence,
      scopeSignals: run.scope.signals,
      cards: cards.map(({ card }) => ({
        cardId: card.cardId,
        version: card.version,
        contentSha256: card.contentSha256,
      })),
      searchStatus: run.searchStatus,
      gate: run.search?.trace.gate ?? null,
      questionLength: run.questionLength,
      piiDetected: run.piiDetected,
    });
    this.logger.log(
      `QUICK_QUESTION questionId=${run.questionId} outcome=${response.outcome} ` +
        `scope=${run.scope.scope} guard=${run.scope.guard} signals=${run.scope.signals.join(',') || '-'} ` +
        `search=${run.searchStatus} candidates=${run.search?.trace.candidates ?? 0} ` +
        `cards=[${cards.map(({ card, similarity }) => `${card.cardId}:v${card.version}:${similarity.toFixed(3)}`).join(',')}] ` +
        `pii=${run.piiDetected} latencyMs=${Date.now() - run.startedAt}`,
    );
  }

  private async respond(
    questionId: string,
    question: string,
    institutionId: string | null,
    search: ApplicableCardsResult | null,
  ): Promise<QuickQuestionResponse> {
    if (search && search.cards.length > 0) {
      const weight = readWeightKg(question);
      return {
        outcome: 'answered',
        questionId,
        cards: search.cards.map(({ card }) => toQuickQuestionCardAnswer(card, weight)),
      };
    }
    // Só a busca que rodou e o portão que julgou dizem "não há cartão". Sem
    // embedding, ou com o portão fora do ar, a falta não é do conteúdo.
    if (!search || search.trace.status !== 'ok') {
      return { outcome: 'search_unavailable', questionId };
    }
    const gapRecorded = await this.recordGap({
      questionId,
      maskedQuestion: question,
      institutionId,
      candidates: search.trace.candidates,
    });
    return { outcome: 'no_card', questionId, gapRecorded };
  }

  private async recordGap(gap: Parameters<KnowledgeGapRecorder['record']>[0]): Promise<boolean> {
    try {
      return await this.gaps.record(gap);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `QUICK_QUESTION_GAP_FAILED questionId=${gap.questionId} recorder=${this.gaps.name}: ${reason}`,
      );
      Sentry.captureMessage(`QUICK_QUESTION_GAP_FAILED: ${reason}`, 'error');
      return false;
    }
  }

  /**
   * Mesma regra do atendimento (PROT-004): a instituição única do médico;
   * sem vínculo ou com mais de uma, só os cartões globais.
   */
  private async institutionFor(physicianId: string): Promise<string | null> {
    const institutions = await this.institutions.listForPhysician(physicianId);
    return institutions.length === 1 ? (institutions[0]?.id ?? null) : null;
  }

  /**
   * Uma linha por pergunta na trilha: o cartão (versão e hash assinado) que o
   * médico viu, ou a falta dele. Falhar aqui não tira a resposta do médico —
   * o erro vai para o Sentry.
   */
  private async record(
    physicianId: string,
    questionId: string,
    payload: QuickQuestionAuditPayload,
  ): Promise<void> {
    try {
      await this.audit.log({
        actorId: physicianId,
        action: 'QUICK_QUESTION_ASKED',
        entity: 'QuickQuestion',
        entityId: questionId,
        payload: { ...payload },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`QUICK_QUESTION_AUDIT_FAILED questionId=${questionId}: ${reason}`);
      Sentry.captureMessage(`QUICK_QUESTION_AUDIT_FAILED: ${reason}`, 'error');
    }
  }
}
