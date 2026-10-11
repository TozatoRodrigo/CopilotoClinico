import type { CitationOrigin, PreliminaryReason } from '../../../shared/contracts/clinical';
import type { CopilotOutput } from '../guardrails/output-validator';

type RecommendationCategory = CopilotOutput['recommendations'][number]['category'];

/**
 * F0-C / ADR-012 — origens que nenhum médico com CRM verificado assinou.
 * Anexo do médico fica de fora de propósito: já é preliminar pelo validador
 * de saída (F4) e mantém o rótulo de sempre.
 */
const UNREVIEWED_ORIGINS: ReadonlySet<CitationOrigin> = new Set<CitationOrigin>([
  'official_unreviewed',
  'curated_unsigned',
]);

export interface ContainmentContext {
  /**
   * Chunks específicos de um subtipo nos cenários em que a evidência
   * recuperada cobre ≥2 subtipos — ver `ambiguousSubtypeChunkIds`.
   */
  ambiguousSubtypeChunkIds: ReadonlySet<string>;
  /** Kill-switch `UNREVIEWED_SOURCES_PRELIMINARY` (padrão: ligado). */
  unreviewedSourcesPreliminary: boolean;
  /** O turno devolveu perguntas que podem mudar a conduta. */
  hasClarifyingQuestions: boolean;
}

/**
 * F0-C — decide, de forma determinística, se uma recomendação sai preliminar
 * e por quê. Roda depois do validador, nos três caminhos do orquestrador: o
 * prompt pede o mesmo, mas a contenção não pode depender de o modelo obedecer.
 *
 * A ordem dá ao médico o motivo mais acionável quando há mais de um:
 *
 * 1. `subtype_ambiguity` — a evidência cobre subtipos de conduta oposta (AVC
 *    isquêmico × hemorrágico) e a recomendação cita um deles. Conservador
 *    POR DESENHO: marca preliminar mesmo quando o modelo discriminou certo,
 *    porque ainda não há como separar a conduta comum aos subtipos da conduta
 *    que depende do dado discriminante. A Fase 1 (conduta em duas camadas)
 *    é que permite afrouxar isto. Exceção já agora: `stabilization`, que é
 *    segura em qualquer subtipo.
 * 2. `pending_questions` — o modelo marcou preliminar e há perguntas em
 *    aberto: responder pode tornar a conduta definitiva.
 * 3. `unreviewed_source` — cita fonte não assinada por médico (ADR-012).
 *    Responder perguntas não muda isto; só a assinatura da fonte (Fase 2).
 * 4. `pending_questions` — qualquer outro preliminar declarado pelo modelo
 *    (red flag crítica, anexo, último turno): o significado histórico.
 */
export function preliminaryReasonFor(
  recommendation: {
    citationChunkId: string;
    preliminary: boolean;
    origin: CitationOrigin;
    category: RecommendationCategory;
  },
  context: ContainmentContext,
): PreliminaryReason | null {
  // Estabilização (adrenalina na anafilaxia, via aérea, acesso, monitorização)
  // é segura em qualquer subtipo — é a "camada 1" da conduta. Rotulá-la como
  // "depende do dado que discrimina" diria ao médico para esperar justamente
  // o que não pode esperar.
  if (
    recommendation.category !== 'stabilization' &&
    context.ambiguousSubtypeChunkIds.has(recommendation.citationChunkId)
  ) {
    return 'subtype_ambiguity';
  }
  if (recommendation.preliminary && context.hasClarifyingQuestions) return 'pending_questions';
  if (context.unreviewedSourcesPreliminary && UNREVIEWED_ORIGINS.has(recommendation.origin)) {
    return 'unreviewed_source';
  }
  return recommendation.preliminary ? 'pending_questions' : null;
}
