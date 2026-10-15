import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import type { KnowledgeGapReportResponse } from '../../../shared/contracts/clinical';
import { KnowledgeGapsService } from '../../knowledge-gaps/knowledge-gaps.service';
import { maskFreeText } from '../guardrails/pii-filter';
import { extractUnderstandingSignals } from '../interaction-trace';
import type { KnowledgeGapReportInput } from '../schemas/copilot.schemas';

/**
 * CC-703 — "não encontrei o que precisava": o que o médico procurou e o
 * Copiloto não tinha.
 *
 * Grava a síndrome de PS e as consultas da busca dirigida que o entendimento
 * da análise registrou, nunca o texto do caso. CC-409 — a gravação é a do
 * registro único de lacunas (`KnowledgeGapsService`), que agrupa com as
 * lacunas da decisão e da pergunta rápida para a fila de cartões.
 */
@Injectable()
export class KnowledgeGapService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KnowledgeGapsService) private readonly gaps: KnowledgeGapsService,
  ) {}

  /**
   * Tocar de novo na mesma análise atualiza a lacuna (índice único por
   * análise e fonte) em vez de contá-la duas vezes; sem nota nova, a
   * anterior fica.
   */
  async reportNotFound(
    physicianId: string,
    encounterId: string,
    input: KnowledgeGapReportInput,
  ): Promise<KnowledgeGapReportResponse> {
    const interaction = await this.prisma.aiInteraction.findFirst({
      where: { id: input.interactionId, encounter: { id: encounterId, physicianId } },
      select: { id: true, rawOutput: true },
    });

    // Mesmo tratamento de encounter inexistente e de encounter de outro
    // médico: não confirmar a existência de um atendimento alheio.
    if (!interaction) throw new NotFoundException('Analysis not found for this encounter');

    const { syndrome, searchQueries } = extractUnderstandingSignals(interaction.rawOutput);
    const note = maskFreeText(input.note);

    await this.gaps.record({
      source: 'physician_not_found',
      interactionId: interaction.id,
      syndrome,
      searchQueries,
      // Sem nota nova, a anterior fica.
      ...(note ? { note } : {}),
    });

    return { recorded: true };
  }
}
