/**
 * CC-406 — refaz o índice semântico dos cartões revisados: indexa o cartão
 * publicado que falta, reembute o que mudou de texto ou de modelo de
 * embedding e tira o que venceu, foi arquivado ou perdeu a versão publicada.
 * É o mesmo trabalho da varredura diária (04:00 UTC), sob demanda — depois de
 * trocar o provedor ou o modelo de embedding, ou de o provedor voltar.
 *
 * Usa o provedor de embedding configurado (`EMBEDDING_PROVIDER`,
 * `AI_EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`): só os cartões que precisam de
 * vetor geram chamada. Com `EMBEDDING_PROVIDER=none`, grava as linhas sem
 * vetor e não chama ninguém.
 *
 * Uso:
 *   pnpm cards:reindex
 *
 * Código de saída 1 quando a sincronização falha ou algum cartão ficou sem
 * vetor com o provedor ligado — para o passo de release não seguir com o
 * índice pela metade.
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { KnowledgeCardIndexModule } from '../../src/modules/knowledge-cards/card-index/knowledge-card-index.module';
import { CardIndexService } from '../../src/modules/knowledge-cards/card-index/card-index.service';
import {
  CARD_EMBEDDER,
  type CardEmbedder,
} from '../../src/modules/knowledge-cards/card-index/card-embedder';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    KnowledgeCardIndexModule,
  ],
})
class CardReindexCliModule {}

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(CardReindexCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const embedder = app.get<CardEmbedder>(CARD_EMBEDDER);
    const { provider, model } = embedder.identity();
    console.log(
      `Embedding: ${embedder.enabled() ? `${provider} · ${model}` : 'desligado (EMBEDDING_PROVIDER=none)'}`,
    );

    const report = await app.get(CardIndexService).syncAll();
    const ineligible = Object.entries(report.ineligible)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ');
    console.log(
      `Índice: ${report.embedded} com vetor novo, ${report.unchanged} sem mudança, ` +
        `${report.withoutEmbedding} sem vetor, ${report.removed} linha(s) removida(s)` +
        (ineligible ? ` (fora do índice: ${ineligible})` : ''),
    );
    return embedder.enabled() && report.withoutEmbedding > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
