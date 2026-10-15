import { Inject, Injectable, Logger } from '@nestjs/common';
import { KnowledgeGapsService } from '../knowledge-gaps/knowledge-gaps.service';

/**
 * CC-501 — lacuna da pergunta rápida: a busca rodou e nenhum cartão revisado
 * serve. É o insumo da fila de criação de cartões (CC-409).
 *
 * Ponto de extensão (`KNOWLEDGE_GAP_RECORDER`): o serviço da pergunta rápida
 * não sabe onde a lacuna fica. CC-409 — fica em `knowledge_gaps`, com as
 * lacunas da análise e da decisão (`StoredKnowledgeGapRecorder`).
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

/**
 * CC-409 — a lacuna vai para `knowledge_gaps` com `source = quick_question`,
 * sem análise e sem síndrome: a pergunta mascarada é a "consulta" da lacuna,
 * como as `searchQueries` da análise. Nem o médico nem a instituição são
 * gravados ("lacunas não têm médico"). A retenção é a das lacunas (180 dias,
 * `KNOWLEDGE_GAP_RETENTION_DAYS`).
 */
@Injectable()
export class StoredKnowledgeGapRecorder implements KnowledgeGapRecorder {
  readonly name = 'knowledge_gaps';
  private readonly logger = new Logger(StoredKnowledgeGapRecorder.name);

  constructor(@Inject(KnowledgeGapsService) private readonly gaps: KnowledgeGapsService) {}

  async record(gap: QuickQuestionGap): Promise<boolean> {
    const result = await this.gaps.record({
      source: 'quick_question',
      interactionId: null,
      syndrome: null,
      searchQueries: [gap.maskedQuestion],
    });
    this.logger.log(
      `QUICK_QUESTION_GAP questionId=${gap.questionId} groupId=${result.groupId} ` +
        `newGroup=${result.newGroup} institution=${gap.institutionId ?? '-'} ` +
        `candidates=${gap.candidates}`,
    );
    return result.recorded;
  }
}
