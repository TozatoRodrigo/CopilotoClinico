import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CopilotFeedbackService } from './copilot-feedback.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const curatorId = '44444444-4444-4444-8444-444444444444';
const encounterId = '22222222-2222-4222-8222-222222222222';
const feedbackId = '55555555-5555-4555-8555-555555555555';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const interaction = {
  id: '33333333-3333-4333-8333-333333333333',
  model: 'claude-sonnet',
  turnIndex: 0,
  retrievedChunkIds: ['chunk-sepse-1', 'chunk-sepse-2'],
  params: { retrievalCoverage: 'partial' },
  citations: [{ chunkId: 'chunk-sepse-1', source: 'Surviving Sepsis Campaign' }],
};

function triageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: feedbackId,
    kind: 'wrong_scenario',
    comment: 'Era dengue, foi para sepse.',
    status: 'new',
    triageNote: null,
    triagedBy: null,
    triagedAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    encounterId,
    physicianId,
    interaction: {
      ...interaction,
      inputRedacted: 'Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária.',
      rawOutput: {
        reasoning: 'Quadro séptico.',
        differentials: [
          { hypothesis: 'Sepse de foco indeterminado', whyConsider: 'x', whatDistinguishes: 'y' },
          { hypothesis: 'Dengue com sinais de alarme', whyConsider: 'x', whatDistinguishes: 'y' },
        ],
        recommendations: [
          {
            action: 'Coletar hemoculturas',
            rationale: 'Sepse',
            citationChunkId: 'chunk-sepse-1',
            confidence: 0.8,
            preliminary: false,
          },
        ],
        clarifyingQuestions: [
          { id: 'q1', question: 'Há sangramento?', why: 'x', criticality: 'blocker' },
        ],
        uncertainty: false,
      },
      createdAt: new Date('2026-10-01T09:59:00.000Z'),
    },
    ...overrides,
  };
}

