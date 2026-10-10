/**
 * Testes de integração — LGPD-003: anexos e capturas de áudio na exportação
 * (Art. 18, V) e no apagamento (Art. 18, VI).
 *
 * Com banco real, cobre o que o teste unitário não alcança: o filtro por
 * relação (`encounter: { physicianId }`) nos deleteMany, a cascata do
 * Encounter, o `omit` do áudio cifrado e o trigger append-only do audit_log
 * (AUD-001) — o apagamento não pode tentar mexer na trilha.
 *
 * O storage é um stub: o MinIO não sobe no CI, e o que importa aqui é quais
 * chaves o apagamento manda apagar.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 */
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { LgpdService } from '../../src/modules/lgpd/lgpd.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { StorageService } from '../../src/modules/storage/storage.service';

describe('LGPD-003 — anexos e áudio na exportação e no apagamento (integration)', () => {
  let prisma: PrismaClient;
  let auditService: AuditService;
  const deletedKeys: string[] = [];
  const storage = {
    deleteObjects: async (keys: readonly string[]) => {
      deletedKeys.push(...keys);
    },
  } as unknown as StorageService;

  const physicianId = randomUUID();
  const otherPhysicianId = randomUUID();
  let encounterId: string;
  let otherEncounterId: string;
  let attachmentId: string;
  let audioId: string;
  let otherAttachmentId: string;
  let pdfObjectKey: string;

  beforeAll(async () => {
    prisma = await connectTestDb();
    auditService = new AuditService(prisma as unknown as PrismaService);

    await prisma.physician.createMany({
      data: [physicianId, otherPhysicianId].map((id) => ({
        id,
        crmUf: 'SP',
        crmNumber: id.slice(0, 8),
        email: `lgpd-003-${id}@test.local`,
        passwordHash: 'hash',
      })),
    });

    const [encounter, otherEncounter] = await Promise.all([
      prisma.encounter.create({ data: { physicianId } }),
      prisma.encounter.create({ data: { physicianId: otherPhysicianId } }),
    ]);
    encounterId = encounter.id;
    otherEncounterId = otherEncounter.id;

    const attachment = await prisma.encounterAttachment.create({
      data: {
        encounterId,
        physicianId,
        filename: 'diretriz-dengue.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        text: 'Grupo C: hidratação venosa. Paciente [NOME_REDACTED].',
      },
    });
    attachmentId = attachment.id;

    const otherAttachment = await prisma.encounterAttachment.create({
      data: {
        encounterId: otherEncounterId,
        physicianId: otherPhysicianId,
        filename: 'outro-medico.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        text: 'Anexo de outro médico.',
      },
    });
    otherAttachmentId = otherAttachment.id;

    const audio = await prisma.audioCapture.create({
      data: {
        encounterId,
        physicianId,
        encryptedContent: 'iv:tag:ciphertext-do-audio',
        mimeType: 'audio/webm',
        sizeBytes: 4096,
        status: 'completed',
        transcribedText: 'Febre há 3 dias, CPF [CPF_REDACTED].',
        retainUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    audioId = audio.id;

    const document = await prisma.document.create({
      data: { encounterId, physicianId, type: 'soap', content: { subjective: 'febre' } },
    });
    pdfObjectKey = `documents/${encounterId}/${document.id}.pdf`;
    await prisma.document.update({ where: { id: document.id }, data: { pdfObjectKey } });

    // Trilha anterior ao apagamento: precisa sobreviver a ele (append-only).
    await auditService.log({
      actorId: physicianId,
      action: 'ENCOUNTER_ATTACHMENT_ADDED',
      entity: 'EncounterAttachment',
      entityId: attachmentId,
      payload: { encounterId },
    });
  });

  afterAll(async () => {
    await prisma.physician.deleteMany({ where: { id: { in: [physicianId, otherPhysicianId] } } });
    await disconnectTestDb();
  });

  it('exporta anexos com texto redigido e áudio com transcrição, sem o áudio cifrado', async () => {
    const service = new LgpdService(prisma as unknown as PrismaService, auditService, storage);

    const exported = await service.exportPhysicianData(physicianId);

    expect(exported.data.encounterAttachments.map((a) => a.id)).toEqual([attachmentId]);
    expect(exported.data.encounterAttachments[0]?.text).toContain('[NOME_REDACTED]');

    expect(exported.data.audioCaptures.map((a) => a.id)).toEqual([audioId]);
    expect(exported.data.audioCaptures[0]?.transcribedText).toContain('[CPF_REDACTED]');
    expect(exported.data.audioCaptures[0]).not.toHaveProperty('encryptedContent');
    expect(JSON.stringify(exported)).not.toContain('ciphertext-do-audio');
  });

  it('apaga anexos, áudio e PDFs do médico, preserva os de outro médico e a trilha de auditoria', async () => {
    const service = new LgpdService(prisma as unknown as PrismaService, auditService, storage);

    const result = await service.requestErasure(physicianId);

    expect(result.erased).toMatchObject({
      encounters: 1,
      encounterAttachments: 1,
      audioCaptures: 1,
      storageObjects: 1,
    });
    expect(deletedKeys).toEqual([pdfObjectKey]);

    expect(await prisma.encounterAttachment.count({ where: { id: attachmentId } })).toBe(0);
    expect(await prisma.audioCapture.count({ where: { id: audioId } })).toBe(0);
    expect(await prisma.document.count({ where: { encounterId } })).toBe(0);
    expect(await prisma.encounterAttachment.count({ where: { id: otherAttachmentId } })).toBe(1);

    const trail = await prisma.auditLog.findMany({
      where: { actorId: physicianId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, entityId: true },
    });
    expect(trail).toEqual([
      { action: 'ENCOUNTER_ATTACHMENT_ADDED', entityId: attachmentId },
      { action: 'DATA_ERASURE', entityId: physicianId },
    ]);
  });
});
