/**
 * CC-406 — gabarito da busca nos cartões: mede o provedor de embedding no
 * acerto top-3 das perguntas de `retrieval-questions.json` (ou do exemplo
 * versionado) contra os cartões publicados e válidos do banco.
 *
 * Só leitura: cartões e perguntas são embutidos em memória com o mesmo texto
 * da indexação, e o índice de produção (`knowledge_card_index`) não muda.
 * Assim dá para comparar provedores trocando só o ambiente:
 *
 *   pnpm eval:card-retrieval                                   # provedor do ambiente
 *   EMBEDDING_PROVIDER=openai EMBEDDING_BASE_URL=https://api.voyageai.com/v1 \
 *     AI_EMBEDDING_MODEL=voyage-3.5 EMBEDDING_API_KEY=$VOYAGE_API_KEY \
 *     pnpm eval:card-retrieval --json voyage.json
 *
 * Opções: --questions <arquivo>, --k <n> (padrão 3), --json <saída>.
 *
 * Custa uma chamada de embedding por pergunta (para medir a latência de uma
 * consulta como a análise faz) e uma por lote de 64 cartões. Código de saída 1
 * quando o acerto top-k fica abaixo da meta da CC-406 (85%).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { PrismaService } from '../../src/config/prisma.service';
import { KnowledgeCardIndexModule } from '../../src/modules/knowledge-cards/card-index/knowledge-card-index.module';
import {
  CARD_EMBEDDER,
  type CardEmbedder,
} from '../../src/modules/knowledge-cards/card-index/card-embedder';
import {
  INDEX_CARD_SELECT,
  indexDecision,
  type CardIndexEntryDraft,
} from '../../src/modules/knowledge-cards/card-index/card-index-eligibility';
import { describeDatabaseUrl, formatDatabaseTarget } from '../clinical/db-safety';
import { percentile } from '../clinical/stats';
import {
  judgeQuestion,
  loadRetrievalQuestions,
  rankCards,
  scoreRetrieval,
  unknownExpectations,
  type CardVector,
} from './retrieval-scoring';

/** Meta da CC-406. */
const TARGET_HIT_AT_K = 0.85;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    KnowledgeCardIndexModule,
  ],
})
class CardRetrievalEvalModule {}

interface Options {
  questionsFile: string;
  k: number;
  jsonOut: string | null;
}

function parseOptions(argv: readonly string[]): Options {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const local = join(__dirname, 'retrieval-questions.json');
  const k = Number(value('--k') ?? 3);
  if (!Number.isInteger(k) || k < 1) throw new Error('--k precisa ser um inteiro ≥ 1');
  return {
    questionsFile:
      value('--questions') ??
      (existsSync(local) ? local : join(__dirname, 'retrieval-questions.example.json')),
    k,
    jsonOut: value('--json') ?? null,
  };
}

const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const questions = loadRetrievalQuestions(options.questionsFile);

  const app = await NestFactory.createApplicationContext(CardRetrievalEvalModule, {
    logger: ['error', 'warn'],
  });
  try {
    const embedder = app.get<CardEmbedder>(CARD_EMBEDDER);
    if (!embedder.enabled()) {
      console.error('Embedding desligado (EMBEDDING_PROVIDER=none): não há o que medir.');
      return 1;
    }
    const identity = embedder.identity();
    const prisma = app.get(PrismaService);
    const database = process.env.DATABASE_URL
      ? formatDatabaseTarget(describeDatabaseUrl(process.env.DATABASE_URL))
      : '(DATABASE_URL ausente)';

    const now = new Date();
    const rows = await prisma.knowledgeCard.findMany({
      where: { publishedVersionId: { not: null } },
      select: INDEX_CARD_SELECT,
    });
    const entries = rows.flatMap((row): CardIndexEntryDraft[] => {
      const decision = indexDecision(row, now);
      return decision.action === 'index' ? [decision.entry] : [];
    });
    if (entries.length === 0) {
      console.error(`Nenhum cartão publicado e válido em ${database}.`);
      return 1;
    }
    const topics = new Map(rows.map((row) => [row.id, row.topic]));
    const unknown = unknownExpectations(
      questions,
      entries.map((entry) => ({ cardId: entry.cardId, topic: topics.get(entry.cardId) ?? '' })),
    );
    if (unknown.length > 0) {
      console.error(`Esperado sem cartão publicado:\n  ${unknown.join('\n  ')}`);
      return 1;
    }

    console.log(
      `Embedding ${identity.provider} · ${identity.model} — ${entries.length} cartão(ões) de ` +
        `${database}, ${questions.length} pergunta(s), top-${options.k}`,
    );

    const cardVectors = await embedder.embed(
      entries.map((entry) => entry.text),
      'document',
    );
    const cards: CardVector[] = entries.map((entry, index) => ({
      cardId: entry.cardId,
      topic: topics.get(entry.cardId) ?? '',
      vector: cardVectors[index]!,
    }));

    const latencies: number[] = [];
    const results = [];
    for (const question of questions) {
      const started = performance.now();
      const [vector] = await embedder.embed([question.question], 'query');
      latencies.push(performance.now() - started);
      results.push(judgeQuestion(question, rankCards(vector!, cards), options.k));
    }

    const score = scoreRetrieval(results, options.k);
    console.log(
      `Acerto top-1 ${percent(score.hitAt1)} · top-${options.k} ${percent(score.hitAtK)} · ` +
        `MRR ${score.mrr.toFixed(3)} · latência da consulta p50 ${percentile(latencies, 0.5)?.toFixed(0)} ms, ` +
        `p95 ${percentile(latencies, 0.95)?.toFixed(0)} ms`,
    );
    for (const miss of score.misses) {
      const got = miss.topK
        .map((card) => `${card.topic} (${card.similarity.toFixed(3)})`)
        .join(' | ');
      console.log(`  ✗ ${miss.id}: posição ${miss.rank ?? '—'} — veio ${got}`);
    }

    if (options.jsonOut) {
      writeFileSync(
        options.jsonOut,
        JSON.stringify(
          {
            provider: identity.provider,
            model: identity.model,
            cards: entries.length,
            questions: questions.length,
            score,
            latencyMs: {
              p50: percentile(latencies, 0.5),
              p95: percentile(latencies, 0.95),
            },
            results,
          },
          null,
          2,
        ),
      );
      console.log(`Resultado em ${options.jsonOut}`);
    }
    return score.hitAtK >= TARGET_HIT_AT_K ? 0 : 1;
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
