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
  QuickQuestionResponse,
} from '../../shared/contracts/quick-question';
import { toQuickQuestionCardAnswer } from './card-answer';
import { KNOWLEDGE_GAP_RECORDER, type KnowledgeGapRecorder } from './knowledge-gap-recorder';
import type { AskQuickQuestionInput } from './quick-question.schemas';
import { isQuickQuestionEnabled } from './quick-question.settings';
import { readWeightKg } from './weight-dose';

/** O que a trilha de auditoria guarda de cada pergunta: desfecho e cartões, nunca o texto. */
interface QuickQuestionAuditPayload {
  outcome: QuickQuestionResponse['outcome'];
  cards: Array<{ cardId: string; version: number; contentSha256: string }>;
  searchStatus: ApplicableCardsResult['trace']['status'] | 'failed';
  gate: string | null;
  questionLength: number;
  piiDetected: boolean;
}

/**
 * CC-501 (ADR-019, emenda da pergunta rápida) — uma dúvida curta respondida
 * só por cartões revisados publicados.
 *
 * 1. A pergunta passa pela máscara (`maskPII`) antes de qualquer outra
 *    coisa: o texto bruto não vai para embedding, log, auditoria nem banco.
 * 2. A mesma busca e o mesmo portão da decisão (CC-406/CC-408): a pergunta
 *    mascarada é a consulta e a hipótese, sem síndrome.
 * 3. Cartão aplicável: a resposta é o cartão, sem reescrita. Nenhum: "ainda
 *    não temos um cartão revisado", a lacuna é registrada e a tela oferece
 *    abrir um caso. Sem busca: diz que a busca está fora, sem lacuna.
 *
 * Nada de texto gerado por IA neste fluxo: o único provedor chamado é o de
 * embedding, pela busca dos cartões.
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
    const cards = search?.cards ?? [];
    await this.record(physicianId, questionId, {
      outcome: response.outcome,
      cards: cards.map(({ card }) => ({
        cardId: card.cardId,
        version: card.version,
        contentSha256: card.contentSha256,
      })),
      searchStatus: search?.trace.status ?? 'failed',
      gate: search?.trace.gate ?? null,
      questionLength: question.length,
      piiDetected: masked.hasPII,
    });
    this.logger.log(
      `QUICK_QUESTION questionId=${questionId} outcome=${response.outcome} ` +
        `search=${search?.trace.status ?? 'failed'} candidates=${search?.trace.candidates ?? 0} ` +
        `cards=[${cards.map(({ card, similarity }) => `${card.cardId}:v${card.version}:${similarity.toFixed(3)}`).join(',')}] ` +
        `pii=${masked.hasPII} latencyMs=${Date.now() - startedAt}`,
    );
    return response;
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
