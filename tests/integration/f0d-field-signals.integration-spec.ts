/**
 * Testes de integração — F0-D: sinais do campo (decisões por recomendação e
 * fila de triagem do feedback).
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (20261010120000_f0d_recommendation_decisions e
 * 20261010120100_f0d_copilot_feedback) e a role `copiloto_app` da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: os GRANTs reais para a role
 * de runtime, o índice único que sustenta o upsert, o CASCADE do apagamento
 * LGPD e o backfill idempotente contra a trilha de auditoria de verdade.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import { RecommendationDecisionsService } from '../../src/modules/copilot/decisions/recommendation-decisions.service';
import { CopilotFeedbackService } from '../../src/modules/copilot/feedback/copilot-feedback.service';
import { backfillCopilotFeedback } from '../../src/modules/copilot/feedback/copilot-feedback-backfill';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';

const RUNTIME_ROLE = 'copiloto_app';
const F0D_TABLES = ['recommendation_decisions', 'copilot_feedback'] as const;

describe('F0-D — sinais do campo (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let physicianId: string;
  let encounterId: string;
  let interactionId: string;

  beforeAll(async () => {
    prisma = await connectTestDb();
    audit = new AuditService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: '@f0d.test' } } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: '@f0d.test' } } });
    await clearAuditLog(prisma);

    const physician = await prisma.physician.create({
      data: {
        email: `medico-${Date.now()}@f0d.test`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000099',
      },
    });
    physicianId = physician.id;
    const encounter = await prisma.encounter.create({
      data: { physicianId, patientRef: 'F0D-001' },
    });
    encounterId = encounter.id;
    const interaction = await prisma.aiInteraction.create({
      data: {
        encounterId,
        model: 'test-model',
        latencyMs: 1,
        inputRedacted: 'Febre há 4 dias, plaquetas 90 mil.',
        rawOutput: {
          reasoning: 'Quadro séptico.',
          differentials: [{ hypothesis: 'Sepse' }],
          recommendations: [
            { action: 'Coletar hemoculturas', preliminary: false, citationChunkId: 'c1' },
            { action: 'Iniciar antibiótico', preliminary: false, citationChunkId: 'c2' },
          ],
          clarifyingQuestions: [],
          uncertainty: false,
        },
      },
    });
    interactionId = interaction.id;
  });

  describe('GRANTs da role de runtime', () => {
    it.each(F0D_TABLES)('%s: DML liberado, TRUNCATE negado', async (table) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ privilege: string; granted: boolean }>>(
        `SELECT p AS privilege, has_table_privilege($1, $2, p) AS granted
           FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
        RUNTIME_ROLE,
        table,
      );

      expect(Object.fromEntries(rows.map((row) => [row.privilege, row.granted]))).toEqual({
        SELECT: true,
        INSERT: true,
        UPDATE: true,
        DELETE: true,
        TRUNCATE: false,
      });
    });

    it('a role de runtime grava, atualiza e apaga nas tabelas novas', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RUNTIME_ROLE}`);
        const [session] = await tx.$queryRaw<Array<{ role: string }>>`SELECT current_user AS role`;
        expect(session?.role).toBe(RUNTIME_ROLE);
        const decision = await tx.recommendationDecision.create({
          data: {
            encounterId,
            interactionId,
            physicianId,
            recommendationIndex: 0,
            recommendationKey: '0-abcdef123456',
            decision: 'adopted',
          },
        });
        await tx.recommendationDecision.update({
          where: { id: decision.id },
          data: { decision: 'rejected' },
        });
        const feedback = await tx.copilotFeedback.create({
          data: { encounterId, interactionId, physicianId, kind: 'wrong_scenario' },
        });
        await tx.copilotFeedback.update({
          where: { id: feedback.id },
          data: { status: 'triaged' },
        });
        await tx.recommendationDecision.deleteMany({ where: { physicianId } });
        await tx.copilotFeedback.deleteMany({ where: { physicianId } });
      });
    });
  });

  describe('decisões por recomendação', () => {
    it('faz upsert pelo índice único: uma linha por recomendação, a última decisão vale', async () => {
      const service = new RecommendationDecisionsService(prisma as unknown as PrismaService, audit);

      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 1,
        decision: 'adopted',
      });
      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 1,
        decision: 'modified',
        note: 'Ajustar dose; CPF 529.982.247-25',
      });

      const rows = await prisma.recommendationDecision.findMany({ where: { interactionId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        recommendationIndex: 1,
        decision: 'modified',
        note: 'Ajustar dose; CPF [REDACTED_CPF]',
      });
      expect(rows[0]!.recommendationKey).toMatch(/^1-[0-9a-f]{12}$/);

      const auditEntries = await prisma.auditLog.findMany({
        where: { action: 'COPILOT_RECOMMENDATION_DECIDED' },
      });
      expect(auditEntries).toHaveLength(2);
      expect(JSON.stringify(auditEntries)).not.toContain('Ajustar dose');
    });
  });

  describe('fila de triagem', () => {
    it('o feedback entra na fila ligado à entrada da trilha e aparece na triagem', async () => {
      const service = new CopilotFeedbackService(prisma as unknown as PrismaService, audit);

      await service.submit(physicianId, encounterId, {
        interactionId,
        kind: 'missing_coverage',
        comment: 'Faltou a diretriz de dengue',
      });

      const page = await service.listForTriage({ status: 'new', limit: 20, offset: 0 });
      const mine = page.items.find((item) => item.physicianId === physicianId);
      expect(mine).toMatchObject({
        kind: 'missing_coverage',
        status: 'new',
        interaction: { inputRedacted: 'Febre há 4 dias, plaquetas 90 mil.' },
      });
      expect(page.countsByStatus.new).toBeGreaterThanOrEqual(1);

      const row = await prisma.copilotFeedback.findFirstOrThrow({ where: { physicianId } });
      const auditEntry = await prisma.auditLog.findUniqueOrThrow({
        where: { id: row.auditLogId! },
      });
      expect(auditEntry.action).toBe('COPILOT_FEEDBACK');
    });

    it('o backfill importa entradas antigas da trilha uma única vez', async () => {
      await audit.log({
        actorId: physicianId,
        action: 'COPILOT_FEEDBACK',
        entity: 'AiInteraction',
        entityId: interactionId,
        payload: { encounterId, kind: 'wrong_scenario', comment: 'Era dengue (antigo)' },
      });

      const first = await backfillCopilotFeedback(prisma, { apply: true });
      const second = await backfillCopilotFeedback(prisma, { apply: true });

      expect(first).toMatchObject({ imported: 1, alreadyImported: 0 });
      expect(second).toMatchObject({ imported: 0, alreadyImported: 1 });
      expect(await prisma.copilotFeedback.count({ where: { physicianId } })).toBe(1);
    });
  });

  it('apagar o encontro (eliminação LGPD) leva decisões e feedback junto', async () => {
    await prisma.recommendationDecision.create({
      data: {
        encounterId,
        interactionId,
        physicianId,
        recommendationIndex: 0,
        recommendationKey: '0-abcdef123456',
        decision: 'rejected',
      },
    });
    await prisma.copilotFeedback.create({
      data: { encounterId, interactionId, physicianId, kind: 'helpful' },
    });

    await prisma.encounter.delete({ where: { id: encounterId } });

    expect(await prisma.recommendationDecision.count({ where: { physicianId } })).toBe(0);
    expect(await prisma.copilotFeedback.count({ where: { physicianId } })).toBe(0);
  });
});
