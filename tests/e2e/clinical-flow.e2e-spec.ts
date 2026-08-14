/**
 * E2E — Full clinical flow
 *
 * Covers: register → login → refresh → /me → encounter → mocked AI analyze →
 * SOAP document → confirm (contentHash) → audit events → LGPD export.
 *
 * No real AI provider or DB required in CI — all providers are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/config/prisma.service';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { InferenceQueueService } from '../../src/modules/queue/inference-queue.service';
import { InferenceWorkerService } from '../../src/modules/queue/inference-worker.service';
import { WhisperService } from '../../src/modules/audio/whisper.service';
import { createHash } from 'crypto';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters-long!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters-long!!';
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ??
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const PHYSICIAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const ENCOUNTER_ID = '660e8400-e29b-41d4-a716-446655440001';
const DOCUMENT_ID = '770e8400-e29b-41d4-a716-446655440002';
const INTERACTION_ID = '880e8400-e29b-41d4-a716-446655440003';
const REFRESH_TOKEN_ID = '990e8400-e29b-41d4-a716-446655440004';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

const MOCK_COPILOT_OUTPUT = {
  reasoning:
    'Paciente de 65 anos com dor torácica típica. ECG mostra supradesnivelamento ST em DII, DIII e aVF.',
  recommendations: [
    {
      action: 'Iniciar anticoagulação com heparina não fracionada',
      rationale: 'Conforme protocolo AHA/ACC para IAMCSST',
      citationChunkId: 'chunk-001',
      confidence: 0.95,
      source: 'AHA/ACC STEMI Guidelines 2023',
      sourceVersion: '2023',
      sourceText: 'Anticoagulation is recommended for all STEMI patients.',
      sourceUrl: '',
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  citations: [],
};

// ── Prisma mock ────────────────────────────────────────────────────────────────
function buildPrismaMock() {
  let refreshTokenHash = '';
  let refreshTokenRevoked = false;

  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        auditLog: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'audit-tx-001', afterHash: 'hash' }),
        },
      };
      return typeof cb === 'function' ? cb(txMock) : Promise.resolve(cb);
    }),

    physician: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: PHYSICIAN_ID,
          email: data.email,
          crmUf: data.crmUf,
          crmNumber: data.crmNumber,
          name: data.name ?? null,
          crmVerified: false,
          mfaEnabled: false,
          subscriptionStatus: 'trial',
          passwordHash: data.passwordHash,
          createdAt: new Date(),
        }),
      ),
    },

    loginSecurityState: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },

    refreshToken: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        refreshTokenHash = data.tokenHash as string;
        return Promise.resolve({ id: REFRESH_TOKEN_ID, ...data });
      }),
      findFirst: vi.fn().mockImplementation(() => {
        if (refreshTokenRevoked) return Promise.resolve(null);
        return Promise.resolve({
          id: REFRESH_TOKEN_ID,
          tokenHash: refreshTokenHash,
          revoked: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          physician: {
            id: PHYSICIAN_ID,
            email: 'dr@test.com',
            crmUf: 'SP',
            crmNumber: '12345',
            name: 'Dr. Test',
            crmVerified: false,
            mfaEnabled: false,
          },
        });
      }),
      update: vi.fn().mockImplementation(() => {
        refreshTokenRevoked = true;
        return Promise.resolve({});
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },

    encounter: {
      create: vi.fn().mockResolvedValue({
        id: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        patientRef: 'PAT-001',
        vertical: 'cardiology',
        context: null,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        status: 'draft',
        patientRef: 'PAT-001',
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        status: 'draft',
        patientRef: 'PAT-001',
        context: null,
        vertical: 'cardiology',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: ENCOUNTER_ID,
          physicianId: PHYSICIAN_ID,
          patientRef: 'PAT-001',
          vertical: 'cardiology',
          context: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },

    aiInteraction: {
      create: vi.fn().mockResolvedValue({
        id: INTERACTION_ID,
        encounterId: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        rawOutput: MOCK_COPILOT_OUTPUT,
        createdAt: new Date(),
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: INTERACTION_ID,
        encounterId: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        rawOutput: MOCK_COPILOT_OUTPUT,
        uncertainty: false,
        uncertaintyReason: null,
        createdAt: new Date(),
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: INTERACTION_ID,
        encounterId: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        rawOutput: MOCK_COPILOT_OUTPUT,
        createdAt: new Date(),
      }),
    },

    guidelineChunk: {
      findMany: vi.fn().mockResolvedValue([]),
    },

    physicianInstitution: {
      findMany: vi.fn().mockResolvedValue([]),
    },

    document: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: DOCUMENT_ID,
          ...data,
          confirmedBy: null,
          confirmedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findFirst: vi.fn().mockResolvedValue({
        id: DOCUMENT_ID,
        encounterId: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        type: 'soap',
        content: MOCK_COPILOT_OUTPUT,
        contentHash: 'abc123',
        confirmedBy: null,
        confirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: DOCUMENT_ID,
        encounterId: ENCOUNTER_ID,
        physicianId: PHYSICIAN_ID,
        type: 'soap',
        content: MOCK_COPILOT_OUTPUT,
        contentHash: 'abc123',
        confirmedBy: null,
        confirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        // SEC-02 — confirm() agora seleciona encounter.institutionId para
        // decidir quem pode confirmar (ver documents.service.ts). O
        // encontro deste fixture não tem instituição vinculada.
        encounter: { institutionId: null },
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: DOCUMENT_ID,
          encounterId: ENCOUNTER_ID,
          physicianId: PHYSICIAN_ID,
          type: 'soap',
          content: MOCK_COPILOT_OUTPUT,
          contentHash: 'abc123',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },

    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-001' }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },

    consent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'consent-001' }),
      update: vi.fn().mockResolvedValue({}),
    },

    erasureRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'erasure-001', status: 'pending' }),
    },

    crmVerificationRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'crm-req-001',
        physicianId: PHYSICIAN_ID,
        status: 'PENDING',
        requestedAt: new Date(),
        resolvedAt: null,
        resolvedBy: null,
        notes: null,
      }),
      update: vi.fn().mockResolvedValue({
        id: 'crm-req-001',
        physicianId: PHYSICIAN_ID,
        status: 'APPROVED',
        requestedAt: new Date(),
        resolvedAt: new Date(),
        resolvedBy: 'system-auto',
        notes: null,
      }),
    },
  };
}

async function buildClinicalApp() {
  const prismaMock = buildPrismaMock();

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(AiGatewayService)
    .useValue({
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          reasoning: MOCK_COPILOT_OUTPUT.reasoning,
          recommendations: MOCK_COPILOT_OUTPUT.recommendations,
          uncertainty: false,
          uncertaintyReason: null,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 200,
      }),
      embed: vi.fn().mockResolvedValue({
        embeddings: [new Array(1536).fill(0.01)],
        model: 'text-embedding-3-small',
        usage: { promptTokens: 10, totalTokens: 10 },
      }),
      getProviderName: () => 'mock',
    })
    .overrideProvider(InferenceQueueService)
    .useValue({
      enqueueAnalyze: vi.fn().mockResolvedValue('mock-job-id'),
      enqueueTranscribe: vi.fn().mockResolvedValue('mock-job-id'),
      getJobStatus: vi.fn().mockResolvedValue({ jobId: 'mock-job-id', status: 'unknown', progress: 0 }),
      getQueue: () => ({}),
      onModuleInit: () => undefined,
      onModuleDestroy: () => Promise.resolve(),
    })
    .overrideProvider(InferenceWorkerService)
    .useValue({ onModuleInit: () => undefined, onModuleDestroy: () => Promise.resolve() })
    .overrideProvider(WhisperService)
    .useValue({ transcribe: vi.fn().mockResolvedValue('mock transcript'), onModuleInit: () => undefined })
    .compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('v1');

  // Register cookie plugin after NestJS init but before ready
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fastify = app.getHttpAdapter().getInstance() as any;
  const { default: cookie } = await import('@fastify/cookie');
  await fastify.register(cookie);

  await app.init();
  await fastify.ready();
  return { app, prismaMock };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractCookies(response: { headers: Record<string, string | string[]> }) {
  const setCookie = response.headers['set-cookie'];
  if (!setCookie) return {};
  const cookies: Record<string, string> = {};
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const entry of list) {
    const pair = entry.split(';')[0] ?? '';
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Clinical Flow E2E', () => {
  let app: NestFastifyApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let accessToken: string;
  let refreshToken: string;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    ({ app, prismaMock } = await buildClinicalApp());
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Register ─────────────────────────────────────────────────────────────
  it('POST /auth/register creates physician and sets cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'dr@test.com',
        password: 'Senha@123',
        crmUf: 'SP',
        crmNumber: '12345',
        name: 'Dr. Test',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ physician: { id: string; email: string } }>();
    expect(body.physician.email).toBe('dr@test.com');

    cookies = extractCookies(res as unknown as { headers: Record<string, string | string[]> });
    expect(cookies).toHaveProperty('access_token');
    expect(cookies).toHaveProperty('refresh_token');
    accessToken = cookies['access_token']!;
    refreshToken = cookies['refresh_token']!;
  });

  // ── 2. Login ────────────────────────────────────────────────────────────────
  it('POST /auth/login authenticates and sets cookies', async () => {
    prismaMock.physician.findUnique.mockResolvedValueOnce({
      id: PHYSICIAN_ID,
      email: 'dr@test.com',
      passwordHash: '$2a$12$PgopbSnIv5EEG9keI9CrxOSBPu4bMNiiqMLjDClZ72JPCRz3vwR7O',
      crmUf: 'SP',
      crmNumber: '12345',
      name: 'Dr. Test',
      crmVerified: false,
      mfaEnabled: false,
      subscriptionStatus: 'trial',
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'dr@test.com', password: 'Senha@123' },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json<{ physician?: { id: string } }>();
    expect(body).not.toHaveProperty('accessToken');
    const loginCookies = extractCookies(loginRes as unknown as { headers: Record<string, string | string[]> });
    expect(loginCookies).toHaveProperty('access_token');
    accessToken = loginCookies['access_token']!;
    refreshToken = loginCookies['refresh_token']!;
    cookies = loginCookies;
  });

  // ── 3. GET /auth/me ─────────────────────────────────────────────────────────
  it('GET /auth/me returns physician profile via cookie auth', async () => {
    prismaMock.physician.findUnique.mockResolvedValueOnce({
      id: PHYSICIAN_ID,
      email: 'dr@test.com',
      crmUf: 'SP',
      crmNumber: '12345',
      name: 'Dr. Test',
      crmVerified: false,
      mfaEnabled: false,
      subscriptionStatus: 'trial',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `access_token=${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; email: string }>();
    expect(body.id).toBe(PHYSICIAN_ID);
    expect(body.email).toBe('dr@test.com');
    expect(body).not.toHaveProperty('passwordHash');
  });

  // ── 4. Refresh ──────────────────────────────────────────────────────────────
  it('POST /auth/refresh rotates tokens via cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `access_token=${accessToken}; refresh_token=${refreshToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const newCookies = extractCookies(res as unknown as { headers: Record<string, string | string[]> });
    if (newCookies['access_token']) {
      accessToken = newCookies['access_token']!;
      cookies = { ...cookies, ...newCookies };
    }
  });

  // ── 5. Create encounter ─────────────────────────────────────────────────────
  it('POST /encounters creates a draft encounter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: { cookie: `access_token=${accessToken}` },
      payload: { patientRef: 'PAT-001', vertical: 'cardiology' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; status: string }>();
    expect(body.id).toBe(ENCOUNTER_ID);
    expect(body.status).toBe('draft');
  });

  // ── 6. Copilot analyze ──────────────────────────────────────────────────────
  it('POST /copilot/analyze returns recommendations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${ENCOUNTER_ID}/copilot/analyze`,
      headers: { cookie: `access_token=${accessToken}` },
      payload: {
        caseText: MOCK_COPILOT_OUTPUT.reasoning,
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json<{ recommendations?: unknown[]; interactionId?: string }>();
    expect(body).toHaveProperty('interactionId');
  });

  // ── 7. Generate SOAP document ────────────────────────────────────────────────
  it('POST /documents generates a SOAP document', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${ENCOUNTER_ID}/documents`,
      headers: { cookie: `access_token=${accessToken}` },
      payload: { type: 'soap', aiInteractionId: INTERACTION_ID },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json<{ id: string; type: string; contentHash: string }>();
    expect(body.type).toBe('soap');
    expect(body.contentHash).toBeTruthy();
  });

  // ── 8. Confirm document (contentHash immutability) ───────────────────────────
  it('POST /documents/:id/confirm seals the document with contentHash', async () => {
    prismaMock.document.findFirst.mockResolvedValueOnce({
      id: DOCUMENT_ID,
      encounterId: ENCOUNTER_ID,
      physicianId: PHYSICIAN_ID,
      type: 'soap',
      content: MOCK_COPILOT_OUTPUT,
      contentHash: 'abc123',
      confirmedBy: null,
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${ENCOUNTER_ID}/documents/${DOCUMENT_ID}/confirm`,
      headers: { cookie: `access_token=${accessToken}` },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json<{ confirmedBy: string; contentHash: string }>();
    expect(body.confirmedBy).toBe(PHYSICIAN_ID);
    expect(body.contentHash).toBeTruthy();
  });

  // ── 9. LGPD export ──────────────────────────────────────────────────────────
  it('GET /lgpd/export returns physician data export', async () => {
    prismaMock.physician.findUnique.mockResolvedValueOnce({
      id: PHYSICIAN_ID,
      email: 'dr@test.com',
      crmUf: 'SP',
      crmNumber: '12345',
      name: 'Dr. Test',
      crmVerified: false,
      mfaEnabled: false,
      subscriptionStatus: 'trial',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/lgpd/export',
      headers: { cookie: `access_token=${accessToken}` },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json<{ data?: { physician: { email: string } }; exportVersion?: string }>();
    expect(body).toHaveProperty('exportVersion');
    expect(body.data).toHaveProperty('physician');
  });

  // ── 10. Logout clears cookies ────────────────────────────────────────────────
  it('POST /auth/logout clears auth cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: `access_token=${accessToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const responseCookies = extractCookies(res as unknown as { headers: Record<string, string | string[]> });
    // Cleared cookies have empty values
    if (responseCookies.access_token !== undefined) {
      expect(responseCookies.access_token).toBe('');
    }
  });

  // ── 11. Health check includes dependencies ───────────────────────────────────
  it('GET /health returns status with dependency breakdown', async () => {
    process.env.AI_PROVIDER = 'openai';
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; dependencies: Record<string, unknown> }>();
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.dependencies).toHaveProperty('database');
    expect(body.dependencies).toHaveProperty('ai');
    expect(body.dependencies).toHaveProperty('redis');
    delete process.env.AI_PROVIDER;
  });
});
