import { Module } from '@nestjs/common';
import { KnowledgeGapsService } from './knowledge-gaps.service';

/**
 * CC-409 — registro de lacunas: o que as três fontes (análise, decisão,
 * pergunta rápida) e a publicação de cartões usam. Só depende do Prisma e
 * da trilha (módulos globais), para os cartões, o Copiloto e a pergunta
 * rápida importarem sem ciclo. A fila do curador fica no
 * `KnowledgeGapQueueModule`, que importa os cartões (rascunho por IA).
 */
@Module({
  providers: [KnowledgeGapsService],
  exports: [KnowledgeGapsService],
})
export class KnowledgeGapsModule {}
