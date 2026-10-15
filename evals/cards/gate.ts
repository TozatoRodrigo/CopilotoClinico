/**
 * CC-407 — bake-off do portão de relevância: roda o portão por limiar, o Jev
 * e o reranker sobre os pares (situação, cartão) rotulados pelos médicos e
 * grava um relatório com precisão, revocação, F1, calibração, latência,
 * custo e o limiar sugerido de cada um. Ver docs/evals/portao-de-relevancia.md.
 *
 *   pnpm eval:card-gate --dry-run                 # só a estimativa de gasto
 *   pnpm eval:card-gate                           # gate-pairs.json e cartões do banco
 *   pnpm eval:card-gate --gates jev --max-usd 0.10
 *
 * Só leitura: nada muda no banco nem no índice. O Jev é pago (por token) e
 * recebe o texto das situações; rode só com o DPA da TypeSafe assinado.
 */
import 'reflect-metadata';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { PrismaService } from '../../src/config/prisma.service';
import {
  CARD_GATE_KINDS,
  readCardRerankerSettings,
  readJevGateMinProbability,
  type CardGateKind,
} from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate.settings';
import type { RelevanceCard } from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate';
import { TeiCardReranker } from '../../src/modules/knowledge-cards/card-retrieval/card-reranker';
import { JevRelevanceGate } from '../../src/modules/knowledge-cards/card-retrieval/jev-relevance-gate';
import { RerankerRelevanceGate } from '../../src/modules/knowledge-cards/card-retrieval/reranker-relevance-gate';
import {
  REVIEWED_CARD_SELECT,
  toReviewedCard,
} from '../../src/modules/knowledge-cards/card-retrieval/reviewed-card-view';
import { readReviewedCardsSettings } from '../../src/modules/knowledge-cards/card-retrieval/reviewed-cards.settings';
import { describeDatabaseUrl, formatDatabaseTarget } from '../clinical/db-safety';
import { ENV_FILE_PATHS, loadDotEnvFiles } from '../clinical/variants';
import {
  renderBakeoffMarkdown,
  runBakeoff,
  scoredBakeoffGate,
  summarizeRun,
  thresholdBakeoffGate,
  type BakeoffGate,
} from './gate-bakeoff';
import { groupBySituation, loadGateCards, loadGatePairs, missingCards } from './gate-pairs';
import { TARGET_PRECISION } from './gate-scoring';

const USAGE = `Uso: pnpm eval:card-gate [opções]

  --pairs <arquivo>        Padrão: evals/cards/gate-pairs.json; sem ele, a semente (gate-pairs.seed.json).
  --cards <arquivo>        Cartões em JSON. Padrão: os publicados do banco (DATABASE_URL);
                           com a semente, gate-cards.seed.json.
  --gates <lista>          threshold,jev,reranker (padrão: os três).
  --min-precision <0-1>    Precisão mínima para sugerir limiar. Padrão: ${TARGET_PRECISION}.
  --max-usd <valor>        Teto de gasto somado dos portões. Padrão: 0.50.
  --out <arquivo.md>       Relatório. Padrão: evals/cards/runs/gate-<data>.md.
  --json <arquivo>         Também grava escores por par e métricas em JSON.
  --dry-run                Só estima tokens e custo; não chama nenhum portão.
`;

const HERE = __dirname;
const SEED_PAIRS = join(HERE, 'gate-pairs.seed.json');
const SEED_CARDS = join(HERE, 'gate-cards.seed.json');

interface Options {
  pairsFile: string;
  cardsFile: string | null;
  gates: CardGateKind[];
  minPrecision: number;
  maxUsd: number;
  out: string;
  json: string | null;
  dryRun: boolean;
}

function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      pairs: { type: 'string' },
      cards: { type: 'string' },
      gates: { type: 'string' },
      'min-precision': { type: 'string' },
      'max-usd': { type: 'string' },
      out: { type: 'string' },
      json: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const local = join(HERE, 'gate-pairs.json');
  const pairsFile = values.pairs ?? (existsSync(local) ? local : SEED_PAIRS);
  const gates = (values.gates ?? CARD_GATE_KINDS.join(','))
    .split(',')
    .map((gate) => gate.trim())
    .filter(Boolean);
  const unknown = gates.filter((gate) => !(CARD_GATE_KINDS as readonly string[]).includes(gate));
  if (gates.length === 0 || unknown.length > 0) {
    throw new Error(
      `--gates inválido (${unknown.join(', ') || 'vazio'}): use ${CARD_GATE_KINDS.join(', ')}`,
    );
  }
  const minPrecision = Number(values['min-precision'] ?? TARGET_PRECISION);
  if (!(minPrecision > 0 && minPrecision <= 1)) throw new Error('--min-precision entre 0 e 1');
  const maxUsd = Number(values['max-usd'] ?? 0.5);
  if (!(maxUsd >= 0) || !Number.isFinite(maxUsd)) throw new Error('--max-usd precisa ser ≥ 0');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    pairsFile,
    cardsFile: values.cards ?? (pairsFile === SEED_PAIRS ? SEED_CARDS : null),
    gates: [...new Set(gates)] as CardGateKind[],
    minPrecision,
    maxUsd,
    out: values.out ?? join(HERE, 'runs', `gate-${stamp}.md`),
    json: values.json ?? null,
    dryRun: values['dry-run'],
  };
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE_PATHS }), PrismaModule],
})
class CardGateEvalModule {}

