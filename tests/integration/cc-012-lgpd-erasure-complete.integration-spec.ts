/**
 * Testes de integração — CC-012: eliminação LGPD completa (Art. 18, VI).
 *
 * A eliminação deixava para trás códigos de backup e segredo do MFA, CRM,
 * pedidos de verificação de CRM, vínculos institucionais e o estado do
 * bloqueio de login. Aqui, com banco real:
 *
 * - toda coluna de `ERASURE_POLICY` é semeada para dois médicos e, depois da
 *   eliminação de um deles, nenhuma linha aponta mais para ele — e as do
 *   outro continuam todas lá. Tabela nova na política sem semente aqui faz o
 *   primeiro teste falhar;
 * - cada tabela do CC-012 tem a sua checagem própria;
 * - a eliminação roda com a role de runtime (copiloto_app, AUD-002), então os
 *   GRANTs de produção são postos à prova — inclusive o UPDATE só nas colunas
 *   de vínculo de ai_calls.
 *
 * O storage é um stub: o MinIO não sobe no CI.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 */
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { LgpdService } from '../../src/modules/lgpd/lgpd.service';
import { ERASURE_POLICY } from '../../src/modules/lgpd/erasure-policy';
import { AuditService } from '../../src/modules/audit/audit.service';
import { loginLockoutKey } from '../../src/modules/auth/account-lockout.service';
import { PhysicianErasureCheck } from '../../src/modules/auth/physician-erasure-check.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { StorageService } from '../../src/modules/storage/storage.service';

type PolicyReference = keyof typeof ERASURE_POLICY;
const policyReferences = Object.keys(ERASURE_POLICY) as PolicyReference[];

interface SeededPhysician {
  id: string;
  email: string;
  name: string;
  crmNumber: string;
  mfaSecret: string;
  institutionId: string;
  /** Linha de login sem physician_id, só com o hash do e-mail. */
  loginStateByEmailId: string;
  loginStateIds: string[];
  /** Com o médico no contexto, e sem (só o atendimento). */
  aiCallIds: string[];
  legalDocumentId: string;
}

