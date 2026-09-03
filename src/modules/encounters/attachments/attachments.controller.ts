import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { AttachmentsService } from './attachments.service';
import { createAttachmentSchema } from './schemas/attachments.schemas';
import type { CreateAttachmentInput } from './schemas/attachments.schemas';

/**
 * F4 — Referências que o médico anexa a UM atendimento.
 *
 * Todas as rotas são escopadas pelo médico dono do encontro; encontro
 * inexistente e encontro de outro médico devolvem o mesmo 404.
 */
@Controller('encounters/:encounterId/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @Get()
  async list(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
  ) {
    return this.attachments.list(req.user.physicianId, encounterId);
  }

  @Post()
  async create(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(createAttachmentSchema)) body: CreateAttachmentInput,
  ) {
    return this.attachments.create(req.user.physicianId, encounterId, body);
  }

  @Delete(':attachmentId')
  async remove(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachments.remove(req.user.physicianId, encounterId, attachmentId);
  }
}
