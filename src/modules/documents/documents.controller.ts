import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Inject,
  Res,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { generateDocumentSchema, editDocumentSchema } from './schemas/document.schemas';
import type { GenerateDocumentInput, EditDocumentInput } from './schemas/document.schemas';
import type { FastifyReply } from 'fastify';

@Controller('encounters/:encounterId/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documentsService: DocumentsService) {}

  @Post()
  async generate(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(generateDocumentSchema)) body: GenerateDocumentInput,
  ) {
    return this.documentsService.generate(req.user.physicianId, encounterId, body);
  }

  @Get()
  async findAll(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
  ) {
    return this.documentsService.findByEncounter(req.user.physicianId, encounterId);
  }

  @Patch(':id')
  async edit(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(editDocumentSchema)) body: EditDocumentInput,
  ) {
    return this.documentsService.edit(req.user.physicianId, id, body);
  }

  @Post(':id/confirm')
  async confirm(@Request() req: { user: { physicianId: string } }, @Param('id') id: string) {
    return this.documentsService.confirm(req.user.physicianId, id);
  }

  @Get(':id/download')
  async download(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Res() res: FastifyReply,
  ) {
    const url = await this.documentsService.getDownloadUrl(req.user.physicianId, id);
    if (!url) {
      return res.status(404).send({ message: 'PDF not available' });
    }
    return res.redirect(url);
  }
}
