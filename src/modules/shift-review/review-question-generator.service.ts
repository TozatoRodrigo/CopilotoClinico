import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../ai-gateway/ai-gateway.errors';
import type { ChatMessage, CompletionUsage } from '../ai-gateway/providers/provider.interface';
import { calculateInferenceCost } from '../copilot/orchestrator/model-pricing';
import { validateStructured } from '../copilot/understanding/case-understanding.schema';
import type { ReviewMaterial } from './review-material';
import {
  buildReviewQuestionsMessages,
  reviewQuestionsRetryFeedback,
} from './review-questions-prompt';
import {
  checkReviewQuestions,
  REVIEW_QUESTIONS_JSON_SCHEMA,
  ReviewQuestionsOutputSchema,
  type CheckedReviewQuestion,
} from './review-questions.schema';
import {
  QUESTIONS_PER_REVIEW,
  readShiftReviewEffort,
  readShiftReviewModel,
} from './shift-review.settings';

export type ReviewGenerationOutcome =
  | {
      kind: 'generated';
      questions: CheckedReviewQuestion[];
      model: string | null;
      cost: number;
      latencyMs: number;
    }
  | {
      kind: 'failed';
      /** Código curto, cabe em `shift_reviews.failure_reason`. */
      reason: string;
      model: string | null;
      cost: number;
      latencyMs: number;
    };

type Attempt =
  | { kind: 'checked'; accepted: CheckedReviewQuestion[]; errors: string[]; content: string }
  | { kind: 'invalid'; errors: string[]; content: string }
  | { kind: 'failed'; reason: string };

interface Tally {
  model: string | null;
  cost: number;
}

const MAX_REASON_CHARS = 64;

function acceptedCount(attempt: Attempt): number {
  return attempt.kind === 'checked' ? attempt.accepted.length : 0;
}

/**
 * CC-801 — gera as perguntas da revisão numa chamada com saída estruturada
 * (etapa `review_questions` no rastro).
 *
 * Pergunta com fonte que a análise não citou, com dado do paciente ou fora
 * das regras fica de fora. Se faltar pergunta, UM retry com o feedback do
 * validador; vale a tentativa com mais perguntas aceitas. Nenhuma aceita
 * (ou erro do provedor) devolve `failed` — a revisão pode ser pedida de novo.
 */
@Injectable()
export class ReviewQuestionGenerator {
  private readonly logger = new Logger('ShiftReviewQuestions');

  constructor(
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async generate(material: ReviewMaterial): Promise<ReviewGenerationOutcome> {
    const startedAt = Date.now();
    const tally: Tally = { model: null, cost: 0 };
    const messages = buildReviewQuestionsMessages(material, QUESTIONS_PER_REVIEW);

    const first = await this.attempt(messages, material, tally);
    let settled = first;
    if (first.kind !== 'failed' && acceptedCount(first) < QUESTIONS_PER_REVIEW) {
      this.logger.warn(`REVIEW_QUESTIONS_RETRY: ${first.errors.join(' | ')}`);
      const retried = await this.attempt(
        [
          ...messages,
          ...(first.content ? [{ role: 'assistant' as const, content: first.content }] : []),
          {
            role: 'user',
            content: reviewQuestionsRetryFeedback(first.errors, QUESTIONS_PER_REVIEW),
          },
        ],
        material,
        tally,
      );
      if (acceptedCount(retried) > acceptedCount(first)) settled = retried;
    }

    const latencyMs = Date.now() - startedAt;
    if (settled.kind === 'checked' && settled.accepted.length > 0) {
      this.logger.log(
        `REVIEW_QUESTIONS model=${tally.model} latencyMs=${latencyMs} ` +
          `accepted=${settled.accepted.length} rejected=${settled.errors.length > 0 ? 'yes' : 'no'}`,
      );
      return {
        kind: 'generated',
        questions: settled.accepted.slice(0, QUESTIONS_PER_REVIEW),
        model: tally.model,
        cost: tally.cost,
        latencyMs,
      };
    }

    const reason =
      settled.kind === 'failed'
        ? settled.reason
        : settled.kind === 'invalid'
          ? 'invalid_output'
          : 'no_valid_questions';
    this.logger.warn(
      `REVIEW_QUESTIONS_FAILED model=${tally.model ?? '-'} latencyMs=${latencyMs} reason=${reason}`,
    );
    return {
      kind: 'failed',
      reason: reason.slice(0, MAX_REASON_CHARS),
      model: tally.model,
      cost: tally.cost,
      latencyMs,
    };
  }

  private async attempt(
    messages: ChatMessage[],
    material: ReviewMaterial,
    tally: Tally,
  ): Promise<Attempt> {
    try {
      const completion = await this.aiGateway.complete({
        messages,
        model: readShiftReviewModel(this.config),
        effort: readShiftReviewEffort(this.config),
        responseSchema: REVIEW_QUESTIONS_JSON_SCHEMA,
        stage: 'review_questions',
      });
      this.account(tally, completion.model, completion.usage);
      const validation = validateStructured(ReviewQuestionsOutputSchema, completion.content);
      if (!validation.valid) {
        return { kind: 'invalid', errors: validation.errors, content: completion.content };
      }
      const { accepted, errors } = checkReviewQuestions(validation.value, material);
      const missing =
        accepted.length < QUESTIONS_PER_REVIEW
          ? [`questions: write exactly ${QUESTIONS_PER_REVIEW} valid questions`]
          : [];
      return {
        kind: 'checked',
        accepted,
        errors: [...errors, ...missing],
        content: completion.content,
      };
    } catch (error) {
      if (error instanceof AiRefusalError) {
        this.account(tally, error.details.model, error.details.usage);
        return { kind: 'failed', reason: 'refusal' };
      }
      if (error instanceof AiTruncatedError) {
        this.account(tally, error.details.model, error.details.usage);
        return { kind: 'failed', reason: 'truncated' };
      }
      // Só a classe do erro: a mensagem do provedor não vai para o banco.
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`REVIEW_QUESTIONS_PROVIDER_ERROR: ${name}`);
      return { kind: 'failed', reason: `provider_error:${name}` };
    }
  }

  private account(tally: Tally, model: string, usage: CompletionUsage): void {
    tally.model = model;
    tally.cost += calculateInferenceCost({ model, usage });
  }
}
