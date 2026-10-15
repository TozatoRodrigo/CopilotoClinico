/**
 * Mede a de-identificação no corpus sintético (corpus.ts).
 *
 *   pnpm eval:deid                          # gera o corpus e mede a regex de hoje
 *   pnpm eval:deid --predictions a.jsonl    # mede também outro mascarador
 *   pnpm eval:deid --deid-url http://127.0.0.1:8099   # e o pipeline com o modelo local (CC-203)
 *
 * O corpus vai para evals/deid/out/corpus.jsonl. Outro mascarador (o OpenMed,
 * via openmed_redact.py) lê esse arquivo e escreve um JSONL com
 * {"id": ..., "redacted": ...} por nota; o nome do arquivo vira o nome da coluna.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import { HttpDeidModelClient } from '../../src/modules/deid/deid-model.client';
import { DeidentificationService } from '../../src/modules/deid/deidentification.service';
import { buildDeidCorpus, type DeidNote } from './corpus';
import { renderScores, scoreMasker, type DeidScore } from './score';

const OUT_DIR = resolve(__dirname, 'out');

function readPredictions(path: string): Map<string, string> {
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  return new Map(
    lines.map((line) => {
      const row = JSON.parse(line) as { id?: unknown; redacted?: unknown };
      if (typeof row.id !== 'string' || typeof row.redacted !== 'string') {
        throw new Error(`Linha sem "id" e "redacted" em ${path}: ${line.slice(0, 80)}`);
      }
      return [row.id, row.redacted];
    }),
  );
}

/**
 * O pipeline de produção com DEID_MODE=model (regex → modelo → epônimos
 * protegidos), contra o serviço services/deid rodando local. Sem chamada
 * paga: o modelo é local. Queda para a regex é erro aqui, não fallback.
 */
async function deidPipeline(notes: DeidNote[], url: string): Promise<Map<string, string>> {
  Logger.overrideLogger(['warn', 'error']);
  // Só estes valores: um DEID_MODE no ambiente de quem roda não muda a medição.
  const values: Record<string, string> = {
    DEID_MODE: 'model',
    DEID_SERVICE_URL: url,
    DEID_TIMEOUT_MS: '30000',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  const deid = new DeidentificationService(config, new HttpDeidModelClient(config));
  const redacted = new Map<string, string>();
  for (const note of notes) {
    const result = await deid.deidentify(note.text, 'case');
    if (result.fallback) throw new Error(`${note.id} caiu na regex (${result.fallback}): ${url}`);
    redacted.set(note.id, result.redacted);
  }
  return redacted;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      predictions: { type: 'string', multiple: true, default: [] },
      'deid-url': { type: 'string' },
      size: { type: 'string', default: '200' },
    },
  });
  const notes = buildDeidCorpus(Number(values.size));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, 'corpus.jsonl'),
    notes.map(({ id, text }) => JSON.stringify({ id, text })).join('\n') + '\n',
  );

  const scores: DeidScore[] = [
    scoreMasker(
      'regex (maskPII)',
      notes,
      new Map(notes.map((n) => [n.id, maskPII(n.text).redacted])),
    ),
    // Cada mascarador externo também é medido somado à regex, que é como
    // ele entraria no pipeline (os números estruturados ficam com a regex).
    ...(values.predictions ?? []).flatMap((path) => {
      const predictions = readPredictions(path);
      const name = basename(path, '.jsonl');
      const withRegex = new Map(
        [...predictions].map(([id, redacted]) => [id, maskPII(redacted).redacted]),
      );
      return [
        scoreMasker(name, notes, predictions),
        scoreMasker(`${name} + regex`, notes, withRegex),
      ];
    }),
  ];
  const deidUrl = values['deid-url'];
  if (deidUrl) {
    scores.push(
      scoreMasker('regex → modelo → epônimos', notes, await deidPipeline(notes, deidUrl)),
    );
  }
  const report = renderScores(scores);
  writeFileSync(resolve(OUT_DIR, 'report.md'), report);
  process.stdout.write(`${report}\nCorpus e relatório em ${OUT_DIR}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
