import { Injectable, Logger } from '@nestjs/common';

/**
 * CC-501 — lacuna da pergunta rápida: a busca rodou e nenhum cartão revisado
 * serve. É o insumo da fila de criação de cartões (CC-409).
 *
 * Ponto de extensão (`KNOWLEDGE_GAP_RECORDER`). Hoje a lacuna vai só para o
 * log, no formato do `REVIEWED_CARDS_GAP` da decisão (contagens, sem texto).
 * Quando a tabela `knowledge_gaps` do PR #185 (CC-703) estiver na base, a
 * implementação que grava nela:
 *
 * 1. acrescenta `quick_question` ao enum `KnowledgeGapSource` (migration nova);
 * 2. grava `{ source: 'quick_question', interactionId: null, syndrome: null,
 *    searchQueries: [maskedQuestion] }` — a pergunta já mascarada é a
 *    "consulta" da lacuna, como as `searchQueries` da análise;
 * 3. entra no lugar de `LoggedKnowledgeGapRecorder` no `QuickQuestionModule`.
 *
 * A retenção do texto mascarado passa a ser a das lacunas (ver a emenda da
 * pergunta rápida na ADR-019).
 */
export interface QuickQuestionGap {
  questionId: string;
  /** A pergunta depois de `maskPII` — nunca o texto bruto. */
  maskedQuestion: string;
  institutionId: string | null;
  /** Cartões que a busca achou e o portão recusou. */
  candidates: number;
}

export interface KnowledgeGapRecorder {
  /** Vai para o log. */
  readonly name: string;
  /** `true` quando a lacuna ficou registrada. Lançar não derruba a resposta. */
  record(gap: QuickQuestionGap): Promise<boolean>;
}

export const KNOWLEDGE_GAP_RECORDER = Symbol('KNOWLEDGE_GAP_RECORDER');

/** Implementação de hoje: a contagem no log, sem a pergunta. */
@Injectable()
export class LoggedKnowledgeGapRecorder implements KnowledgeGapRecorder {
  readonly name = 'log';
  private readonly logger = new Logger(LoggedKnowledgeGapRecorder.name);

  async record(gap: QuickQuestionGap): Promise<boolean> {
    this.logger.log(
      `QUICK_QUESTION_GAP questionId=${gap.questionId} syndrome=- ` +
        `institution=${gap.institutionId ?? '-'} candidates=${gap.candidates}`,
    );
    return true;
  }
}
