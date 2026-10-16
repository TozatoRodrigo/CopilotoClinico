/**
 * Mede a de-identificação no corpus sintético (corpus.ts).
 *
 *   pnpm eval:deid                          # gera o corpus e mede a regex de hoje
 *   pnpm eval:deid --predictions a.jsonl    # mede também outro mascarador
 *
 * O corpus vai para evals/deid/out/corpus.jsonl, e já mascarado pela regex
 * para corpus-regex.jsonl (a ordem do pipeline: regex, depois o modelo). Outro
 * mascarador (o OpenMed, via openmed_redact.py) lê um desses arquivos e
 * escreve um JSONL com {"id": ..., "redacted": ...} por nota; o nome do
 * arquivo vira o nome da coluna.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import { buildDeidCorpus } from './corpus';
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

function main(): void {
  const { values } = parseArgs({
    options: {
      predictions: { type: 'string', multiple: true, default: [] },
      size: { type: 'string', default: '200' },
    },
  });
  const notes = buildDeidCorpus(Number(values.size));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, 'corpus.jsonl'),
    notes.map(({ id, text }) => JSON.stringify({ id, text })).join('\n') + '\n',
  );
  // O mesmo corpus já passado pela regex: é o que um modelo receberia no
  // pipeline, onde a regex roda primeiro e pega os números estruturados.
  writeFileSync(
    resolve(OUT_DIR, 'corpus-regex.jsonl'),
    notes.map(({ id, text }) => JSON.stringify({ id, text: maskPII(text).redacted })).join('\n') +
      '\n',
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
  const report = renderScores(scores);
  writeFileSync(resolve(OUT_DIR, 'report.md'), report);
  process.stdout.write(`${report}\nCorpus e relatório em ${OUT_DIR}\n`);
}

main();
