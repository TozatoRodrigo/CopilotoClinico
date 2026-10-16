import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { KnowledgeGapSource } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import type { KnowledgeGapReportResponse } from '../../../shared/contracts/clinical';
import { maskFreeText } from '../guardrails/pii-filter';
import { extractUnderstandingSignals } from '../interaction-trace';
import type { KnowledgeGapReportInput } from '../schemas/copilot.schemas';

/**
 * CC-703 — registro de lacunas (`knowledge_gaps`): o que o médico procurou e
 * o Copiloto não tinha.
 *
 * Grava a síndrome de PS e as consultas da busca dirigida que o entendimento
 * da análise registrou, nunca o texto do caso. É o que a fila de criação de
 * cartões (CC-409) agrupa por semana e o painel do beta (CC-705) conta.
 */
@Injectable()
export class KnowledgeGapService {
  private readonly logger = new Logger(KnowledgeGapService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * "Não encontrei o que precisava" numa análise. Tocar de novo na mesma
   * análise atualiza a lacuna (índice único por análise e fonte) em vez de
   * contá-la duas vezes; sem nota nova, a anterior fica.
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

    const source: KnowledgeGapSource = 'physician_not_found';
    const { syndrome, searchQueries } = extractUnderstandingSignals(interaction.rawOutput);
    const note = maskFreeText(input.note);

    const gap = await this.prisma.knowledgeGap.upsert({
      where: { interactionId_source: { interactionId: interaction.id, source } },
      create: { source, interactionId: interaction.id, syndrome, searchQueries, note },
      update: { syndrome, searchQueries, ...(note ? { note } : {}) },
      select: { id: true },
    });

    this.logger.log(
      `KNOWLEDGE_GAP_RECORDED gapId=${gap.id} source=${source} ` +
        `syndromeKnown=${syndrome !== null} queries=${searchQueries.length} hasNote=${note !== null}`,
    );

    return { recorded: true };
  }
}
