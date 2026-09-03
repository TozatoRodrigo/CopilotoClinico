import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { CuratorGuard } from '../../shared/guards/curator.guard';
import { GuidelinesService } from './guidelines.service';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  ingestGuidelineSchema,
  suggestGuidelineSchema,
  extractDocumentTextSchema,
  deactivateGuidelineSchema,
  rejectGuidelineChunkSchema,
  type IngestGuidelineBody,
  type SuggestGuidelineBody,
  type ExtractDocumentTextBody,
  type DeactivateGuidelineBody,
  type RejectGuidelineChunkBody,
} from './schemas/guidelines.schemas';

@Controller('guidelines')
export class GuidelinesController {
  constructor(@Inject(GuidelinesService) private readonly guidelinesService: GuidelinesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async listSources() {
    return this.guidelinesService.listSources();
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('q') q: string,
    @Query('specialty') specialty?: string,
    @Query('limit') limit?: string,
  ) {
    const maxLimit = Math.min(parseInt(limit ?? '20', 10) || 20, 50);
    return this.guidelinesService.searchChunks(q, specialty, maxLimit);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async listPending() {
    return this.guidelinesService.listPending();
  }

  @Get('chunks/:chunkId')
  @UseGuards(JwtAuthGuard)
  async getChunk(@Param('chunkId') chunkId: string) {
    const chunk = await this.guidelinesService.getChunkById(chunkId);
    if (!chunk) throw new NotFoundException('Guideline chunk not found');
    return chunk;
  }

  @Post('chunks/:chunkId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async approveChunk(
    @Request() req: { user: { physicianId: string } },
    @Param('chunkId') chunkId: string,
  ) {
    return this.guidelinesService.approveChunk(chunkId, req.user.physicianId);
  }

  @Post('chunks/:chunkId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async rejectChunk(
    @Request() req: { user: { physicianId: string } },
    @Param('chunkId') chunkId: string,
    @Body(new ZodValidationPipe(rejectGuidelineChunkSchema)) body: RejectGuidelineChunkBody,
  ) {
    return this.guidelinesService.rejectChunk(chunkId, req.user.physicianId, body.reason);
  }

  @Post()
  @UseGuards(InternalServiceGuard)
  async ingest(@Body(new ZodValidationPipe(ingestGuidelineSchema)) body: IngestGuidelineBody) {
    return this.guidelinesService.ingest(body);
  }

  /**
   * F4 — Qualquer médico autenticado pode sugerir uma diretriz para a base.
   *
   * Origem: um médico do piloto tentou incluir a diretriz da ABRAMEDE de
   * dengue depois de ver um caso ser conduzido como sepse, e recebeu erro. O
   * único caminho existente (`ingest-review`) exige papel COMPLIANCE/ADMIN
   * MAIS a flag `isCurator`, e um front-matter que um PDF convertido nunca
   * tem. Quem encontra o buraco na base é quem está no plantão.
   *
   * A sugestão entra como `pending_review` — nada chega ao retrieval sem
   * curadoria — e, ao contrário de `ingest-review`, NÃO supersede versões
   * anteriores da mesma fonte (ver `suggestGuideline`).
   */
  /**
   * F4 — Extrai o texto de um PDF/txt/md enviado pelo médico.
   *
   * Deliberadamente separado de `POST /suggest`: o médico confere e recorta o
   * texto antes de enviar para curadoria. Um artigo de 47 páginas inteiro
   * viraria dezenas de chunks de contexto irrelevante (referências, filiação
   * dos autores, metodologia) competindo no retrieval com a parte que muda a
   * conduta.
   *
   * Não persiste nada — só devolve o texto extraído.
   */
  @Post('extract-text')
  @UseGuards(JwtAuthGuard)
  async extractText(
    @Body(new ZodValidationPipe(extractDocumentTextSchema)) body: ExtractDocumentTextBody,
  ) {
    return this.guidelinesService.extractDocumentText(body);
  }

  @Post('suggest')
  @UseGuards(JwtAuthGuard)
  async suggest(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(suggestGuidelineSchema)) body: SuggestGuidelineBody,
  ) {
    return this.guidelinesService.suggestGuideline({
      ...body,
      suggestedBy: req.user.physicianId,
    });
  }

  @Post('ingest-review')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async ingestForReview(
    @Body(new ZodValidationPipe(ingestGuidelineSchema)) body: IngestGuidelineBody,
  ) {
    return this.guidelinesService.ingestForReview(body);
  }

  @Patch('deactivate')
  @UseGuards(InternalServiceGuard)
  async deactivate(
    @Body(new ZodValidationPipe(deactivateGuidelineSchema)) body: DeactivateGuidelineBody,
  ) {
    return this.guidelinesService.deactivateSource(body.source, body.sourceVersion);
  }
}
