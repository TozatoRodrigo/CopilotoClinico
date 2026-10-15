/**
 * Procedência de um conteúdo clínico das Ferramentas (ADR-017): de onde veio,
 * em que versão está e quem revisou. Toda definição de calculadora, droga ou
 * roteiro carrega isso; a tela mostra no rodapé da ferramenta.
 */
export type ClinicalReview =
  | {
      status: 'pendente';
      /** Médico designado para revisar, quando já há um ("Dr. Ripardo"). */
      assignedTo?: string;
    }
  | {
      status: 'revisado';
      /** Nome do médico revisor. */
      reviewer: string;
      crm: string;
      /** Data da revisão (AAAA-MM-DD). */
      reviewedAt: string;
    };

export interface ContentProvenance {
  /** Origem do conteúdo (ex.: arquivo e revisão do ANY App). */
  source: string;
  /** Versão do conteúdo no Copiloto; sobe a cada mudança clínica. */
  version: string;
  /** Data da última mudança (AAAA-MM-DD). */
  updatedAt: string;
  review: ClinicalReview;
}

/** Calculadoras portadas do `calculatorData.ts` do ANY App v4. */
export const ANY_V4_CALCULATOR_SOURCE = 'ANY App v4 · calculatorData.ts (95c8fba)';
