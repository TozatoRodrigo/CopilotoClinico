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
});
