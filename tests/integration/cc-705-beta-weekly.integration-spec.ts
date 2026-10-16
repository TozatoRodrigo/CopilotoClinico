/**
 * Testes de integração — CC-705: painel semanal do beta no Postgres.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (inclusive ai_calls, knowledge_gaps da CC-703 e o beta da CC-702).
 *
 * Cobre o que o teste unitário não alcança: o limite da semana no horário de
 * Brasília contra colunas `timestamp` gravadas em UTC, o corte da semana
 * anterior no mesmo ponto, o filtro de falha de validação e de caso de
 * exemplo nos JSONB, as respostas antes do plano (`answeredAt` dentro do
 * JSONB) e que nenhum id ou e-mail de médico sai na resposta. Os dados ficam
 * em 2097 e o relatório é pedido "de lá": nada que outro teste grave entra na
 * janela.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { AiCallReportService } from '../../src/modules/analytics/ai-call-report.service';
import { BetaActivationService } from '../../src/modules/beta/beta-activation.service';
import { BetaWeeklyService } from '../../src/modules/beta/beta-weekly.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { BetaWeeklyReport } from '../../src/shared/contracts/beta-weekly';

const EMAIL_DOMAIN = '@cc705.test';
const AI_CALL_PROFILE = 'cc705';
const BATCH = 'lote cc705';

/** Horário de Brasília (UTC-3 em 2097, sem horário de verão). */
function brt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000-03:00`);
}

// Semana de segunda 04/03/2097, vista na sexta 08/03 às 13:00 em Brasília.
const NOW = brt('2097-03-08', '13:00');

const REAL_OUTPUT: Prisma.InputJsonValue = {
  reasoning: 'Quadro febril.',
  understanding: { syndrome: 'febre', searchQueries: ['febre sem foco'] },
};
const FAILED_OUTPUT: Prisma.InputJsonValue = { raw: '{', validationErrors: ['invalid json'] };

describe('CC-705 — painel semanal do beta (integration)', () => {
  let prisma: PrismaClient;
  let service: BetaWeeklyService;
  let report: BetaWeeklyReport;
  const physicianIds: string[] = [];
  const emails: string[] = [];

  async function physician(
    label: string,
    createdAt: Date,
    role: 'PHYSICIAN' | 'ADMIN' = 'PHYSICIAN',
  ) {
    const email = `${label}-${Date.now()}${EMAIL_DOMAIN}`;
    const created = await prisma.physician.create({
      data: { email, passwordHash: 'x', crmUf: 'SP', crmNumber: '000705', role, createdAt },
    });
    physicianIds.push(created.id);
    emails.push(email);
    const encounter = await prisma.encounter.create({ data: { physicianId: created.id } });
    return { id: created.id, encounterId: encounter.id };
  }

  async function analysis(
    encounterId: string,
    createdAt: Date,
    options: {
      demo?: boolean;
      failed?: boolean;
      answeredQuestions?: Prisma.InputJsonValue;
    } = {},
  ) {
    const interaction = await prisma.aiInteraction.create({
      data: {
        encounterId,
        model: 'test-model',
        latencyMs: 1,
        params: options.demo ? { demoCase: 'gripal' } : {},
        rawOutput: options.failed ? FAILED_OUTPUT : REAL_OUTPUT,
        turnIndex: options.answeredQuestions ? 1 : 0,
        ...(options.answeredQuestions ? { answeredQuestions: options.answeredQuestions } : {}),
        createdAt,
      },
    });
    return interaction.id;
  }

  async function cleanup() {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.betaInvite.deleteMany({ where: { batchLabel: BATCH } });
    await prisma.aiCall.deleteMany({ where: { profile: AI_CALL_PROFILE } });
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    const prismaService = prisma as unknown as PrismaService;
    service = new BetaWeeklyService(
      prismaService,
      new AiCallReportService(prismaService),
      new BetaActivationService(prismaService),
    );
    await cleanup();

    // P1: convidado, cadastrado na segunda e ativado em 1 h. Três análises
    // reais, uma falha de validação (não conta) e o caso de exemplo.
    const p1 = await physician('p1', brt('2097-03-04', '10:00'));
    const invite = await prisma.betaInvite.create({
      data: {
        code: `CC705${Date.now().toString().slice(-6)}`,
        batchLabel: BATCH,
        maxUses: 5,
        expiresAt: brt('2097-04-01', '00:00'),
        createdById: p1.id,
      },
    });
    await prisma.betaParticipant.create({ data: { physicianId: p1.id, inviteId: invite.id } });
    const p1First = await analysis(p1.encounterId, brt('2097-03-04', '11:00'));
    const p1Second = await analysis(p1.encounterId, brt('2097-03-05', '09:00'));
    const p1Third = await analysis(p1.encounterId, brt('2097-03-06', '22:00'));
    await analysis(p1.encounterId, brt('2097-03-06', '22:05'), { failed: true });
    await analysis(p1.encounterId, brt('2097-03-04', '10:30'), { demo: true });

    // P2: cadastrado antes; uma análise real com reporte negativo.
    const p2 = await physician('p2', brt('2097-01-10', '10:00'));
    const p2Analysis = await analysis(p2.encounterId, brt('2097-03-07', '08:00'));

    // P3: cadastrado na quinta (24 h completas), só respondeu pergunta antes
    // do plano; a análise não saiu.
    const p3 = await physician('p3', brt('2097-03-07', '12:00'));
    await prisma.caseIntake.create({
      data: {
        encounterId: p3.encounterId,
        physicianId: p3.id,
        caseTextRedacted: 'Caso redigido.',
        context: {},
        redFlags: {},
        path: 'ask',
        status: 'asking',
        questions: [],
        answers: [
          {
            questionId: 'q1',
            question: 'Tem febre?',
            answer: 'sim',
            channel: 'tap',
            answeredAt: brt('2097-03-07', '12:30').toISOString(),
          },
        ],
        updatedAt: brt('2097-03-07', '12:30'),
      },
    });

    // P4: cadastrado na sexta de manhã (sem 24 h): só o caso de exemplo, com
    // reporte (que não conta: caso de exemplo).
    const p4 = await physician('p4', brt('2097-03-08', '09:00'));
    const p4Demo = await analysis(p4.encounterId, brt('2097-03-08', '09:30'), { demo: true });

    // P5: admin testando: fora de tudo.
    const p5 = await physician('p5', brt('2097-01-10', '10:00'), 'ADMIN');
    await analysis(p5.encounterId, brt('2097-03-05', '10:00'));

    // P6: semana anterior. Domingo 23:30 em Brasília (segunda 02:30 UTC) ainda
    // é a semana anterior; sexta 12:00 entra no corte; sexta 14:00 passa do
    // mesmo ponto (13:00) e fica de fora.
    const p6 = await physician('p6', brt('2097-02-26', '10:00'));
    const p6Sunday = await analysis(p6.encounterId, brt('2097-03-03', '23:30'));
    await analysis(p6.encounterId, brt('2097-03-01', '12:00'));
    await analysis(p6.encounterId, brt('2097-03-01', '14:00'));

    // P7: respondeu pergunta depois do plano; a reanálise falhou na validação.
    const p7 = await physician('p7', brt('2097-01-10', '10:00'));
    await analysis(p7.encounterId, brt('2097-03-05', '15:00'), {
      failed: true,
      answeredQuestions: [{ questionId: 'q1', answer: 'não' }],
    });

    await prisma.copilotFeedback.createMany({
      data: [
        {
          interactionId: p2Analysis,
          encounterId: p2.encounterId,
          physicianId: p2.id,
          kind: 'wrong_scenario',
          createdAt: brt('2097-03-07', '08:10'),
        },
        {
          interactionId: p1Second,
          encounterId: p1.encounterId,
          physicianId: p1.id,
          kind: 'helpful',
          createdAt: brt('2097-03-05', '09:10'),
        },
        {
          interactionId: p4Demo,
          encounterId: p4.encounterId,
          physicianId: p4.id,
          kind: 'wrong_recommendation',
          createdAt: brt('2097-03-08', '09:40'),
        },
      ],
    });

    await prisma.knowledgeGap.createMany({
      data: [
        {
          source: 'physician_not_found',
          interactionId: p1First,
          syndrome: 'febre',
          searchQueries: [],
          createdAt: brt('2097-03-04', '11:10'),
        },
        {
          source: 'physician_not_found',
          interactionId: p1Third,
          syndrome: 'febre',
          searchQueries: [],
          note: 'faltou dengue',
          createdAt: brt('2097-03-06', '22:10'),
        },
        {
          source: 'physician_not_found',
          interactionId: p2Analysis,
          syndrome: null,
          searchQueries: [],
          createdAt: brt('2097-03-07', '08:15'),
        },
        {
          source: 'physician_not_found',
          interactionId: p6Sunday,
          syndrome: 'febre',
          searchQueries: [],
          createdAt: brt('2097-03-03', '23:40'),
        },
      ],
    });

    const call = (
      requestId: string,
      stage: string,
      costUsd: number,
      latencyMs: number,
      createdAt: Date,
    ): Prisma.AiCallCreateManyInput => ({
      requestId,
      stage,
      profile: AI_CALL_PROFILE,
      provider: 'anthropic',
      requestedModel: 'claude-opus-5-5',
      promptSha256: 'a'.repeat(64),
      costUsd,
      latencyMs,
      outcome: 'ok',
      createdAt,
    });
    await prisma.aiCall.createMany({
      data: [
        call('req-cc705-a', 'understanding', 0.01, 5_000, brt('2097-03-04', '11:00')),
        call('req-cc705-a', 'decision', 0.19, 25_000, brt('2097-03-04', '11:01')),
        call('req-cc705-b', 'decision', 0.3, 40_000, brt('2097-03-07', '08:00')),
        // Leitura do caso sem decisão: não é análise.
        call('req-cc705-c', 'intake_reading', 0.05, 3_000, brt('2097-03-07', '12:00')),
        // Semana anterior, antes do corte.
        call('req-cc705-d', 'decision', 0.1, 20_000, brt('2097-03-03', '23:30')),
      ],
    });

    report = await service.report(undefined, NOW);
  });

  afterAll(async () => {
    await cleanup();
    await disconnectTestDb();
  });

  it('cuts the week at Monday 00:00 in Brasília and the previous one at the same point', () => {
    expect(report.period).toEqual({
      current: {
        weekStart: '2097-03-04',
        weekEnd: '2097-03-10',
        from: '2097-03-04T03:00:00.000Z',
        to: '2097-03-08T16:00:00.000Z',
      },
      previous: {
        weekStart: '2097-02-25',
        weekEnd: '2097-03-03',
        from: '2097-02-25T03:00:00.000Z',
        to: '2097-03-01T16:00:00.000Z',
      },
      inProgress: true,
    });
  });

  it('counts active physicians and analyses from real cases only', () => {
    expect(report.usage.current).toEqual({
      activePhysicians: 4, // P1, P2, P3 (pergunta), P7 (pergunta depois do plano)
      physiciansWithAnalysis: 2,
      analyses: 4, // 3 de P1 + 1 de P2
      demoAnalyses: 2,
      analysesPerPhysician: { mean: 1, median: 0.5 },
      distribution: [
        { bucket: '0', physicians: 2 },
        { bucket: '1', physicians: 1 },
        { bucket: '2-4', physicians: 1 },
        { bucket: '5-9', physicians: 0 },
        { bucket: '10+', physicians: 0 },
      ],
    });
    // Semana anterior até sexta 13:00: só a análise de sexta 12:00 de P6. O
    // domingo 23:30 (segunda 02:30 UTC) não entra em nenhuma das duas.
    expect(report.usage.previous).toMatchObject({ activePhysicians: 1, analyses: 1 });
  });

  it('measures a closed week whole, Sunday 23:30 in Brasília included', async () => {
    const closed = await service.report('2097-02-27', NOW);

    expect(closed.period.inProgress).toBe(false);
    expect(closed.period.current).toEqual({
      weekStart: '2097-02-25',
      weekEnd: '2097-03-03',
      from: '2097-02-25T03:00:00.000Z',
      to: '2097-03-04T03:00:00.000Z',
    });
    expect(closed.usage.current).toMatchObject({ activePhysicians: 1, analyses: 3 });
    expect(closed.knowledgeGaps.total.current).toBe(1);
    expect(closed.aiCost.current).toMatchObject({ count: 1, totalCostUsd: 0.1 });
    expect(closed.activation.current.overall).toMatchObject({
      registered: 1,
      eligible: 1,
      activated24h: 0,
      rate: 0,
    });
    // A semana pedida inteira contra a anterior inteira.
    expect(closed.period.previous.to).toBe('2097-02-25T03:00:00.000Z');
  });

  it('counts negative feedback per 100 real analyses, without the demo case', () => {
    expect(report.feedback.current).toEqual({
      negative: 1,
      helpful: 1,
      byKind: { wrong_scenario: 1, missing_coverage: 0, wrong_recommendation: 0, helpful: 1 },
      negativePer100Analyses: 25,
    });
  });

  it('ranks the knowledge gaps by syndrome with the previous week alongside', () => {
    expect(report.knowledgeGaps).toEqual({
      total: { current: 3, previous: 0 },
      top: [
        { syndrome: 'febre', current: 2, previous: 0 },
        { syndrome: null, current: 1, previous: 0 },
      ],
    });
  });

  it('reuses the ai_calls aggregation for cost and latency per analysis', () => {
    expect(report.aiCost.current).toEqual({
      count: 2,
      totalCostUsd: 0.5,
      avgCostUsd: 0.25,
      latency: { p50Ms: 35_000, p95Ms: 39_500 },
    });
    expect(report.aiCost.previous.count).toBe(0);
  });

  it('reports the activation of the cohort registered in the week, by batch', () => {
    expect(report.activation.current.overall).toEqual({
      registered: 3, // P1, P3, P4 (o admin não conta)
      eligible: 2,
      activated24h: 1,
      activatedRealCase24h: 1,
      rate: 0.5,
      realCaseRate: 0.5,
    });
    expect(report.activation.current.byBatch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ batchLabel: BATCH, registered: 1, activated24h: 1 }),
        expect.objectContaining({ batchLabel: null, registered: 2, eligible: 1 }),
      ]),
    );
    expect(report.activation.previous.overall.registered).toBe(1); // P6
  });

  it('never returns a physician id or e-mail, nor the gap note', () => {
    const body = JSON.stringify(report);
    for (const id of physicianIds) expect(body).not.toContain(id);
    for (const email of emails) expect(body).not.toContain(email);
    expect(body).not.toContain('faltou dengue');
  });
});
