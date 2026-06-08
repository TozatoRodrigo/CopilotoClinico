import { Controller, Post, Body, Param, UseGuards, Request, HttpCode } from '@nestjs/common';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { uploadAudioSchema } from './schemas/audio.schemas';
import type { UploadAudioInput } from './schemas/audio.schemas';

@Controller('encounters/:encounterId/audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post()
  @HttpCode(202)
  upload(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(uploadAudioSchema)) body: UploadAudioInput,
  ) {
    return this.audioService.upload(req.user.physicianId, encounterId, body);
  }
}
