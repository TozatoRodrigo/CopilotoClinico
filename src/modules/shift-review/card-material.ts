/**
 * CC-801 — ponto de extensão para os cartões revisados (CC-402, PR #179).
 *
 * A revisão pergunta sobre "os casos e os cartões usados". Hoje a análise não
 * cita cartão (isso chega com o CC-408), então o provedor padrão não devolve
 * nada. Quando os cartões entrarem, um provedor que lê os cartões citados por
 * cada análise substitui o padrão no módulo (`SHIFT_REVIEW_CARD_SOURCE`): o
 * cartão vira mais uma fonte citável da análise, a pergunta que o citar grava
 * `card_id`, e o resto do fluxo (prompt, checagem da fonte, tela) não muda.
 */

/** Um cartão revisado que a análise usou, já na versão publicada. */
export interface ReviewCardMaterial {
  interactionId: string;
  cardId: string;
  versionId: string;
  /** Título do cartão (o tema). */
  title: string;
  /** Pergunta e resposta curta do cartão: o trecho que sustenta a pergunta. */
  excerpt: string;
}

export const SHIFT_REVIEW_CARD_SOURCE = Symbol('SHIFT_REVIEW_CARD_SOURCE');

export interface ShiftReviewCardSource {
  /** Cartões usados pelas análises, só as do próprio médico (quem chama já filtrou). */
  cardsUsedBy(interactionIds: readonly string[]): Promise<ReviewCardMaterial[]>;
}

/** Enquanto a análise não cita cartão: nenhuma fonte a mais. */
export class NoCardSource implements ShiftReviewCardSource {
  async cardsUsedBy(): Promise<ReviewCardMaterial[]> {
    return [];
  }
}
