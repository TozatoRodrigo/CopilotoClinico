import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioService } from './audio.service';
import { WhisperService } from './whisper.service';
import { PrismaService } from '../../config/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { InferenceQueueService } from '../queue/inference-queue.service';

describe('AudioService', () => {
  let service: AudioService;

  const ENCOUNTER = { id: 'enc-1', physicianId: 'phy-1' };
  const AUDIO_ROW = {
    id: 'aud-1',
    encounterId: 'enc-1',
    physicianId: 'phy-1',
    status: 'pending',
    transcribedText: null,
  };

  let prismaMock: {
    encounter: { findUnique: ReturnType<typeof vi.fn> };
    audioCapture: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let whisperMock: { transcribe: ReturnType<typeof vi.fn> };
  let queueMock: { enqueueTranscribe: ReturnType<typeof vi.fn> };
  let cryptoMock: { encrypt: ReturnType<typeof vi.fn> };
  let auditMock: { log: ReturnType<typeof vi.fn> };

  const validInput = {
    mimeType: 'audio/webm' as const,
    sizeBytes: 1024,
    data: Buffer.from('fake-audio').toString('base64'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      encounter: { findUnique: vi.fn().mockResolvedValue(ENCOUNTER) },
      audioCapture: {
        create: vi.fn().mockResolvedValue(AUDIO_ROW),
        update: vi.fn().mockResolvedValue(AUDIO_ROW),
      },
    };
    whisperMock = { transcribe: vi.fn().mockResolvedValue('patient texto sem pii') };
    queueMock = { enqueueTranscribe: vi.fn().mockResolvedValue('job-1') };
    cryptoMock = { encrypt: vi.fn().mockReturnValue('encrypted::data') };
    auditMock = { log: vi.fn().mockResolvedValue(undefined) };

    service = new AudioService(
      prismaMock as unknown as PrismaService,
      cryptoMock as unknown as CryptoService,
      auditMock as unknown as AuditService,
      queueMock as unknown as InferenceQueueService,
      whisperMock as unknown as WhisperService,
      new ConfigService({}),
    );
  });

  it('uploads audio, transcribes, and enqueues job', async () => {
    const result = await service.upload('phy-1', 'enc-1', validInput);

    expect(result.audioId).toBe('aud-1');
    expect(result.jobId).toBe('job-1');
    expect(result.status).toBe('pending');
    expect(cryptoMock.encrypt).toHaveBeenCalledWith(validInput.data);
    expect(whisperMock.transcribe).toHaveBeenCalled();
    expect(queueMock.enqueueTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ audioId: 'aud-1', physicianId: 'phy-1' }),
    );
    expect(auditMock.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUDIO_UPLOAD' }));
  });

  it('throws NotFoundException when encounter not found', async () => {
    prismaMock.encounter.findUnique.mockResolvedValueOnce(null);
    await expect(service.upload('phy-1', 'enc-999', validInput)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when encounter belongs to different physician', async () => {
    prismaMock.encounter.findUnique.mockResolvedValueOnce({ id: 'enc-1', physicianId: 'other-phy' });
    await expect(service.upload('phy-1', 'enc-1', validInput)).rejects.toThrow(NotFoundException);
  });

  // ──── S21-VOICE-02 — transcribeDirect (síncrono, sem persistir áudio) ────
  describe('S21-VOICE-02 — transcribeDirect', () => {
    it('returns transcribed text with model + audioHash + durationMs', async () => {
      const result = await service.transcribeDirect('phy-1', validInput);

      expect(result.text).toBe('patient texto sem pii');
      expect(result.model).toBe('whisper-large-v3');
      expect(result.audioHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('does NOT persist AudioCapture (LGPD minimização)', async () => {
      await service.transcribeDirect('phy-1', validInput);

      expect(prismaMock.audioCapture.create).not.toHaveBeenCalled();
      expect(prismaMock.audioCapture.update).not.toHaveBeenCalled();
    });

    it('does NOT enqueue job (synchronous response)', async () => {
      await service.transcribeDirect('phy-1', validInput);

      expect(queueMock.enqueueTranscribe).not.toHaveBeenCalled();
    });

    it('logs AUDIO_TRANSCRIBE in audit with audioHash as entityId', async () => {
      const result = await service.transcribeDirect('phy-1', validInput);

      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'phy-1',
          action: 'AUDIO_TRANSCRIBE',
          entity: 'AudioCapture',
          entityId: result.audioHash,
          payload: expect.objectContaining({
            model: 'whisper-large-v3',
            audioHash: result.audioHash,
            mimeType: validInput.mimeType,
            sizeBytes: validInput.sizeBytes,
          }),
        }),
      );
    });

    it('audioHash is deterministic for same input (reproducibility)', async () => {
      const r1 = await service.transcribeDirect('phy-1', validInput);
      const r2 = await service.transcribeDirect('phy-1', validInput);

      expect(r1.audioHash).toBe(r2.audioHash);
    });

    it('audioHash differs for different input', async () => {
      const r1 = await service.transcribeDirect('phy-1', validInput);
      const r2 = await service.transcribeDirect('phy-1', {
        ...validInput,
        data: Buffer.from('different-audio').toString('base64'),
      });

      expect(r1.audioHash).not.toBe(r2.audioHash);
    });

    it('does NOT include transcribed text in audit payload (minimization)', async () => {
      await service.transcribeDirect('phy-1', validInput);

      const call = auditMock.log.mock.calls[0]?.[0];
      expect(JSON.stringify(call.payload)).not.toContain('patient texto sem pii');
      expect(call.payload).not.toHaveProperty('text');
      expect(call.payload).not.toHaveProperty('transcript');
    });

    it('propagates Whisper errors (e.g. provider down)', async () => {
      whisperMock.transcribe.mockRejectedValueOnce(new Error('Whisper down'));
      await expect(service.transcribeDirect('phy-1', validInput)).rejects.toThrow('Whisper down');
    });
  });
});
