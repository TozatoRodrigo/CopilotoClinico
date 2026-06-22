import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import { WhisperService } from './whisper.service';
import { maskPII } from '../copilot/guardrails/pii-filter';
import type {
  UploadAudioInput,
  AudioUploadResponse,
  TranscribeDirectInput,
  TranscribeDirectResponse,
} from './schemas/audio.schemas';

const RETENTION_DAYS = 30;
const WHISPER_MODEL_NAME = 'whisper-large-v3';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly queue: InferenceQueueService,
    private readonly whisper: WhisperService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    physicianId: string,
    encounterId: string,
    input: UploadAudioInput,
  ): Promise<AudioUploadResponse> {
    await this.validateEncounterAccess(physicianId, encounterId);

    const audioBuffer = Buffer.from(input.data, 'base64');
    const encryptedContent = this.crypto.encrypt(input.data);

    const retainUntil = new Date();
    retainUntil.setDate(retainUntil.getDate() + RETENTION_DAYS);

    const audio = await this.prisma.audioCapture.create({
      data: {
        encounterId,
        physicianId,
        encryptedContent,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: 'pending',
        retainUntil,
      },
    });

    await this.audit.log({
      actorId: physicianId,
      action: 'AUDIO_UPLOAD',
      entity: 'AudioCapture',
      entityId: audio.id,
      payload: { mimeType: input.mimeType, sizeBytes: input.sizeBytes, retainUntil },
    });

    // Transcribe synchronously to feed transcript into the worker-queued analyze job
    const transcript = await this.transcribeAndStore(audio.id, audioBuffer, input.mimeType);

    const jobId = await this.queue.enqueueTranscribe({
      audioId: audio.id,
      physicianId,
      encounterId,
    });

    await this.prisma.audioCapture.update({
      where: { id: audio.id },
      data: { jobId, transcribedText: transcript },
    });

    this.logger.log(`Audio ${audio.id} uploaded, transcribed, queued as job ${jobId}`);

    return { audioId: audio.id, jobId, status: 'pending', message: 'Transcription queued' };
  }

  private async transcribeAndStore(
    audioId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const raw = await this.whisper.transcribe(buffer, mimeType, audioId);
    const { redacted } = maskPII(raw);
    return redacted;
  }

  /**
   * S21-VOICE-02 — Transcrição síncrona para a tela de Captura.
   *
   * Diferente do fluxo completo (`upload`), este método:
   * - Não cria AudioCapture (LGPD minimização: áudio não é persistido)
   * - Não enfileira job (retorno imediato para o médico)
   * - Calcula hash SHA-256 do áudio para rastreabilidade CFM (reproduzível)
   * - Loga em auditoria com `AUDIO_TRANSCRIBE` (sem entityId de AudioCapture,
   *   mas com audioHash permitindo correlação posterior)
   *
   * O texto retornado tem máscara de PII aplicada (defense-in-depth com o
   * filtro do orchestrator quando o médico submete o caso completo).
   */
  async transcribeDirect(
    physicianId: string,
    input: TranscribeDirectInput,
  ): Promise<TranscribeDirectResponse> {
    const start = Date.now();
    const audioBuffer = Buffer.from(input.data, 'base64');

    const raw = await this.whisper.transcribe(audioBuffer, input.mimeType);
    const { redacted, hasPII } = maskPII(raw);

    const audioHash = createHash('sha256').update(audioBuffer).digest('hex');
    const durationMs = Date.now() - start;

    await this.audit.log({
      actorId: physicianId,
      action: 'AUDIO_TRANSCRIBE',
      entity: 'AudioCapture',
      // Sem entityId (não criamos AudioCapture); audioHash permite correlação.
      entityId: audioHash,
      payload: {
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        model: WHISPER_MODEL_NAME,
        durationMs,
        audioHash,
        piiDetected: hasPII,
        // Não logamos o texto transcrito (minimização); texto é persistido
        // apenas na AiInteraction quando o médico submete o caso.
      },
    });

    this.logger.debug(
      `AUDIO_TRANSCRIBE physician=${physicianId} size=${input.sizeBytes} ` +
        `duration=${durationMs}ms pii=${hasPII} hash=${audioHash.slice(0, 8)}`,
    );

    return {
      text: redacted,
      model: WHISPER_MODEL_NAME,
      audioHash,
      durationMs,
    };
  }

  private async validateEncounterAccess(physicianId: string, encounterId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter || encounter.physicianId !== physicianId) {
      throw new NotFoundException('Encounter not found');
    }
  }
}
