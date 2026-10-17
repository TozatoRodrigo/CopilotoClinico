import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { readFlag } from '../../src/modules/ai-gateway/ai-gateway.settings';
import { DEFAULT_PROFILE } from '../../src/modules/ai-gateway/provider-profiles';
import { AI_EFFORTS } from '../../src/modules/ai-gateway/providers/provider.interface';
import { screenClinicalText } from '../../src/modules/copilot/guardrails/clinical-text-screening';
import { maskPII } from '../../src/modules/copilot/guardrails/pii-filter';
import { buildIntakeReadingMessages } from '../../src/modules/copilot/intake/intake-reading-prompt';
import { INTAKE_READING_TIMEOUT_MS } from '../../src/modules/copilot/intake/intake.settings';
import { readUnderstandingEffort } from '../../src/modules/copilot/understanding/understanding.settings';
import { costUsd } from '../clinical/pricing';
import { appendJsonLine, readJsonLines } from '../clinical/records';
import { formatMs, formatUsd } from '../clinical/report';
import { loadDotEnvFiles } from '../clinical/variants';
import {
  INTAKE_CASE_SETS,
  loadIntakeCaseSet,
  selectIntakeCases,
  type IntakeCase,
} from './case.schema';
import { SpendGuard } from './guard';
import { MeteredGateway } from './metered-gateway';
import { createIntakeReader } from './reader';
import {
  readRunMeta,
  ReadingRowSchema,
  RUN_FILES,
  writeRunMeta,
  type ModelRoute,
  type ReadingRow,
  type RunMeta,
} from './records';
import { renderReport, summarizeRun } from './report';
import { planTasks, runIntakeEval } from './runner';

/**
 * CC-104 — mede a leitura do caso (intake_reading) por modelo: latência até a
 * leitura e até a primeira pergunta, e erros de dado contra o gabarito. Ver
 * docs/evals/leitura-do-caso.md.
 */

/** Os candidatos da CC-104: o de produção, o rápido da Anthropic e o gpt-oss na Groq. */
const DEFAULT_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'groq:openai/gpt-oss-120b'];

const USAGE = `Uso: pnpm eval:intake --max-usd <US$> [opções]

Roda só a leitura do caso (intake_reading) de cada caso em cada modelo e compara
sexo, idade, sinais vitais, síndrome, instabilidade e tempo-crítico com o gabarito.

  --model <perfil:modelo>  Modelo a medir (repita). Padrão: ${DEFAULT_MODELS.join(', ')}.
  --set <conjunto>         seed (padrão): evals/intake/cases, do gabarito clínico.
                           local: evals/intake/cases-local, os casos reais anonimizados (fora do git).
  --cases <seletor>        Ids ou globs no id, separados por vírgula. Padrão: todos do conjunto.
  --reps <n>               Repetições por caso e modelo (padrão 1, até 5).
  --concurrency <n>        Leituras em paralelo (padrão 1, até 3).
  --max-usd <US$>          Teto de gasto da rodada. Obrigatório para rodar; atingido, a rodada para.
  --effort <nível>         Esforço da leitura (AI_UNDERSTANDING_EFFORT). Padrão: o do ambiente (low).
  --case-timeout-ms <ms>   Teto de relógio de uma leitura no harness (padrão 90000).
  --out <dir>              Padrão: evals/intake/runs.
  --dry-run                Mostra o plano e a estimativa de custo e sai, sem chamar modelo.
  --report <runDir>        Refaz o report.md de uma rodada com o gabarito atual, sem chamar modelo.

Para na primeira resposta de limite de uso do provedor ("usage limits").
Saída: 0 = rodada completa; 3 = interrompida (teto de gasto ou limite do provedor); 1 = falha.`;

const CliSchema = z.object({
  models: z.array(z.string().trim().min(1)).min(1),
  set: z.enum(['seed', 'local']),
  cases: z.string().optional(),
  reps: z.coerce.number().int().min(1).max(5),
  concurrency: z.coerce.number().int().min(1).max(3),
  maxUsd: z.coerce.number().positive().optional(),
  effort: z.enum(AI_EFFORTS).optional(),
  caseTimeoutMs: z.coerce.number().int().min(1_000),
  out: z.string(),
  dryRun: z.boolean(),
  report: z.string().optional(),
  help: z.boolean(),
});

type CliOptions = z.infer<typeof CliSchema>;

