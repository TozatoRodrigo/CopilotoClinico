import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import type { Prisma, RecommendationDecisionKind } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { freeTextHash } from '../../audit/audit-payload';
import { AuditService } from '../../audit/audit.service';
import { maskFreeText } from '../guardrails/pii-filter';
import type { UpsertRecommendationDecisionInput } from '../schemas/copilot.schemas';

const DECISION_SELECT = {
  id: true,
  interactionId: true,
  recommendationIndex: true,
  recommendationKey: true,
  decision: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.RecommendationDecisionSelect;

type DecisionRecord = Prisma.RecommendationDecisionGetPayload<{ select: typeof DECISION_SELECT }>;

/** Quantos hex do sha256 da ação entram na chave — 48 bits bastam dentro de uma análise. */
const ACTION_HASH_HEX_CHARS = 12;

/**
 * Leitura estrutural mínima do `rawOutput` (JSON sem re-validação no banco):
 * só precisamos do texto da ação na posição pedida.
 */
const rawOutputRecommendationsSchema = z.object({
  recommendations: z.array(z.object({ action: z.string() })),
});

/**
 * F0-D — chave estável de uma recomendação dentro de uma análise.
 *
 * Recomendações não têm id. O índice sozinho não diz a qual TEXTO a decisão
 * se refere; o hash sozinho colide quando duas recomendações têm a mesma
 * ação. Juntos, localizam e provam o alvo — e quem lê a tabela consegue
 * conferir contra `ai_interactions.raw_output` sem confiar no cliente.
 */
export function buildRecommendationKey(index: number, action: string): string {
  const actionHash = createHash('sha256').update(action.trim()).digest('hex');
  return `${index}-${actionHash.slice(0, ACTION_HASH_HEX_CHARS)}`;
}

function recommendationActionAt(rawOutput: Prisma.JsonValue, index: number): string | null {
  const parsed = rawOutputRecommendationsSchema.safeParse(rawOutput);
  if (!parsed.success) return null;
  return parsed.data.recommendations[index]?.action ?? null;
}

/**
 * F0-D — decisões do médico por recomendação (adotar / rejeitar / adotar com
 * ajuste), persistidas no servidor.
 *
 * Origem: essas decisões viviam só no sessionStorage do navegador. Eram o
 * sinal mais direto de "o copiloto acertou?" e morriam com a aba do plantão —
 * a equipe nunca via que uma conduta era rejeitada sistematicamente.
 *
 * Toda operação é escopada pelo médico dono do encontro (sem IDOR):
 * encontro/análise inexistente e de outro médico devolvem o mesmo 404.
 */
@Injectable()
export class RecommendationDecisionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async upsert(
    physicianId: string,
    encounterId: string,
    input: UpsertRecommendationDecisionInput,
  ): Promise<DecisionRecord> {
    const interaction = await this.prisma.aiInteraction.findFirst({
      where: { id: input.interactionId, encounter: { id: encounterId, physicianId } },
      select: { id: true, rawOutput: true },
    });
    if (!interaction) throw new NotFoundException('Analysis not found for this encounter');

    const action = recommendationActionAt(interaction.rawOutput, input.recommendationIndex);
    if (action === null) {
      throw new BadRequestException('Recommendation index does not exist in this analysis');
    }

    const recommendationKey = buildRecommendationKey(input.recommendationIndex, action);
    const decision: RecommendationDecisionKind = input.decision;
    const note = maskFreeText(input.note);
    const uniqueKey = {
      interactionId_recommendationKey_physicianId: {
        interactionId: interaction.id,
        recommendationKey,
        physicianId,
      },
    };

    // Reenvio idêntico (fila offline do navegador, retry de rede) não gera
    // uma segunda entrada na trilha de auditoria.
    const existing = await this.prisma.recommendationDecision.findUnique({
      where: uniqueKey,
      select: DECISION_SELECT,
    });
    if (existing && existing.decision === decision && existing.note === note) return existing;

    const saved = await this.prisma.recommendationDecision.upsert({
      where: uniqueKey,
      create: {
        encounterId,
        interactionId: interaction.id,
        physicianId,
        recommendationIndex: input.recommendationIndex,
        recommendationKey,
        decision,
        note,
      },
      update: { decision, note },
      select: DECISION_SELECT,
    });

    // Como no DEC-005 com as respostas: a trilha guarda o hash da nota (a
    // mesma que foi gravada, já mascarada), nunca o texto — a trilha é
    // append-only e não é apagada no pedido de eliminação (LGPD).
    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_RECOMMENDATION_DECIDED',
      entity: 'AiInteraction',
      entityId: interaction.id,
      payload: {
        encounterId,
        recommendationKey,
        decision,
        previousDecision: existing?.decision ?? null,
        noteHash: freeTextHash(note),
      },
    });

    return saved;
  }

  async list(
    physicianId: string,
    encounterId: string,
    interactionId: string,
  ): Promise<DecisionRecord[]> {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, physicianId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');

    return this.prisma.recommendationDecision.findMany({
      where: { encounterId, interactionId, physicianId },
      orderBy: { recommendationIndex: 'asc' },
      select: DECISION_SELECT,
    });
  }
}
