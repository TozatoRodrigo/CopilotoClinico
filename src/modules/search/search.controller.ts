import { Controller, Get, Inject, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type { UnifiedSearchResponse } from '../../shared/contracts/search';
import { unifiedSearchQuerySchema, type UnifiedSearchQueryInput } from './schemas/search.schemas';
import { UnifiedSearchService } from './search.service';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-502 — busca única do ⌘K. GET porque é leitura a cada pausa da
 * digitação; a linha de acesso HTTP já sai sem a querystring
 * (`pathForLog`), e o serviço não loga a busca.
 */
@Controller('search')
@UseGuards(JwtAuthGuard)
export class UnifiedSearchController {
  constructor(@Inject(UnifiedSearchService) private readonly search: UnifiedSearchService) {}

  @Get()
  find(
    @Request() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(unifiedSearchQuerySchema)) query: UnifiedSearchQueryInput,
  ): Promise<UnifiedSearchResponse> {
    return this.search.search(req.user.physicianId, query);
  }
}
