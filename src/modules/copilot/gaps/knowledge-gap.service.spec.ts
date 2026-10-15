import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import type { KnowledgeGapsService } from '../../knowledge-gaps/knowledge-gaps.service';
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
 * A gravação e o agrupamento são do `KnowledgeGapsService` (testado à parte).
 */
describe('KnowledgeGapService', () => {
  let service: KnowledgeGapService;
  let prisma: { aiInteraction: { findFirst: ReturnType<typeof vi.fn> } };
  let gaps: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { aiInteraction: { findFirst: vi.fn().mockResolvedValue(interaction) } };
    gaps = {
      record: vi.fn().mockResolvedValue({
        recorded: true,
        gapId: 'gap-1',
        groupId: 'group-1',
        newGroup: true,
      }),
    };
    service = new KnowledgeGapService(
      prisma as unknown as PrismaService,
      gaps as unknown as KnowledgeGapsService,
    );
  });

  it('grava a síndrome e as consultas do entendimento, nunca o texto do caso', async () => {
    const result = await service.reportNotFound(physicianId, encounterId, { interactionId });

    expect(result).toEqual({ recorded: true });
    expect(gaps.record).toHaveBeenCalledWith({
      source: 'physician_not_found',
      interactionId,
      syndrome: 'febre',
      searchQueries: ['dengue sinais de alarme', 'hidratação dengue grupo C'],
    });
    expect(JSON.stringify(gaps.record.mock.calls)).not.toContain('plaquetas');
  });

  it('mascara a nota do médico', async () => {
    await service.reportNotFound(physicianId, encounterId, {
      interactionId,
      note: '  Faltou dose de hidratação; paciente CPF 529.982.247-25  ',
    });

    expect(gaps.record).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Faltou dose de hidratação; paciente CPF [REDACTED_CPF]' }),
    );
  });

  it('sem nota nova, não manda nota: o segundo toque mantém a anterior', async () => {
    await service.reportNotFound(physicianId, encounterId, { interactionId, note: '   ' });

    expect(gaps.record.mock.calls[0]![0]).not.toHaveProperty('note');
  });

  it('grava sem síndrome nem consultas quando a análise não registrou o entendimento', async () => {
    prisma.aiInteraction.findFirst.mockResolvedValue({ id: interactionId, rawOutput: {} });

    await service.reportNotFound(physicianId, encounterId, { interactionId });

    expect(gaps.record).toHaveBeenCalledWith(
      expect.objectContaining({ syndrome: null, searchQueries: [] }),
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
    expect(gaps.record).not.toHaveBeenCalled();
  });
});
