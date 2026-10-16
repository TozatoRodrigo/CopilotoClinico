/**
 * CC-403 — rascunho de cartões por IA a partir da lista priorizada de temas.
 *
 * Para cada tema, pede cartões ao modelo com os trechos de diretriz já
 * ingeridos e grava os que passam na checagem de citação (em revisão, ou em
 * rascunho com --draft-only). Os rejeitados ficam no registro do rascunho,
 * com o motivo. Mesmo serviço do POST /admin/knowledge-cards/drafts.
 *
 * Uso: ver DRAFT_CLI_USAGE (pnpm cards:draft --help).
 *
 * Código de saída 1 quando algum tema falha — para o lote não esconder erro.
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { KnowledgeCardsModule } from '../../src/modules/knowledge-cards/knowledge-cards.module';
import { KnowledgeCardDraftService } from '../../src/modules/knowledge-cards/drafting/card-draft.service';
import {
  DRAFT_CLI_USAGE,
  parseDraftCli,
} from '../../src/modules/knowledge-cards/drafting/draft-cli';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    AuditModule,
    KnowledgeCardsModule,
  ],
})
class CardDraftCliModule {}

async function main(): Promise<number> {
  const cli = parseDraftCli(process.argv.slice(2));
  if (cli.kind === 'help') {
    console.log(DRAFT_CLI_USAGE);
    return 0;
  }
  if (cli.kind === 'error') {
    console.error(`${cli.message}\n\n${DRAFT_CLI_USAGE}`);
    return 1;
  }

  const app = await NestFactory.createApplicationContext(CardDraftCliModule, {
    logger: ['error', 'warn'],
  });
  let failures = 0;
  try {
    const drafts = app.get(KnowledgeCardDraftService);
    for (const request of cli.requests) {
      try {
        const { draft, cardIds } = await drafts.draft({
          topic: request.topic,
          syndrome: request.syndrome ?? null,
          institutionId: request.institutionId ?? null,
          chunkIds: request.chunkIds,
          requestedBy: null,
          submitForReview: request.submitForReview,
        });
        if (draft.status === 'failed') failures++;
        console.log(
          `${draft.status === 'failed' ? '✗' : '✓'} ${request.topic} — rascunho ${draft.id}: ` +
            `${draft.cardsAccepted} aceito(s), ${draft.cardsRejected} rejeitado(s), ` +
            `US$ ${draft.costUsd.toFixed(4)}${draft.failureReason ? ` — ${draft.failureReason}` : ''}`,
        );
        for (const rejection of draft.rejections) {
          console.log(`    rejeitado #${rejection.index + 1}: ${rejection.question}`);
          for (const issue of rejection.issues) {
            console.log(`      - ${issue.path || '(cartão)'}: ${issue.message}`);
          }
        }
        for (const cardId of cardIds) console.log(`    cartão ${cardId}`);
      } catch (error) {
        failures++;
        console.error(`✗ ${request.topic}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await app.close();
  }
  return failures > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
