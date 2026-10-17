import { Controller, Get, Inject, Param, ParseUUIDPipe, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { PublishedKnowledgeCard } from '../../shared/contracts/knowledge-cards';
import { KnowledgeCardsService } from './knowledge-cards.service';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-408 — o cartão publicado para o médico do plantão: o link do "Revisado
 * por" na tela do plano. Só leitura e só a versão assinada; a revisão fica em
 * `admin/knowledge-cards`, com a barreira da curadoria.
 */
@Controller('knowledge-cards')
@UseGuards(JwtAuthGuard)
export class PublishedKnowledgeCardsController {
  constructor(@Inject(KnowledgeCardsService) private readonly cards: KnowledgeCardsService) {}

  @Get(':id')
  get(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublishedKnowledgeCard> {
    return this.cards.getPublished(req.user.physicianId, id);
  }
}
