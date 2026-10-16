import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { WhisperService } from '../../src/modules/audio/whisper.service';
import { WHISPER_MODELS } from '../../src/modules/audio/whisper.settings';
import { loadDotEnvFiles } from '../clinical/variants';
import { DatasetError, ffprobeDuration, loadSamples, ProbeUnavailableError } from './dataset';
import { plannedCostUsd } from './pricing';
import { buildReport, renderReport, renderSummaryTable } from './report';
import { runTranscriptions, type CallOutcome } from './runner';
import { CLINICAL_VOCABULARY } from './vocabulary';
import { createWhisperTranscriber } from './whisper-transcriber';

/**
 * CC-205 — compara modelos Whisper em ditados lidos por médicos. Ver
 * docs/evals/transcricao.md. O console mostra só ids e métricas; o relatório
 * (fora do git) traz também os números e termos clínicos que divergiram.
 */

const USAGE = `Uso: pnpm eval:transcription [opções]

  --audio-dir <dir>     Pasta com <id>.webm|m4a|wav + <id>.txt. Padrão: evals/transcription/audio-local.
  --model <modelo>      ${WHISPER_MODELS.join(' | ')} (repita para vários). Padrão: todos.
  --max-usd <US$>       Teto de gasto estimado (padrão 0.50, máximo 10). Plano acima do teto não começa.
  --concurrency <n>     Chamadas em paralelo (padrão 1, máximo 3).
  --out <dir>           Padrão: evals/transcription/out.
  --save-transcripts    Grava as transcrições ao lado do relatório, para revisão manual.
  --dry-run             Mostra o plano e o custo estimado e sai sem chamar a API.

Saída: 0 = concluído; 1 = falha do harness ou plano acima do teto; 2 = parou antes do fim
(limite de uso, chave recusada ou teto).`;

const CliSchema = z.object({
  audioDir: z.string(),
  models: z.array(z.enum(WHISPER_MODELS)).min(1),
  maxUsd: z.coerce.number().positive().max(10),
  concurrency: z.coerce.number().int().min(1).max(3),
  out: z.string(),
  saveTranscripts: z.boolean(),
  dryRun: z.boolean(),
  help: z.boolean(),
});
type CliOptions = z.infer<typeof CliSchema>;

function parseCli(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      'audio-dir': { type: 'string', default: join(__dirname, 'audio-local') },
      model: { type: 'string', multiple: true },
      'max-usd': { type: 'string', default: '0.50' },
      concurrency: { type: 'string', default: '1' },
      out: { type: 'string', default: join(__dirname, 'out') },
      'save-transcripts': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return CliSchema.parse({
    audioDir: resolve(values['audio-dir']),
    models: [...new Set(values.model ?? WHISPER_MODELS)],
    maxUsd: values['max-usd'].replace(',', '.'),
    concurrency: values.concurrency,
    out: resolve(values.out),
    saveTranscripts: values['save-transcripts'],
    dryRun: values['dry-run'],
    help: values.help,
  });
}

function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

function describeOutcome(outcome: CallOutcome): string {
  if (outcome.kind === 'ok') return `ok ${decimal(outcome.latencyMs / 1000, 1)} s`;
  if (outcome.kind === 'skipped') return 'não feita (execução parada)';
  const status = outcome.status === null ? '' : ` HTTP ${outcome.status}`;
  return `erro ${outcome.failure}${status}`;
}

async function main(): Promise<number> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const samples = await loadSamples(options.audioDir, ffprobeDuration);
  const audioSec = samples.reduce((sum, sample) => sum + sample.durationSec, 0);
  const planned = plannedCostUsd(
    samples.map((sample) => sample.durationSec),
    options.models,
  );
  for (const sample of samples) {
    console.log(`  ${sample.id}  ${decimal(sample.durationSec, 1)} s  ${sample.mimeType}`);
  }
  console.log(
    `Plano: ${samples.length} áudios (${decimal(audioSec / 60, 1)} min) × ${options.models.join(', ')}; ` +
      `custo estimado US$ ${decimal(planned, 4)} (teto US$ ${decimal(options.maxUsd, 4)}); ` +
      `${options.concurrency} chamada(s) por vez.`,
  );
  if (planned > options.maxUsd) {
    console.error('O plano passa do teto. Reduza os áudios ou os modelos, ou suba --max-usd.');
    return 1;
  }
  if (options.dryRun) return 0;

  loadDotEnvFiles();
  if (!process.env.WHISPER_API_KEY?.trim()) {
    console.error('Falta WHISPER_API_KEY (a chave da Groq), no ambiente ou no .env.');
    return 1;
  }
  const whisper = new WhisperService(new ConfigService(process.env));
  whisper.onModuleInit();

  const result = await runTranscriptions(samples, createWhisperTranscriber(whisper), {
    models: options.models,
    maxUsd: options.maxUsd,
    concurrency: options.concurrency,
    onOutcome: (outcome, done, total) =>
      console.log(`[${done}/${total}] ${outcome.id} ${outcome.model}: ${describeOutcome(outcome)}`),
  });

  const report = buildReport({
    samples,
    models: options.models,
    result,
    vocabulary: CLINICAL_VOCABULARY,
    maxUsd: options.maxUsd,
    generatedAt: new Date(),
  });
  const runDir = join(options.out, report.generatedAt.replace(/[:.]/g, '-'));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'report.md'), renderReport(report));
  if (options.saveTranscripts) {
    for (const outcome of result.outcomes) {
      if (outcome.kind !== 'ok') continue;
      const modelDir = join(runDir, 'transcripts', outcome.model);
      mkdirSync(modelDir, { recursive: true });
      writeFileSync(join(modelDir, `${outcome.id}.txt`), `${outcome.transcript}\n`);
    }
  }

  console.log(`\n${renderSummaryTable(report)}\n\nRelatório em ${join(runDir, 'report.md')}`);
  if (result.stop) {
    console.error(
      `Parou antes do fim (${result.stop.reason}) em ${result.stop.id} com ${result.stop.model}.`,
    );
    return 2;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof DatasetError || error instanceof ProbeUnavailableError) {
      console.error(error.message);
    } else if (error instanceof z.ZodError) {
      console.error(`${error.issues.map((issue) => issue.message).join('\n')}\n\n${USAGE}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  },
);
