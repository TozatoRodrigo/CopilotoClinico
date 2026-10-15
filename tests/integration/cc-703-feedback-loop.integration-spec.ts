/**
 * Testes de integração — CC-703: o feedback que vira caso do gabarito e o
 * registro de lacunas ("não encontrei o que precisava").
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (inclusive 20261014180000_cc_703_knowledge_gaps) e a role
 * `copiloto_app` da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: os GRANTs reais da tabela
 * nova, o índice único (análise, fonte) que sustenta o upsert com
 * `interaction_id` anulável, o CASCADE do apagamento LGPD, a portabilidade e
 * o rascunho montado a partir de linhas de verdade.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import { ClinicalCaseSchema } from '../../evals/clinical/case.schema';
import { AuditService } from '../../src/modules/audit/audit.service';
import { CopilotFeedbackService } from '../../src/modules/copilot/feedback/copilot-feedback.service';
import { KnowledgeGapService } from '../../src/modules/copilot/gaps/knowledge-gap.service';
import { KnowledgeGapsService } from '../../src/modules/knowledge-gaps/knowledge-gaps.service';
import { LgpdService } from '../../src/modules/lgpd/lgpd.service';
import type { PrismaService } from '../../src/config/prisma.service';

const RUNTIME_ROLE = 'copiloto_app';
const EMAIL_DOMAIN = '@cc703.test';

describe('CC-703 — feedback que vira caso e registro de lacunas (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let gaps: KnowledgeGapService;
  let physicianId: string;
  let encounterId: string;
  let interactionId: string;

  beforeAll(async () => {
    prisma = await connectTestDb();
    audit = new AuditService(prisma as unknown as PrismaService);
    gaps = new KnowledgeGapService(
      prisma as unknown as PrismaService,
      new KnowledgeGapsService(prisma as unknown as PrismaService, audit),
    );
  });

  afterAll(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.knowledgeGap.deleteMany({ where: { interactionId: null } });
    // CC-409 — toda lacuna abre ou entra num grupo; o que ficou vazio sai.
    await prisma.knowledgeGapGroup.deleteMany({ where: { gaps: { none: {} } } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(prisma);

    const physician = await prisma.physician.create({
      data: {
        email: `medico-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000703',
      },
    });
    physicianId = physician.id;
    const encounter = await prisma.encounter.create({
      data: {
        physicianId,
        patientRef: 'CC703-001',
        context: { hasCT: true, isSus: true, hasLab: true, hasICU: false },
      },
    });
    encounterId = encounter.id;
    const interaction = await prisma.aiInteraction.create({
      data: {
        encounterId,
        model: 'test-model',
        latencyMs: 1,
        inputRedacted:
          'Febre há 4 dias, plaquetas 90 mil, dor retro-orbitária. CPF 529.982.247-25.',
        params: { retrievalCoverage: 'none', redFlags: { elderly65: true } },
        rawOutput: {
          reasoning: 'Quadro séptico.',
          differentials: [{ hypothesis: 'Sepse' }],
          understanding: {
            syndrome: 'febre',
            searchQueries: ['dengue sinais de alarme', 'hidratação dengue'],
          },
        },
      },
    });
    interactionId = interaction.id;
  });

  describe('GRANTs da role de runtime', () => {
    it('knowledge_gaps: DML liberado, TRUNCATE negado', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ privilege: string; granted: boolean }>>(
        `SELECT p AS privilege, has_table_privilege($1, 'knowledge_gaps', p) AS granted
           FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
        RUNTIME_ROLE,
      );

      expect(Object.fromEntries(rows.map((row) => [row.privilege, row.granted]))).toEqual({
        SELECT: true,
        INSERT: true,
        UPDATE: true,
        DELETE: true,
        TRUNCATE: false,
      });
    });

    it('a role de runtime registra e atualiza a lacuna', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RUNTIME_ROLE}`);
        await tx.knowledgeGap.upsert({
          where: { interactionId_source: { interactionId, source: 'physician_not_found' } },
          create: { source: 'physician_not_found', interactionId, searchQueries: [] },
          update: { note: 'faltou' },
        });
        await tx.knowledgeGap.updateMany({ where: { interactionId }, data: { note: 'de novo' } });
      });
    });
  });

  describe('não encontrei o que precisava', () => {
    it('uma lacuna por análise: o segundo toque atualiza a nota em vez de contar de novo', async () => {
      await gaps.reportNotFound(physicianId, encounterId, { interactionId });
      await gaps.reportNotFound(physicianId, encounterId, {
        interactionId,
        note: 'Hidratação por peso; CPF 529.982.247-25',
      });
      await gaps.reportNotFound(physicianId, encounterId, { interactionId });

      const rows = await prisma.knowledgeGap.findMany({ where: { interactionId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: 'physician_not_found',
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme', 'hidratação dengue'],
        note: 'Hidratação por peso; CPF [REDACTED_CPF]',
      });
      expect(JSON.stringify(rows)).not.toContain('plaquetas');
    });

    it('lacunas sem análise (fontes futuras) não colidem no índice único', async () => {
      await prisma.knowledgeGap.create({
        data: { source: 'physician_not_found', searchQueries: [] },
      });
      await prisma.knowledgeGap.create({
        data: { source: 'physician_not_found', searchQueries: [] },
      });

      expect(
        await prisma.knowledgeGap.count({ where: { interactionId: null } }),
      ).toBeGreaterThanOrEqual(2);
    });

    it('entra na portabilidade do médico e sai com o atendimento (eliminação LGPD)', async () => {
      await gaps.reportNotFound(physicianId, encounterId, { interactionId, note: 'Dose' });
      const lgpd = new LgpdService(prisma as unknown as PrismaService, audit);

      const exported = await lgpd.exportPhysicianData(physicianId);
      expect(exported.data.knowledgeGaps).toHaveLength(1);

      await prisma.encounter.delete({ where: { id: encounterId } });
      expect(await prisma.knowledgeGap.count({ where: { interactionId } })).toBe(0);
    });
  });

  it('o rascunho do caso, montado das linhas do banco, passa no schema do gabarito', async () => {
    const feedbackService = new CopilotFeedbackService(prisma as unknown as PrismaService, audit);
    await feedbackService.submit(physicianId, encounterId, {
      interactionId,
      kind: 'wrong_scenario',
      comment: 'Era dengue, foi para sepse.',
    });
    const feedback = await prisma.copilotFeedback.findFirstOrThrow({ where: { physicianId } });

    const draft = await feedbackService.exportEvalCaseDraft(physicianId, feedback.id);

    expect(ClinicalCaseSchema.safeParse(draft).success).toBe(true);
    expect(draft).toMatchObject({
      tags: ['febre', 'incidente-de-campo', 'cenario-errado'],
      input: {
        context: { hasCT: true, isSus: true, hasLab: true, hasICU: false },
        redFlags: { elderly65: true },
      },
      provenance: { origin: `feedback:${feedback.id}` },
    });
    expect(draft.input.caseText).toContain('CPF [REDACTED_CPF]');
    const exportEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'COPILOT_FEEDBACK_EVAL_CASE_EXPORTED', entityId: feedback.id },
    });
    expect(JSON.stringify(exportEntry.payload)).not.toContain('Febre');
  });
});