describe('CopilotFeedbackService', () => {
  let service: CopilotFeedbackService;
  let prisma: {
    aiInteraction: { findFirst: ReturnType<typeof vi.fn> };
    copilotFeedback: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      aiInteraction: { findFirst: vi.fn().mockResolvedValue(interaction) },
      copilotFeedback: {
        create: vi.fn().mockResolvedValue({ id: feedbackId }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ id: feedbackId, status: 'new', triageNote: null }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve(triageRow(data))),
      },
    };
    audit = { log: vi.fn().mockResolvedValue({ id: 'audit-entry-1' }) };
    service = new CopilotFeedbackService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  /**
   * F7 — o botão "cenário errado". Os dois erros clínicos que motivaram
   * KB-005/KB-006 chegaram por mensagem, dias depois, sem interactionId nem
   * chunks recuperados. O valor destes testes está no PAYLOAD: sem o rastro
   * técnico, o reporte não vira caso de regressão.
   */
  describe('submit', () => {
    it('registra o feedback com o rastro técnico necessário para reproduzir o caso', async () => {
      const result = await service.submit(physicianId, encounterId, {
        interactionId: interaction.id,
        kind: 'wrong_scenario',
        comment: 'Era dengue, foi para sepse.',
      });

      expect(result).toEqual({ recorded: true });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'COPILOT_FEEDBACK',
        entity: 'AiInteraction',
        entityId: interaction.id,
        payload: {
          encounterId,
          kind: 'wrong_scenario',
          commentHash: sha256('Era dengue, foi para sepse.'),
          model: 'claude-sonnet',
          turnIndex: 0,
          retrievedChunkIds: ['chunk-sepse-1', 'chunk-sepse-2'],
          retrievalCoverage: 'partial',
          citedChunkIds: ['chunk-sepse-1'],
        },
      });
    });

    // F0-D — antes o reporte só existia na trilha; ninguém triava.
    it('entra na fila de triagem ligado à entrada da trilha de auditoria', async () => {
      await service.submit(physicianId, encounterId, {
        interactionId: interaction.id,
        kind: 'missing_coverage',
      });

      expect(prisma.copilotFeedback.create).toHaveBeenCalledWith({
        data: {
          interactionId: interaction.id,
          encounterId,
          physicianId,
          kind: 'missing_coverage',
          comment: null,
          auditLogId: 'audit-entry-1',
        },
        select: { id: true },
      });
    });

    /**
     * A trilha é append-only e a eliminação LGPD não a alcança. A máscara não
     * pega nome de paciente, então o texto — mesmo mascarado — fica só na
     * fila (apagada com o atendimento); a trilha leva o hash.
     */
    it('mascara PII do comentário na fila; a trilha leva só o hash do texto', async () => {
      await service.submit(physicianId, encounterId, {
        interactionId: interaction.id,
        kind: 'wrong_recommendation',
        comment: 'Maria Silva, CPF 529.982.247-25, tel (11) 98765-4321, alérgica a dipirona',
      });

      const masked = 'Maria Silva, CPF [REDACTED_CPF], tel [REDACTED_PHONE], alérgica a dipirona';
      const createCall = prisma.copilotFeedback.create.mock.calls[0]![0] as {
        data: { comment: string };
      };
      expect(createCall.data.comment).toBe(masked);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ commentHash: sha256(masked) }),
        }),
      );
      const trail = JSON.stringify(audit.log.mock.calls);
      expect(trail).not.toContain('Maria Silva');
      expect(trail).not.toContain('529.982.247-25');
    });

    it('não aceita feedback sobre a análise de outro médico', async () => {
      // O findFirst já filtra por physicianId — não confirmar a existência de
      // um atendimento alheio faz parte do contrato.
      prisma.aiInteraction.findFirst.mockResolvedValue(null);

      await expect(
        service.submit('physician-2', encounterId, {
          interactionId: interaction.id,
          kind: 'wrong_scenario',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: interaction.id, encounter: { id: encounterId, physicianId: 'physician-2' } },
        }),
      );
      expect(audit.log).not.toHaveBeenCalled();
      expect(prisma.copilotFeedback.create).not.toHaveBeenCalled();
    });
  });

  describe('listForTriage', () => {
    it('filtra por status e pagina, mais recentes primeiro', async () => {
      await service.listForTriage({ status: 'new', limit: 20, offset: 40 });

      expect(prisma.copilotFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'new' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          skip: 40,
        }),
      );
      expect(prisma.copilotFeedback.count).toHaveBeenCalledWith({ where: { status: 'new' } });
    });

    it('filtra também por tipo de reporte', async () => {
      await service.listForTriage({ status: 'new', kind: 'wrong_scenario', limit: 20, offset: 0 });

      expect(prisma.copilotFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'new', kind: 'wrong_scenario' } }),
      );
    });

    it('sem status lista todos', async () => {
      await service.listForTriage({ limit: 20, offset: 0 });

      expect(prisma.copilotFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('junta o caso, o modelo, a cobertura e uma visão compacta da saída', async () => {
      prisma.copilotFeedback.findMany.mockResolvedValue([triageRow()]);
      prisma.copilotFeedback.count.mockResolvedValue(1);

      const page = await service.listForTriage({ limit: 20, offset: 0 });

      expect(page.total).toBe(1);
      expect(page.items[0]).toEqual({
        id: feedbackId,
        kind: 'wrong_scenario',
        comment: 'Era dengue, foi para sepse.',
        status: 'new',
        triageNote: null,
        triagedBy: null,
        triagedAt: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        encounterId,
        physicianId,
        interaction: {
          id: interaction.id,
          model: 'claude-sonnet',
          turnIndex: 0,
          inputRedacted: 'Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária.',
          retrievalCoverage: 'partial',
          retrievedChunkIds: ['chunk-sepse-1', 'chunk-sepse-2'],
          citedChunkIds: ['chunk-sepse-1'],
          output: {
            mainHypothesis: 'Sepse de foco indeterminado',
            recommendations: [
              {
                action: 'Coletar hemoculturas',
                preliminary: false,
                citationChunkId: 'chunk-sepse-1',
              },
            ],
            questions: [{ question: 'Há sangramento?', criticality: 'blocker' }],
            uncertainty: false,
          },
          createdAt: '2026-10-01T09:59:00.000Z',
        },
      });
    });

    it('não derruba a fila quando o rawOutput de uma análise antiga está incompleto', async () => {
      prisma.copilotFeedback.findMany.mockResolvedValue([
        triageRow({
          interaction: { ...triageRow().interaction, rawOutput: { reasoning: 'antigo' } },
        }),
      ]);

      const page = await service.listForTriage({ limit: 20, offset: 0 });

      expect(page.items[0]!.interaction.output).toEqual({
        mainHypothesis: null,
        recommendations: [],
        questions: [],
        uncertainty: false,
      });
    });

    it('conta por status para as abas, com zero nos status vazios', async () => {
      prisma.copilotFeedback.groupBy.mockResolvedValue([
        { status: 'new', _count: { _all: 7 } },
        { status: 'dismissed', _count: { _all: 2 } },
      ]);

      const page = await service.listForTriage({ limit: 20, offset: 0 });

      expect(page.countsByStatus).toEqual({
        new: 7,
        triaged: 0,
        converted_to_eval_case: 0,
        dismissed: 2,
      });
    });
  });

  describe('updateTriage', () => {
    it('registra quem triou e quando, com a nota mascarada', async () => {
      await service.updateTriage(curatorId, feedbackId, {
        status: 'converted_to_eval_case',
        triageNote: 'Virou campo-ab12; paciente CPF 529.982.247-25',
      });

      expect(prisma.copilotFeedback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: feedbackId },
          data: {
            status: 'converted_to_eval_case',
            triageNote: 'Virou campo-ab12; paciente CPF [REDACTED_CPF]',
            triagedBy: curatorId,
            triagedAt: expect.any(Date),
          },
        }),
      );
    });

    it('audita a transição com o hash da nota, nunca o texto', async () => {
      const storedNote = 'Base sem diretriz de dengue';

      await service.updateTriage(curatorId, feedbackId, {
        status: 'triaged',
        triageNote: storedNote,
      });

      expect(audit.log).toHaveBeenCalledWith({
        actorId: curatorId,
        action: 'COPILOT_FEEDBACK_TRIAGED',
        entity: 'CopilotFeedback',
        entityId: feedbackId,
        payload: {
          from: 'new',
          to: 'triaged',
          triageNoteHash: sha256(storedNote),
        },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('dengue');
    });

    it('mantém a nota atual quando o PATCH só muda o status', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue({
        id: feedbackId,
        status: 'triaged',
        triageNote: 'Já analisado',
      });

      await service.updateTriage(curatorId, feedbackId, { status: 'dismissed' });

      expect(prisma.copilotFeedback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'dismissed', triageNote: 'Já analisado' }),
        }),
      );
    });

    it('reabrir (voltar para new) limpa quem triou', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue({
        id: feedbackId,
        status: 'dismissed',
        triageNote: null,
      });

      await service.updateTriage(curatorId, feedbackId, { status: 'new' });

      expect(prisma.copilotFeedback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'new', triageNote: null, triagedBy: null, triagedAt: null },
        }),
      );
    });

    it('devolve 404 para feedback inexistente', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTriage(curatorId, feedbackId, { status: 'triaged' }),
      ).rejects.toThrow(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  /**
   * CC-703 — "virou caso" deixa de ser só um rótulo: o curador baixa o
   * rascunho do caso. O formato e a máscara estão em eval-case-draft.spec.ts;
   * aqui, o que o serviço junta do banco e deixa na trilha.
   */
  describe('exportEvalCaseDraft', () => {
    const draftRow = {
      id: feedbackId,
      kind: 'wrong_scenario',
      comment: 'Era dengue, foi para sepse.',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      encounter: { context: { hasCT: true, isSus: true, hasLab: true, hasICU: false } },
      interaction: {
        model: 'claude-sonnet',
        turnIndex: 0,
        inputRedacted:
          'Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária. CPF 529.982.247-25.',
        answeredQuestions: null,
        params: { retrievalCoverage: 'partial' },
        rawOutput: { differentials: [{ hypothesis: 'Sepse de foco indeterminado' }] },
      },
    };

    it('monta o rascunho com o caso, a análise e o contexto do atendimento', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue(draftRow);

      const draft = await service.exportEvalCaseDraft(curatorId, feedbackId);

      expect(prisma.copilotFeedback.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: feedbackId } }),
      );
      expect(draft.id).toBe('campo-55555555');
      expect(draft.provenance.origin).toBe(`feedback:${feedbackId}`);
      expect(draft.input.caseText).toContain('CPF [REDACTED_CPF]');
      expect(draft.input.context).toEqual(draftRow.encounter.context);
    });

    it('registra a exportação na trilha, sem o texto do caso', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue(draftRow);

      await service.exportEvalCaseDraft(curatorId, feedbackId);

      expect(audit.log).toHaveBeenCalledWith({
        actorId: curatorId,
        action: 'COPILOT_FEEDBACK_EVAL_CASE_EXPORTED',
        entity: 'CopilotFeedback',
        entityId: feedbackId,
        payload: { draftId: 'campo-55555555' },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('Febre');
    });

    it('devolve 404 para feedback inexistente, sem registrar nada', async () => {
      prisma.copilotFeedback.findUnique.mockResolvedValue(null);

      await expect(service.exportEvalCaseDraft(curatorId, feedbackId)).rejects.toThrow(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
