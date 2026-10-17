import type {
  QuickQuestionRefusalReason,
  QuickQuestionScope,
} from '../../../shared/contracts/quick-question';

/**
 * CC-503 — guarda de escopo da pergunta rápida: só dúvida clínica de pronto-
 * socorro segue para a busca. Caso inteiro, assunto administrativo ou não
 * clínico e tentativa de dar instruções ao sistema recebem recusa educada —
 * sem busca, sem embedding e sem lacuna (uma pergunta fora do produto não é
 * cartão que falta).
 *
 * Duas implementações pelo token `QUICK_QUESTION_SCOPE_GUARD`, escolhidas a
 * cada pergunta por `QUICK_QUESTION_SCOPE_GUARD=heuristic|jev`: a
 * determinística (heurística + a barreira de injeção do Copiloto) e a do Jev
 * (TypeSafe, classificação calibrada), que cai na determinística quando falha.
 * A guarda recebe a pergunta já mascarada.
 */

/** Veredito com o que vai para o log e a trilha: classe, motivo e sinais — sem texto. */
export type QuickQuestionScopeVerdict =
  | {
      inScope: true;
      scope: 'clinical';
      reason: null;
      /** Probabilidade calibrada do Jev; `null` na heurística. */
      confidence: number | null;
      /** Quem decidiu: `heuristic` ou `jev`. */
      guard: string;
      /** Nomes das regras ou motivos que pesaram (ex.: `jev_low_confidence`). */
      signals: string[];
    }
  | {
      inScope: false;
      scope: Exclude<QuickQuestionScope, 'clinical'>;
      reason: QuickQuestionRefusalReason;
      confidence: number | null;
      guard: string;
      signals: string[];
    };

export interface QuickQuestionScopeGuard {
  /** Vai para o log e para a trilha. */
  readonly name: string;
  /**
   * Classifica a pergunta já mascarada. Lançar = a guarda não decidiu; quem
   * escolhe a guarda cai na determinística.
   */
  classify(maskedQuestion: string): Promise<QuickQuestionScopeVerdict>;
}

export const QUICK_QUESTION_SCOPE_GUARD = Symbol('QUICK_QUESTION_SCOPE_GUARD');

/** Classe da história (Jev Choice) a partir do motivo da recusa. */
export function scopeOf(
  reason: QuickQuestionRefusalReason,
): Exclude<QuickQuestionScope, 'clinical'> {
  return reason === 'administrative' ? 'administrative' : 'out_of_scope';
}

export function refuse(
  reason: QuickQuestionRefusalReason,
  guard: string,
  signals: string[],
  confidence: number | null = null,
): QuickQuestionScopeVerdict {
  return { inScope: false, scope: scopeOf(reason), reason, confidence, guard, signals };
}

export function accept(
  guard: string,
  signals: string[],
  confidence: number | null = null,
): QuickQuestionScopeVerdict {
  return { inScope: true, scope: 'clinical', reason: null, confidence, guard, signals };
}
