/**
 * Testes de integração — retenção das capturas de áudio (LGPD, minimização).
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (inclui 20261014200100_audio_capture_retention).
 *
 * Cobre o que os testes unitários não alcançam: o UPDATE condicional sob
 * execuções concorrentes de verdade (cada captura eliminada e auditada uma
 * única vez), a atomicidade eliminação + entrada na trilha, e a CHECK que
 * amarra `status = 'deleted'` a `encrypted_content IS NULL`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, type AudioCaptureStatus } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import {
  AudioRetentionService,
  AUDIO_RETENTION_PURGE_ACTION,
} from '../../src/modules/audio/audio-retention.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';

const EMAIL_DOMAIN = '@audio-retention.test';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const EXPIRED = new Date(NOW.getTime() - DAY_MS);
const NOT_YET_DUE = new Date(NOW.getTime() + 29 * DAY_MS);
const MASKED_TRANSCRIPT = 'Paciente [NOME_REDACTED] com dor torácica há 2 horas.';

describe('Retenção de capturas de áudio (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let physicianId: string;
  let encounterId: string;

  function buildRetentionService(): AudioRetentionService {
    return new AudioRetentionService(prisma as unknown as PrismaService, audit);
  }

  async function createCapture(
    retainUntil: Date,
    status: AudioCaptureStatus = 'completed',
  ): Promise<string> {
    const row = await prisma.audioCapture.create({
      data: {
        encounterId,
        physicianId,
        encryptedContent: status === 'deleted' ? null : 'iv:tag:ciphertext',
        mimeType: 'audio/webm',
        sizeBytes: 2048,
        status,
        transcribedText: MASKED_TRANSCRIPT,
        retainUntil,
      },
    });
    return row.id;
  }

  async function purgeEntries() {
    return prisma.auditLog.findMany({
      where: { action: AUDIO_RETENTION_PURGE_ACTION },
      orderBy: { createdAt: 'asc' },
    });
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    audit = new AuditService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    // Cascata physician → encounter → audio_captures.
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(prisma);

    const physician = await prisma.physician.create({
      data: {
        email: `medico-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000321',
      },
    });
    physicianId = physician.id;
    const encounter = await prisma.encounter.create({ data: { physicianId } });
    encounterId = encounter.id;
  });

  it('elimina o áudio vencido, mantém a lápide e audita só com ids', async () => {
    const expiredIds = await Promise.all([
      createCapture(EXPIRED, 'pending'),
      createCapture(EXPIRED, 'completed'),
      createCapture(EXPIRED, 'failed'),
    ]);
    const liveId = await createCapture(NOT_YET_DUE);

    const result = await buildRetentionService().purgeExpired(NOW);

    expect(result).toEqual({ purged: 3, failed: 0 });

    const purgedRows = await prisma.audioCapture.findMany({ where: { id: { in: expiredIds } } });
    expect(purgedRows).toHaveLength(3);
    for (const row of purgedRows) {
      expect(row.status).toBe('deleted');
      expect(row.encryptedContent).toBeNull();
      // Lápide: transcrição mascarada e metadados ficam.
      expect(row.transcribedText).toBe(MASKED_TRANSCRIPT);
      expect(row.sizeBytes).toBe(2048);
    }

    const live = await prisma.audioCapture.findUniqueOrThrow({ where: { id: liveId } });
    expect(live.status).toBe('completed');
    expect(live.encryptedContent).toBe('iv:tag:ciphertext');

    const entries = await purgeEntries();
    expect(entries.map((entry) => entry.entityId).sort()).toEqual([...expiredIds].sort());
    for (const entry of entries) {
      expect(entry.actorId).toBe('system');
      expect(entry.entity).toBe('AudioCapture');
      expect(entry.payload).toEqual({ encounterId, physicianId });
    }
    expect(JSON.stringify(entries)).not.toContain(MASKED_TRANSCRIPT);

    await expect(audit.verifyChain()).resolves.toEqual({
      valid: true,
      count: 3,
      // Nenhuma linha legada: o escritor da transação é o canônico (ADR-015).
      legacy: { verified: 0, unverifiable: 0, unverifiableSample: [] },
    });
  });

  it('é idempotente: reexecutar não elimina nem audita de novo', async () => {
    await createCapture(EXPIRED);
    await createCapture(EXPIRED);
    const service = buildRetentionService();

    await expect(service.purgeExpired(NOW)).resolves.toEqual({ purged: 2, failed: 0 });
    await expect(service.purgeExpired(NOW)).resolves.toEqual({ purged: 0, failed: 0 });

    expect(await purgeEntries()).toHaveLength(2);
  });

  it('execuções concorrentes eliminam e auditam cada captura uma única vez', async () => {
    const total = 25;
    const ids = await Promise.all(Array.from({ length: total }, () => createCapture(EXPIRED)));

    const results = await Promise.all(
      Array.from({ length: 3 }, () => buildRetentionService().purgeExpired(NOW)),
    );

    expect(results.reduce((sum, r) => sum + r.purged, 0)).toBe(total);
    expect(results.every((r) => r.failed === 0)).toBe(true);

    const entries = await purgeEntries();
    expect(entries).toHaveLength(total);
    expect(new Set(entries.map((entry) => entry.entityId))).toEqual(new Set(ids));
    await expect(audit.verifyChain()).resolves.toEqual({
      valid: true,
      count: total,
      legacy: { verified: 0, unverifiable: 0, unverifiableSample: [] },
    });

    const remaining = await prisma.audioCapture.count({
      where: { id: { in: ids }, encryptedContent: { not: null } },
    });
    expect(remaining).toBe(0);
  });

  it('não elimina o áudio quando a entrada na trilha falha (atomicidade)', async () => {
    const id = await createCapture(EXPIRED);
    const failingAudit = {
      logInTransaction: async () => {
        throw new Error('audit unavailable');
      },
    } as unknown as AuditService;
    const service = new AudioRetentionService(prisma as unknown as PrismaService, failingAudit);

    await expect(service.purgeExpired(NOW)).resolves.toEqual({ purged: 0, failed: 1 });

    const row = await prisma.audioCapture.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('completed');
    expect(row.encryptedContent).toBe('iv:tag:ciphertext');
  });

  describe('CHECK audio_captures_content_matches_status', () => {
    it('rejeita linha `deleted` que ainda guarda áudio', async () => {
      const id = await createCapture(NOT_YET_DUE);

      await expect(
        prisma.audioCapture.update({ where: { id }, data: { status: 'deleted' } }),
      ).rejects.toThrow(/audio_captures_content_matches_status/);
    });

    it('rejeita linha viva sem áudio', async () => {
      const id = await createCapture(NOT_YET_DUE);

      await expect(
        prisma.audioCapture.update({ where: { id }, data: { encryptedContent: null } }),
      ).rejects.toThrow(/audio_captures_content_matches_status/);
    });

    it('impede reviver uma captura eliminada (ex.: job de transcrição atrasado)', async () => {
      const id = await createCapture(EXPIRED, 'deleted');

      await expect(
        prisma.audioCapture.update({ where: { id }, data: { status: 'completed' } }),
      ).rejects.toThrow(/audio_captures_content_matches_status/);
    });
  });
});
