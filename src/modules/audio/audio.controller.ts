import { Controller, Post, Body, Param, UseGuards, Request, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { uploadAudioSchema, transcribeDirectSchema } from './schemas/audio.schemas';
import type { UploadAudioInput, TranscribeDirectInput } from './schemas/audio.schemas';

@Controller()
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  /**
   * Fluxo completo (assíncrono): cria AudioCapture encriptado, transcreve,
   * enfileira job para análise. Usado quando o áudio faz parte do registro
   * clínico permanente do encontro.
   */
  @Post('encounters/:encounterId/audio')
  @HttpCode(202)
  upload(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(uploadAudioSchema)) body: UploadAudioInput,
  ) {
    return this.audioService.upload(req.user.physicianId, encounterId, body);
  }

  /**
   * S21-VOICE-02 — Transcrição síncrona para a tela de Captura.
   *
   * Retorna o texto imediatamente (sem persistir áudio, sem fila).
   * Rate-limitado a 20 req/min por usuário — suficiente para ditado
   * contínuo sem abuso.
   */
  @Post('audio/transcribe')
  @HttpCode(200)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  transcribe(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(transcribeDirectSchema)) body: TranscribeDirectInput,
  ) {
    return this.audioService.transcribeDirect(req.user.physicianId, body);
  }
}
