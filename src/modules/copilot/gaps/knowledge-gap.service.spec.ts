import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import { KnowledgeGapService } from './knowledge-gap.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const interactionId = '33333333-3333-4333-8333-333333333333';

const CASE_TEXT = 'Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária.';

const interaction = {
  id: interactionId,
  rawOutput: {
    reasoning: CASE_TEXT,
    understanding: {
      problemRepresentation: CASE_TEXT,
      syndrome: 'febre',
      searchQueries: ['dengue sinais de alarme', 'hidratação dengue grupo C'],
    },
  },
};

/**
 * CC-703 — "não encontrei o que precisava" alimenta o registro de lacunas
 * (CC-409). O que importa aqui é o que NÃO entra: nada do texto do caso; só a
 * síndrome e as consultas que o entendimento registrou, e a nota mascarada.
 */
describe('KnowledgeGapService', () => {
  let service: KnowledgeGapService;
  let prisma: {
    aiInteraction: { findFirst: ReturnType<typeof vi.fn> };
    knowledgeGap: { upsert: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      aiInteraction: { findFirst: vi.fn().mockResolvedValue(interaction) },
      knowledgeGap: { upsert: vi.fn().mockResolvedValue({ id: 'gap-1' }) },
    };
    service = new KnowledgeGapService(prisma as unknown as PrismaService);
  });

  it('grava a síndrome e as consultas do entendimento, nunca o texto do caso', async () => {
    const result = await service.reportNotFound(physicianId, encounterId, { interactionId });

    expect(result).toEqual({ recorded: true });
    expect(prisma.knowledgeGap.upsert).toHaveBeenCalledWith({
      where: { interactionId_source: { interactionId, source: 'physician_not_found' } },
      create: {
        source: 'physician_not_found',
        interactionId,
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme', 'hidratação dengue grupo C'],
        note: null,
      },
      update: {
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme', 'hidratação dengue grupo C'],
      },
      select: { id: true },
    });
    expect(JSON.stringify(prisma.knowledgeGap.upsert.mock.calls)).not.toContain('plaquetas');
  });

  it('mascara a nota do médico e a atualiza num segundo toque', async () => {
    await service.reportNotFound(physicianId, encounterId, {
      interactionId,
      note: '  Faltou dose de hidratação; paciente CPF 529.982.247-25  ',
    });

    const call = prisma.knowledgeGap.upsert.mock.calls[0]![0] as {
      create: { note: string };
      update: { note: string };
    };
    const masked = 'Faltou dose de hidratação; paciente CPF [REDACTED_CPF]';
    expect(call.create.note).toBe(masked);
    expect(call.update.note).toBe(masked);
  });

  it('grava sem síndrome nem consultas quando a análise não registrou o entendimento', async () => {
    prisma.aiInteraction.findFirst.mockResolvedValue({ id: interactionId, rawOutput: {} });

    await service.reportNotFound(physicianId, encounterId, { interactionId });

    expect(prisma.knowledgeGap.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ syndrome: null, searchQueries: [] }),
      }),
    );
  });

  it('não aceita lacuna sobre a análise de outro médico', async () => {
    prisma.aiInteraction.findFirst.mockResolvedValue(null);

    await expect(
      service.reportNotFound('physician-2', encounterId, { interactionId }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: interactionId, encounter: { id: encounterId, physicianId: 'physician-2' } },
      }),
    );
    expect(prisma.knowledgeGap.upsert).not.toHaveBeenCalled();
  });
});
