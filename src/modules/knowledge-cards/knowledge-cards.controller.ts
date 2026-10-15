import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CuratorGuard } from '../../shared/guards/curator.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type {
  KnowledgeCardBatchSignResult,
  KnowledgeCardDetail,
  KnowledgeCardDraftPage,
  KnowledgeCardDraftResult,
  KnowledgeCardListPage,
} from '../../shared/contracts/knowledge-cards';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';
import {
  approveKnowledgeCardSchema,
  archiveKnowledgeCardSchema,
  createKnowledgeCardDraftSchema,
  createKnowledgeCardVersionSchema,
  listKnowledgeCardDraftsQuerySchema,
  listKnowledgeCardsQuerySchema,
  rejectKnowledgeCardSchema,
  signKnowledgeCardBatchSchema,
  submitKnowledgeCardSchema,
  type ApproveKnowledgeCardInput,
  type ArchiveKnowledgeCardInput,
  type CreateKnowledgeCardDraftInput,
  type CreateKnowledgeCardVersionInput,
  type ListKnowledgeCardDraftsQueryInput,
  type ListKnowledgeCardsQueryInput,
  type RejectKnowledgeCardInput,
  type SignKnowledgeCardBatchInput,
  type SubmitKnowledgeCardInput,
} from './schemas/knowledge-cards.schemas';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-402/CC-403 (ADR-019) — cartões revisados no console admin, e a API da
 * tela de revisão no celular (CC-404).
 *
 * Mesma barreira da curadoria de diretrizes e da triagem de feedback:
 * papel COMPLIANCE/ADMIN e flag `isCurator`. Aprovar exige, além disso, CRM
 * verificado (403 no serviço): o cartão aprovado libera dose para o médico.
 */
@Controller('admin/knowledge-cards')
@UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
@Roles('COMPLIANCE', 'ADMIN')
export class KnowledgeCardsController {
  constructor(
    @Inject(KnowledgeCardsService) private readonly cards: KnowledgeCardsService,
    @Inject(KnowledgeCardDraftService) private readonly drafts: KnowledgeCardDraftService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listKnowledgeCardsQuerySchema))
    query: ListKnowledgeCardsQueryInput,
  ): Promise<KnowledgeCardListPage> {
    return this.cards.list(query);
  }

  // Rotas de rascunho antes de `:id`: "drafts" não é um id de cartão.
  @Get('drafts')
  listDrafts(
    @Query(new ZodValidationPipe(listKnowledgeCardDraftsQuerySchema))
    query: ListKnowledgeCardDraftsQueryInput,
  ): Promise<KnowledgeCardDraftPage> {
    return this.drafts.listDrafts(query);
  }

  /** CC-403 — pede rascunhos à IA para um tema (desligado por padrão). */
  @Post('drafts')
  createDraft(
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createKnowledgeCardDraftSchema))
    body: CreateKnowledgeCardDraftInput,
  ): Promise<KnowledgeCardDraftResult> {
    return this.drafts.draft({
      topic: body.topic,
      syndrome: body.syndrome ?? null,
      institutionId: body.institutionId ?? null,
      chunkIds: body.chunkIds,
      requestedBy: req.user.physicianId,
      submitForReview: body.submitForReview,
    });
  }

  /**
   * CC-405 — "assinar lote": o revisor indicado aprova os cartões importados
   * de uma ferramenta do ANY. CRM verificado e indicação conferidos no serviço.
   */
  @Post('import-batches/sign')
  @HttpCode(200)
  signImportBatch(
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(signKnowledgeCardBatchSchema)) body: SignKnowledgeCardBatchInput,
  ): Promise<KnowledgeCardBatchSignResult> {
    return this.cards.approveImportBatch(req.user.physicianId, body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<KnowledgeCardDetail> {
    return this.cards.get(id);
  }

  /** "Corrigir" (CC-404): versão nova, escrita pelo médico. */
  @Post(':id/versions')
  createVersion(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createKnowledgeCardVersionSchema))
    body: CreateKnowledgeCardVersionInput,
  ): Promise<KnowledgeCardDetail> {
    return this.cards.createVersion(req.user.physicianId, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitKnowledgeCardSchema)) body: SubmitKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    return this.cards.submit(req.user.physicianId, id, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveKnowledgeCardSchema)) body: ApproveKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    return this.cards.approve(req.user.physicianId, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectKnowledgeCardSchema)) body: RejectKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    return this.cards.reject(req.user.physicianId, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(archiveKnowledgeCardSchema)) body: ArchiveKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    return this.cards.archive(req.user.physicianId, id, body);
  }
}