/** Uma linha em cada tabela da política, mais as variações do CC-012. */
async function seedPhysician(prisma: PrismaClient, label: string): Promise<SeededPhysician> {
  const id = randomUUID();
  const email = `cc-012-${label}-${id}@test.local`;
  const name = `Dra. Teste ${label}`;
  const crmNumber = `9${id.slice(0, 5)}`;
  const mfaSecret = `iv:tag:totp-${id}`;

  await prisma.physician.create({
    data: {
      id,
      email,
      name,
      crmUf: 'SP',
      crmNumber,
      crmVerified: true,
      mfaEnabled: true,
      mfaSecret,
      passwordHash: 'hash',
      locale: 'es',
      specialty: 'medicina_de_emergencia',
    },
  });

  const institution = await prisma.institution.create({ data: { name: `Hospital ${label}` } });
  await prisma.physicianInstitution.create({
    data: { physicianId: id, institutionId: institution.id },
  });

  const encounter = await prisma.encounter.create({
    data: { physicianId: id, institutionId: institution.id },
  });
  const encounterId = encounter.id;
  const requestId = `req-${id}`;
  const interaction = await prisma.aiInteraction.create({
    data: { encounterId, model: 'test-model', rawOutput: {}, latencyMs: 10, requestId },
  });

  await prisma.encounterAttachment.create({
    data: {
      encounterId,
      physicianId: id,
      filename: 'diretriz.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      text: 'Hidratação venosa.',
    },
  });
  await prisma.audioCapture.create({
    data: {
      encounterId,
      physicianId: id,
      encryptedContent: 'iv:tag:audio',
      mimeType: 'audio/webm',
      sizeBytes: 100,
      retainUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await prisma.document.create({
    data: { encounterId, physicianId: id, type: 'soap', content: { subjective: 'febre' } },
  });
  await prisma.caseIntake.create({
    data: {
      encounterId,
      physicianId: id,
      caseTextRedacted: 'Febre há 3 dias.',
      context: {},
      redFlags: [],
      path: 'complete',
      status: 'closed',
      questions: [],
      answers: [],
    },
  });
  await prisma.recommendationDecision.create({
    data: {
      encounterId,
      interactionId: interaction.id,
      physicianId: id,
      recommendationIndex: 0,
      recommendationKey: '0-abcdef123456',
      decision: 'adopted',
    },
  });
  await prisma.copilotFeedback.create({
    data: { interactionId: interaction.id, encounterId, physicianId: id, kind: 'helpful' },
  });
  await prisma.consent.create({ data: { physicianId: id, scope: 'ai_processing' } });
  await prisma.refreshToken.create({
    data: {
      physicianId: id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  // Tabelas que entraram depois do CC-012 (a eliminação da base já as apaga):
  // contas externas (CC-334), aceites (CC-905), mentoria pedida (CC-707),
  // locais de plantão (CC-602) e revisão do plantão (CC-801).
  await prisma.externalIdentity.create({
    data: { physicianId: id, provider: 'google', subject: `google-${id}`, emailAtLink: email },
  });
  const legalDocument = await prisma.legalDocument.create({
    data: {
      type: 'terms_of_use',
      version: `cc-012-${id}`,
      title: 'Termos de Uso',
      sections: [],
      changeSummary: [],
      contentHash: 'c'.repeat(64),
      provisional: true,
      publishedById: id,
    },
  });
  await prisma.legalAcceptance.create({
    data: { physicianId: id, documentId: legalDocument.id },
  });
  await prisma.mentoringRequest.create({
    data: {
      encounterId,
      requesterId: id,
      caseSnapshot: { caseText: 'Febre há 3 dias.' },
      termsVersion: 'teste',
      termsAcceptedAt: new Date(),
    },
  });
  await prisma.practiceSite.create({
    data: { physicianId: id, name: `UPA ${label}`, facilityType: 'upa_porte_1' },
  });
  const shiftReview = await prisma.shiftReview.create({
    data: {
      physicianId: id,
      periodStart: new Date('2026-10-12'),
      status: 'ready',
      trigger: 'on_demand',
      windowStart: new Date('2026-10-12T00:00:00Z'),
      windowEnd: new Date('2026-10-19T00:00:00Z'),
    },
  });
  await prisma.shiftReviewQuestion.create({
    data: {
      reviewId: shiftReview.id,
      physicianId: id,
      encounterId,
      interactionId: interaction.id,
      position: 0,
      format: 'true_false',
      stem: 'Hidratação venosa é a primeira conduta?',
      options: ['Verdadeiro', 'Falso'],
      correctOption: 0,
      explanation: 'Segundo a diretriz citada.',
      topic: 'Desidratação',
      source: {},
    },
  });

  // CC-012 — o que ficava para trás.
  await prisma.mfaBackupCode.createMany({
    data: ['1', '2'].map((digit) => ({ physicianId: id, codeHash: digit.repeat(64) })),
  });
  await prisma.crmVerificationRequest.create({
    data: {
      physicianId: id,
      status: 'APPROVED',
      notes: `Conferido no portal do CFM: ${name}`,
      resolvedBy: 'system-auto',
      resolvedAt: new Date(),
    },
  });
  // Ligada ao médico por physician_id (hash de um e-mail antigo) e, sem
  // physician_id, pelo hash do e-mail atual — como grava a tentativa com o
  // e-mail digitado em outra caixa, que não acha o médico.
  const loginStateLinked = await prisma.loginSecurityState.create({
    data: {
      identifierHash: loginLockoutKey(`antigo-${email}`),
      physicianId: id,
      failedCount: 2,
      lastFailedAt: new Date(),
    },
  });
  const loginStateByEmail = await prisma.loginSecurityState.create({
    data: {
      identifierHash: loginLockoutKey(email.toUpperCase()),
      physicianId: null,
      failedCount: 1,
      lastFailedAt: new Date(),
    },
  });

  const aiCallIds = [randomUUID(), randomUUID()];
  await prisma.aiCall.createMany({
    data: aiCallIds.map((callId, index) => ({
      id: callId,
      requestId,
      physicianId: index === 0 ? id : null,
      encounterId,
      stage: 'analysis',
      profile: 'default',
      provider: 'anthropic',
      requestedModel: 'test-model',
      promptSha256: 'f'.repeat(64),
      costUsd: 0.0123,
      latencyMs: 900,
      outcome: 'ok',
    })),
  });

  return {
    id,
    email,
    name,
    crmNumber,
    mfaSecret,
    institutionId: institution.id,
    loginStateByEmailId: loginStateByEmail.id,
    loginStateIds: [loginStateLinked.id, loginStateByEmail.id],
    aiCallIds,
    legalDocumentId: legalDocument.id,
  };
}

async function countReferencing(
  prisma: PrismaClient,
  reference: PolicyReference,
  physicianId: string,
): Promise<number> {
  const [table, column] = reference.split('.');
  // Nomes vêm da política (constantes do código), nunca de entrada externa.
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = $1::uuid`,
    physicianId,
  );
  return rows[0]?.n ?? 0;
}

async function countAll(
  prisma: PrismaClient,
  physicianId: string,
): Promise<Record<PolicyReference, number>> {
  const counts = {} as Record<PolicyReference, number>;
  for (const reference of policyReferences) {
    counts[reference] = await countReferencing(prisma, reference, physicianId);
  }
  return counts;
}

/**
 * Cliente com uma conexão só, como a role de runtime: o `SET ROLE` vale para
 * a sessão, e com uma conexão toda query da eliminação passa por ela.
 */
function runtimeRoleClient(): PrismaClient {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public',
  );
  url.searchParams.set('connection_limit', '1');
  return new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
}

describe('CC-012 — eliminação LGPD completa (integration)', () => {
  let prisma: PrismaClient;
  let runtimePrisma: PrismaClient;
  let subject: SeededPhysician;
  let other: SeededPhysician;
  let before: Record<PolicyReference, number>;
  let otherBefore: Record<PolicyReference, number>;
  let runtimeRole: string | undefined;

  beforeAll(async () => {
    prisma = await connectTestDb();
    subject = await seedPhysician(prisma, 'titular');
    other = await seedPhysician(prisma, 'colega');
    before = await countAll(prisma, subject.id);
    otherBefore = await countAll(prisma, other.id);

    runtimePrisma = runtimeRoleClient();
    await runtimePrisma.$executeRawUnsafe('SET ROLE copiloto_app');
    const [role] = await runtimePrisma.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user
    `;
    runtimeRole = role?.current_user;

    const storage = { deleteObjects: async () => undefined } as unknown as StorageService;
    const runtimeService = runtimePrisma as unknown as PrismaService;
    const service = new LgpdService(
      runtimeService,
      new AuditService(runtimeService),
      new PhysicianErasureCheck(runtimeService),
      storage,
    );
    await service.requestErasure(subject.id);
  });

  afterAll(async () => {
    await runtimePrisma?.$disconnect();
    const ids = [subject.id, other.id];
    await prisma.aiCall.deleteMany({
      where: { id: { in: [...subject.aiCallIds, ...other.aiCallIds] } },
    });
    await prisma.loginSecurityState.deleteMany({
      where: { id: { in: [...subject.loginStateIds, ...other.loginStateIds] } },
    });
    await prisma.physician.deleteMany({ where: { id: { in: ids } } });
    await prisma.legalDocument.deleteMany({
      where: { id: { in: [subject.legalDocumentId, other.legalDocumentId] } },
    });
    await prisma.institution.deleteMany({
      where: { id: { in: [subject.institutionId, other.institutionId] } },
    });
    await disconnectTestDb();
  });

  it('roda com a role de runtime, com os privilégios de produção', () => {
    expect(runtimeRole).toBe('copiloto_app');
  });

  it('o seed cobre toda coluna da política (sem isso a checagem seguinte passaria vazia)', () => {
    const uncovered = policyReferences.filter((reference) => before[reference] < 1);

    expect(uncovered, 'Semeie a tabela em seedPhysician()').toEqual([]);
  });

  it('nenhuma linha aponta mais para o médico por coluna da política', async () => {
    const after = await countAll(prisma, subject.id);

    expect(Object.entries(after).filter(([, count]) => count > 0)).toEqual([]);
  });

  it('os dados de outro médico ficam intactos', async () => {
    expect(await countAll(prisma, other.id)).toEqual(otherBefore);
    expect(
      await prisma.physician.findUniqueOrThrow({
        where: { id: other.id },
        select: { email: true, crmNumber: true, mfaSecret: true },
      }),
    ).toEqual({ email: other.email, crmNumber: other.crmNumber, mfaSecret: other.mfaSecret });
  });

  it('MFA: apaga os códigos de backup e tira o segredo do cadastro', async () => {
    expect(await prisma.mfaBackupCode.count({ where: { physicianId: subject.id } })).toBe(0);
    expect(
      await prisma.physician.findUniqueOrThrow({
        where: { id: subject.id },
        select: { mfaEnabled: true, mfaSecret: true },
      }),
    ).toEqual({ mfaEnabled: false, mfaSecret: null });
  });

  it('CRM: tira UF, número e verificação do cadastro e apaga os pedidos de verificação', async () => {
    expect(
      await prisma.physician.findUniqueOrThrow({
        where: { id: subject.id },
        select: {
          crmUf: true,
          crmNumber: true,
          crmVerified: true,
          name: true,
          email: true,
          specialty: true,
        },
      }),
    ).toEqual({
      crmUf: 'XX',
      crmNumber: 'ERASED',
      crmVerified: false,
      name: 'ERASED',
      email: `erased-${subject.id}@erased.com`,
      specialty: null,
    });
    expect(await prisma.crmVerificationRequest.count({ where: { physicianId: subject.id } })).toBe(
      0,
    );
  });

  it('vínculos institucionais: apaga o vínculo e mantém a instituição', async () => {
    expect(await prisma.physicianInstitution.count({ where: { physicianId: subject.id } })).toBe(0);
    expect(await prisma.institution.count({ where: { id: subject.institutionId } })).toBe(1);
  });

  it('estado de login: apaga também a linha sem physician_id, achada pelo hash do e-mail', async () => {
    expect(
      await prisma.loginSecurityState.count({ where: { id: subject.loginStateByEmailId } }),
    ).toBe(0);
    expect(
      await prisma.loginSecurityState.count({ where: { id: other.loginStateByEmailId } }),
    ).toBe(1);
  });

  it('chamadas de IA ficam no custo agregado, sem médico, atendimento nem requisição', async () => {
    const calls = await prisma.aiCall.findMany({
      where: { id: { in: subject.aiCallIds } },
      select: { physicianId: true, encounterId: true, requestId: true, costUsd: true },
    });

    expect(calls).toEqual(
      subject.aiCallIds.map(() => ({
        physicianId: null,
        encounterId: null,
        requestId: null,
        costUsd: 0.0123,
      })),
    );
  });

  it('registra a eliminação na trilha com as contagens e sem dado pessoal', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: subject.id, action: 'DATA_ERASURE' },
    });
    const payload = JSON.stringify(entry.payload);

    for (const personalValue of [
      subject.email,
      subject.name,
      subject.crmNumber,
      subject.mfaSecret,
      'Hospital titular',
    ]) {
      expect(payload).not.toContain(personalValue);
    }
    expect(entry.payload).toMatchObject({
      erased: {
        mfaBackupCodes: 2,
        crmVerificationRequests: 1,
        physicianInstitutions: 1,
        loginSecurityStates: 2,
      },
      anonymized: { aiCalls: 2 },
    });
  });
});