function parseCli(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      model: { type: 'string', multiple: true },
      set: { type: 'string', default: 'seed' },
      cases: { type: 'string' },
      reps: { type: 'string', default: '1' },
      concurrency: { type: 'string', default: '1' },
      'max-usd': { type: 'string' },
      effort: { type: 'string' },
      'case-timeout-ms': { type: 'string', default: '90000' },
      out: { type: 'string', default: join(__dirname, 'runs') },
      'dry-run': { type: 'boolean', default: false },
      report: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return CliSchema.parse({
    models: [...new Set(values.model ?? DEFAULT_MODELS)],
    set: values.set,
    cases: values.cases,
    reps: values.reps,
    concurrency: values.concurrency,
    maxUsd: values['max-usd'],
    effort: values.effort,
    caseTimeoutMs: values['case-timeout-ms'],
    out: values.out,
    dryRun: values['dry-run'],
    report: values.report,
    help: values.help,
  });
}

function gitInfo(): RunMeta['git'] {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
    const dirty =
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf-8' }).trim() !== '';
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

const PROFILE_PREFIX = /^([a-z][a-z0-9_]*):/;

/**
 * Para onde vai cada modelo. Um prefixo com cara de perfil que não está em
 * AI_PROVIDER_PROFILES iria inteiro ao provedor padrão ("groq:..." na
 * Anthropic): falha aqui, antes de qualquer chamada.
 */
function resolveRoute(gateway: AiGatewayService, ref: string): ModelRoute {
  const route = gateway.route(ref);
  const prefix = PROFILE_PREFIX.exec(ref.toLowerCase())?.[1];
  if (prefix && route.profile === DEFAULT_PROFILE) {
    throw new Error(
      `--model ${ref}: o perfil "${prefix}" não está configurado. Defina AI_PROVIDER_PROFILES=${prefix} ` +
        `e as AI_PROVIDER_${prefix.toUpperCase()}_* (docs/evals/leitura-do-caso.md).`,
    );
  }
  return { ref, profile: route.profile, provider: route.provider.name, model: route.model };
}

/**
 * Estimativa grosseira, para escolher o --max-usd: entrada pelo tamanho do
 * prompt de cada caso; saída suposta (raciocínio + JSON + perguntas) e um
 * retry de validação a cada quatro leituras.
 */
const ASSUMED_OUTPUT_TOKENS = 2_500;
const CHARS_PER_TOKEN = 3.5;
const RETRY_ALLOWANCE = 1.25;

function estimateUsd(route: ModelRoute, cases: readonly IntakeCase[], reps: number): number | null {
  let total = 0;
  for (const intakeCase of cases) {
    const messages = buildIntakeReadingMessages({
      caseText: intakeCase.input.caseText,
      redFlags: intakeCase.input.redFlags,
    });
    const promptTokens = Math.ceil(
      messages.reduce((sum, message) => sum + message.content.length, 0) / CHARS_PER_TOKEN,
    );
    const cost = costUsd(route.model, {
      promptTokens,
      completionTokens: ASSUMED_OUTPUT_TOKENS,
      totalTokens: promptTokens + ASSUMED_OUTPUT_TOKENS,
    });
    if (cost === null) return null;
    total += cost;
  }
  return total * reps * RETRY_ALLOWANCE;
}

function describeRow(row: ReadingRow): string {
  const cost = row.calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  const timing =
    row.readingMs === null
      ? ''
      : ` · leitura ${formatMs(row.readingMs)}${row.firstQuestionMs === null ? '' : ` · 1ª pergunta ${formatMs(row.firstQuestionMs)}`}`;
  const failure = row.failure ? ` (${row.failure})` : '';
  return `${row.model} · ${row.caseId}#${row.rep}: ${row.outcome}${failure}${timing} · ${formatUsd(cost)}`;
}

function writeReport(runDir: string): RunMeta {
  const meta = readRunMeta(runDir);
  const caseSet = loadIntakeCaseSet(INTAKE_CASE_SETS[meta.caseSet.set]);
  if (caseSet.version !== meta.caseSet.version) {
    console.warn(
      `⚠️ O gabarito mudou desde a rodada (${meta.caseSet.version} → ${caseSet.version}): a nota usa o ATUAL.`,
    );
  }
  const casesById = new Map(caseSet.cases.map((intakeCase) => [intakeCase.id, intakeCase]));
  const rows = readJsonLines(join(runDir, RUN_FILES.rows), ReadingRowSchema);
  for (const caseId of new Set(rows.map((row) => row.caseId))) {
    if (!casesById.has(caseId)) console.warn(`⚠️ ${caseId} não está mais no gabarito: sem nota.`);
  }
  const report = renderReport(meta, rows, summarizeRun(meta, rows, casesById));
  writeFileSync(join(runDir, RUN_FILES.report), report);
  return meta;
}

async function main(): Promise<number> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.report) {
    const runDir = resolve(options.report);
    writeReport(runDir);
    console.log(`Relatório refeito: ${join(runDir, RUN_FILES.report)}`);
    return 0;
  }

  const loadedEnvFiles = loadDotEnvFiles();
  const caseSet = loadIntakeCaseSet(INTAKE_CASE_SETS[options.set]);
  const cases = selectIntakeCases(caseSet.cases, options.cases);

  // Sem as novas tentativas dos provedores compatíveis com a OpenAI: a espera
  // de um 429 entraria na latência. O harness refaz a leitura inteira (runner.ts).
  const baseEnv: Record<string, string> = {
    AI_REQUEST_MAX_RETRIES: '0',
    ...(options.effort ? { AI_UNDERSTANDING_EFFORT: options.effort } : {}),
  };
  const baseConfig = new ConfigService(baseEnv);
  // O gateway anuncia os perfis no log da Nest; a rodada só mostra aviso e erro.
  Logger.overrideLogger(['warn', 'error']);
  const gateway = new AiGatewayService(baseConfig);
  const routes = options.models.map((ref) => resolveRoute(gateway, ref));

  console.log(
    `Gabarito ${options.set} (${caseSet.version}): ${cases.length} caso(s) × ${options.reps} repetição(ões)` +
      `${loadedEnvFiles.length > 0 ? ` · ambiente de ${loadedEnvFiles.join(', ')}` : ''}`,
  );
  let estimatedTotal = 0;
  let unknownEstimate = false;
  for (const route of routes) {
    const estimate = estimateUsd(route, cases, options.reps);
    if (estimate === null) unknownEstimate = true;
    else estimatedTotal += estimate;
    console.log(
      `  ${route.ref} → ${route.provider} · ${route.model} (perfil ${route.profile}) · estimativa ${formatUsd(estimate)}`,
    );
  }
  const estimateText = `${formatUsd(estimatedTotal)}${unknownEstimate ? ' + modelos sem preço' : ''}`;
  console.log(`  Estimativa da rodada: ${estimateText}`);
  for (const intakeCase of cases) {
    if (!screenClinicalText(maskPII(intakeCase.input.caseText), null).injection.safe) {
      console.warn(
        `  ⚠️ ${intakeCase.id}: em produção, a triagem de injeção recusaria este texto.`,
      );
    }
  }

  if (options.dryRun) {
    for (const intakeCase of cases) console.log(`  · ${intakeCase.id}`);
    return 0;
  }
  if (options.maxUsd === undefined) {
    console.error(
      `Informe --max-usd: o teto de gasto da rodada (estimativa: ${estimateText}). ` +
        'O workspace da Anthropic é o mesmo da produção; confira o limite que resta antes.',
    );
    return 1;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(options.out, runId);
  mkdirSync(runDir, { recursive: true });
  const tasks = planTasks(
    routes.map((route) => route.ref),
    cases,
    options.reps,
  );
  const meta: RunMeta = {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    git: gitInfo(),
    caseSet: {
      set: options.set,
      version: caseSet.version,
      selector: options.cases ?? null,
      caseIds: cases.map((intakeCase) => intakeCase.id),
    },
    models: routes,
    reps: options.reps,
    concurrency: options.concurrency,
    caseTimeoutMs: options.caseTimeoutMs,
    maxUsd: options.maxUsd,
    settings: {
      effort: readUnderstandingEffort(baseConfig),
      structuredOutput: readFlag(baseConfig, 'AI_STRUCTURED_OUTPUT', true),
      productionTimeoutMs: INTAKE_READING_TIMEOUT_MS,
    },
    plannedTasks: tasks.length,
    spentUsd: 0,
    stop: null,
  };
  writeRunMeta(runDir, meta);
  console.log(`▶ ${tasks.length} leitura(s), teto ${formatUsd(options.maxUsd)} — ${runDir}`);

  const guard = new SpendGuard(options.maxUsd);
  const read = createIntakeReader({
    gateway: new MeteredGateway(gateway, guard),
    configFor: (model) => new ConfigService({ ...baseEnv, AI_INTAKE_MODEL: model }),
  });
  const result = await runIntakeEval(
    tasks,
    {
      read,
      guard,
      onRow: (row, finished, total) => {
        appendJsonLine(join(runDir, RUN_FILES.rows), row);
        console.log(`  [${finished}/${total}] ${describeRow(row)}`);
      },
    },
    { concurrency: options.concurrency, caseTimeoutMs: options.caseTimeoutMs },
  );

  writeRunMeta(runDir, {
    ...meta,
    finishedAt: new Date().toISOString(),
    spentUsd: guard.spentUsd,
    stop: result.stop,
  });
  writeReport(runDir);
  if (result.stop) {
    console.error(
      `⏹ Rodada interrompida (${result.stop.kind}); ${result.skipped} leitura(s) não começaram.`,
    );
  }
  console.log(
    `Gasto somado ${formatUsd(guard.spentUsd)} · relatório ${join(runDir, RUN_FILES.report)}`,
  );
  return result.stop ? 3 : 0;
}

// Saída explícita: uma leitura abandonada pelo teto de tempo pode manter o
// processo vivo depois de tudo gravado.
main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