/** Os cartões dos pares, publicados e dentro da validade — o que a análise poderia usar. */
async function loadCardsFromDatabase(cardIds: readonly string[]): Promise<RelevanceCard[]> {
  const app = await NestFactory.createApplicationContext(CardGateEvalModule, {
    logger: ['error', 'warn'],
  });
  try {
    const database = process.env.DATABASE_URL
      ? formatDatabaseTarget(describeDatabaseUrl(process.env.DATABASE_URL))
      : '(DATABASE_URL ausente)';
    console.log(`Cartões de ${database}`);
    const rows = await app.get(PrismaService).knowledgeCard.findMany({
      where: { id: { in: [...cardIds] } },
      select: REVIEWED_CARD_SELECT,
    });
    const now = Date.now();
    return rows.flatMap((row) => {
      const card = toReviewedCard(row);
      return card && new Date(card.validUntil).getTime() > now ? [card] : [];
    });
  } finally {
    await app.close();
  }
}

function buildGates(kinds: readonly CardGateKind[], config: ConfigService): BakeoffGate[] {
  return kinds.map((kind) => {
    if (kind === 'threshold') {
      return thresholdBakeoffGate(readReviewedCardsSettings(config).minSimilarity);
    }
    const fetchImpl = globalThis.fetch.bind(globalThis);
    if (kind === 'jev') {
      return scoredBakeoffGate(
        'jev',
        new JevRelevanceGate(config, fetchImpl),
        readJevGateMinProbability(config),
        'sem JEV_API_KEY',
      );
    }
    return scoredBakeoffGate(
      'reranker',
      new RerankerRelevanceGate(config, new TeiCardReranker(config, fetchImpl)),
      readCardRerankerSettings(config).minScore,
      'sem CARD_RERANKER_URL',
    );
  });
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  loadDotEnvFiles();
  const config = new ConfigService(process.env);

  const pairs = loadGatePairs(options.pairsFile);
  const cardIds = [...new Set(pairs.map((pair) => pair.cardId))];
  const cardList = options.cardsFile
    ? loadGateCards(options.cardsFile)
    : await loadCardsFromDatabase(cardIds);
  const cards = new Map(cardList.map((card) => [card.cardId, card]));
  const missing = missingCards(pairs, cards);
  if (missing.length > 0) {
    console.error(
      `Cartão sem versão publicada e válida (ou id errado):\n  ${missing.join('\n  ')}`,
    );
    return 1;
  }

  const groups = groupBySituation(pairs);
  const gates = buildGates(options.gates, config);
  const seedPairs = pairs.filter((pair) => pair.labeler.kind === 'seed').length;
  console.log(
    `${pairs.length} par(es) em ${groups.length} situação(ões), ${cards.size} cartão(ões) · ` +
      `portões: ${options.gates.join(', ')} · teto US$ ${options.maxUsd}` +
      (seedPairs > 0 ? ` · ${seedPairs} par(es) semente, sem rótulo de médico` : ''),
  );

  if (options.dryRun) {
    for (const gate of gates) {
      const tokens = groups.reduce(
        (sum, group) =>
          sum +
          gate.estimateInputTokens(
            group.pairs.map((pair) => ({
              card: cards.get(pair.cardId)!,
              similarity: pair.similarity ?? Number.NaN,
            })),
            group.context,
          ),
        0,
      );
      const unavailable = gate.unavailable();
      console.log(
        `  ${gate.kind}: ~${tokens} tokens de entrada, ~US$ ${((tokens * gate.usdPerMillionInputTokens) / 1_000_000).toFixed(6)}` +
          (unavailable ? ` (não rodaria: ${unavailable})` : ''),
      );
    }
    return 0;
  }

  const { runs, spentUsd } = await runBakeoff(groups, cards, gates, {
    maxUsd: options.maxUsd,
    maxConsecutiveFailures: 3,
  });
  const summaries = runs.map((run) => summarizeRun(run, options.minPrecision));
  const markdown = renderBakeoffMarkdown({
    generatedAt: new Date().toISOString(),
    pairsFile: relative(process.cwd(), options.pairsFile),
    cardsSource: options.cardsFile
      ? `\`${relative(process.cwd(), options.cardsFile)}\``
      : 'publicados no banco',
    pairs: pairs.length,
    relevant: pairs.filter((pair) => pair.label === 'relevant').length,
    seedPairs,
    labelers: [
      ...new Set(pairs.map((pair) => (pair.labeler.kind === 'seed' ? 'semente' : pair.labeler.id))),
    ],
    minPrecision: options.minPrecision,
    maxUsd: options.maxUsd,
    spentUsd,
    summaries,
    runs,
  });

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, markdown);
  for (const summary of summaries) {
    const suggested = summary.suggested
      ? `limiar sugerido ${summary.thresholdEnv}=${summary.suggested.threshold.toFixed(3)} ` +
        `(precisão ${((summary.suggested.precision.rate ?? 0) * 100).toFixed(1)}%, ` +
        `revocação ${((summary.suggested.recall.rate ?? 0) * 100).toFixed(1)}%)`
      : 'nenhum limiar atinge a precisão mínima';
    console.log(
      `  ${summary.kind}: ${summary.judged}/${summary.total} julgados · ${suggested}` +
        (summary.stopped ? ` · ${summary.stopped.reason}: ${summary.stopped.detail}` : ''),
    );
  }
  console.log(
    `Relatório em ${relative(process.cwd(), options.out)} · gasto US$ ${spentUsd.toFixed(4)}`,
  );
  if (options.json) {
    writeFileSync(options.json, JSON.stringify({ summaries, runs }, null, 2));
    console.log(`JSON em ${options.json}`);
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
