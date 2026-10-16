import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../../src/config/prisma.service';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import {
  readChoice,
  readFlag,
  readMaxOutputTokens,
} from '../../src/modules/ai-gateway/ai-gateway.settings';
import { AI_EFFORTS } from '../../src/modules/ai-gateway/providers/provider.interface';
import { ConversationService } from '../../src/modules/copilot/intake/conversation.service';
import { IntakeService } from '../../src/modules/copilot/intake/intake.service';
import { readIntakeMode } from '../../src/modules/copilot/intake/intake.settings';
import { OrchestratorService } from '../../src/modules/copilot/orchestrator/orchestrator.service';
import {
  readIntakeReadingModel,
  readReasoningMode,
  readUnderstandingEffort,
  readUnderstandingModel,
} from '../../src/modules/copilot/understanding/understanding.settings';
import { EncountersService } from '../../src/modules/encounters/encounters.service';
import {
  readDecisionModels,
  readDecisionPipeline,
} from '../../src/modules/copilot/orchestrator/decision.settings';
import {
  readResearchEffort,
  readResearchModel,
  readWebResearchAllowedDomains,
  readWebResearchMaxSearches,
} from '../../src/modules/copilot/research/web-research.settings';
import type { ClinicalCase } from './case.schema';
import { assertNoCircularGoldCases } from './card-circularity';
import { CASE_SETS, loadCaseSet, selectCases } from './cases';
import { assertSafeDatabase, formatDatabaseTarget } from './db-safety';
import { EvalModule } from './eval.module';
import { JUDGE_PROVIDERS, type JudgeClient } from './graders/judge';
import { createJudgeClient } from './graders/judge-clients';
import { gradeResult } from './grading';
import { ensureEvalPhysician, isRefusalFallbackActive, runCase, type CaseRunRow } from './pipeline';
import { CompletionRecorder } from './recorder';
import {
  EVAL_MODES,
  GradeRowSchema,
  appendJsonLine,
  readJsonLines,
  readRunMeta,
  ResultRowSchema,
  RUN_FILES,
  writeJsonLines,
  writeRunMeta,
  type RunMeta,
} from './records';
import { loadRun, renderSummaryMarkdown, summarizeRun, type RunSummary } from './report';
import { mapWithConcurrency } from './scheduling';
import { createPhysicianSimulator } from './simulator';
import {
  defaultVariantsFile,
  loadDotEnvFiles,
  loadVariants,
  pickVariants,
  redactVariantEnv,
  resolveVariantEnv,
  withGuidedIntake,
  type Variant,
} from './variants';

/**
 * F0-A — Gabarito clínico: roda os casos pelo pipeline real e gera
 * results/errors/grades/summary por variante. Ver docs/evals/gabarito-clinico.md.
 */

const USAGE = `Uso: pnpm eval:clinical --variant <nome> [opções]

  --variant <nome>        Variante do arquivo de variantes (repita para várias). Obrigatório.
  --variants-file <path>  Padrão: evals/clinical/variants.json, ou o variants.example.json.
  --cases <seletor>       critical | glob no id (kb001-*) | tag:<tag> | id. Vírgula = união. Padrão: todos.
  --set <conjunto>        main (padrão) | blind — a prova cega, que nunca entra no ajuste de regras.
  --mode <modo>           complete (caso completo, padrão) | funnel (abertura pela conversa do
                          Copiloto guiado + médico simulado; só casos com input.funnel; liga
                          COPILOT_INTAKE se a variante não o fixar; modelo do simulador em
                          SIMULATOR_MODEL, padrão claude-haiku-5-5).
  --reps <n>              Repetições por caso (padrão 1).
  --concurrency <n>       Casos em paralelo (padrão 2).
  --judge <provedor>      anthropic | openai | none (padrão none).
  --case-timeout-ms <ms>  Teto de relógio por caso (padrão 240000).
  --out <dir>             Padrão: evals/clinical/runs.
  --allow-remote-db       Permite DATABASE_URL fora de localhost/compose de desenvolvimento.
  --dry-run               Mostra o plano (banco, variantes, casos) e sai sem chamar nada.
  --regrade <runDir>      Refaz só as notas de uma execução existente (ex.: com outro juiz).
  --reuse-judge           Com --regrade: reaproveita o veredito do juiz já gravado e refaz só a
                          parte determinística (ex.: depois de corrigir a checagem de conduta proibida).

Saída: 0 = portão aprovado ou incompleto; 2 = erro crítico no subconjunto crítico; 1 = falha do harness.`;

const CliSchema = z.object({
  variants: z.array(z.string()),
  variantsFile: z.string(),
  cases: z.string().optional(),
  set: z.enum(['main', 'blind']),
  mode: z.enum(EVAL_MODES),
  reps: z.coerce.number().int().min(1).max(20),
  concurrency: z.coerce.number().int().min(1).max(16),
  judge: z.enum([...JUDGE_PROVIDERS, 'none']),
  caseTimeoutMs: z.coerce.number().int().min(1_000),
  out: z.string(),
  allowRemoteDb: z.boolean(),
  dryRun: z.boolean(),
  regrade: z.string().optional(),
  reuseJudge: z.boolean(),
  help: z.boolean(),
});

type CliOptions = z.infer<typeof CliSchema>;

function parseCli(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      variant: { type: 'string', multiple: true },
      'variants-file': { type: 'string' },
      cases: { type: 'string' },
      set: { type: 'string', default: 'main' },
      mode: { type: 'string', default: 'complete' },
      reps: { type: 'string', default: '1' },
      concurrency: { type: 'string', default: '2' },
      judge: { type: 'string', default: 'none' },
      'case-timeout-ms': { type: 'string', default: '240000' },
      out: { type: 'string', default: join(__dirname, 'runs') },
      'allow-remote-db': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      regrade: { type: 'string' },
      'reuse-judge': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return CliSchema.parse({
    variants: values.variant ?? [],
    variantsFile: values['variants-file'] ?? defaultVariantsFile(),
    cases: values.cases,
    set: values.set,
    mode: values.mode,
    reps: values.reps,
    concurrency: values.concurrency,
    judge: values.judge,
    caseTimeoutMs: values['case-timeout-ms'],
    out: values.out,
    allowRemoteDb: values['allow-remote-db'],
    dryRun: values['dry-run'],
    regrade: values.regrade,
    reuseJudge: values['reuse-judge'],
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

async function knowledgeBaseSnapshot(prisma: PrismaService): Promise<RunMeta['knowledgeBase']> {
  const [approvedChunks, officialChunks, withEmbedding] = await Promise.all([
    prisma.guidelineChunk.count({ where: { status: 'approved' } }),
    prisma.guidelineChunk.count({ where: { status: 'official_unreviewed' } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM guideline_chunks
      WHERE status = 'approved' AND embedding IS NOT NULL`,
  ]);
  return {
    approvedChunks,
    approvedChunksWithEmbedding: Number(withEmbedding[0]?.count ?? 0),
    officialChunks,
  };
}

const OUTCOME_LABELS: Record<string, string> = {
  ok: '✓ análise entregue',
  invalid_output: '∅ sem resposta (saída inválida)',
  refusal: '∅ sem resposta (recusa)',
  truncated: '∅ sem resposta (truncada)',
};

function describeOutcome(outcome: CaseRunRow): string {
  if (outcome.kind === 'error')
    return `! erro de infraestrutura (${outcome.row.failureClass}): ${outcome.row.message}`;
  const label = OUTCOME_LABELS[outcome.row.status] ?? outcome.row.status;
  // CC-106 — só contagens: o texto das perguntas fica no results.jsonl.
  const { intake } = outcome.row;
  return intake
    ? `${label} · leitura ${intake.path}, ${intake.exchanges.length} pergunta(s) antes do plano`
    : label;
}

interface VariantRunContext {
  variant: Variant;
  env: Record<string, string>;
  cases: ClinicalCase[];
  caseSetVersion: string;
  options: CliOptions;
  database: string;
}

/** F1 — o que a variante rodou da Etapa 1, lido do mesmo jeito que o pipeline lê. */
function stagesSettings(
  config: ConfigService,
  requestedModel: string,
): Pick<RunMeta['pipeline'], 'reasoning' | 'understandingModel' | 'understandingEffort'> {
  const reasoning = readReasoningMode(config);
  if (reasoning !== 'stages') {
    return { reasoning, understandingModel: null, understandingEffort: null };
  }
  return {
    reasoning,
    understandingModel: readUnderstandingModel(config) ?? requestedModel,
    understandingEffort: readUnderstandingEffort(config),
  };
}

/** F1 — prompt da decisão, fonte de conhecimento e pesquisa, lidos como o pipeline os lê. */
function decisionSettings(
  config: ConfigService,
): Pick<
  RunMeta['pipeline'],
  | 'decisionPrompt'
  | 'knowledgeSource'
  | 'whyLine'
  | 'decisionModel'
  | 'decisionCriticalModel'
  | 'research'
> {
  const { pipeline } = readDecisionPipeline(config);
  const decisionModels = readDecisionModels(config);
  return {
    decisionPrompt: pipeline.decisionPrompt,
    knowledgeSource: pipeline.knowledgeSource,
    whyLine: pipeline.whyLine,
    decisionModel: decisionModels.standard ?? null,
    decisionCriticalModel: decisionModels.critical ?? null,
    // A verificação depois da decisão usa a mesma pesquisa (modelo, buscas, domínios).
    research:
      pipeline.knowledgeSource === 'web' || pipeline.knowledgeSource === 'verify'
        ? {
            model: readResearchModel(config),
            effort: readResearchEffort(config),
            maxSearches: readWebResearchMaxSearches(config),
            allowedDomains: readWebResearchAllowedDomains(config).domains,
          }
        : null,
  };
}

async function executeVariant(context: VariantRunContext): Promise<string> {
  const { variant, env, cases, options } = context;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${variant.name}`;
  const runDir = resolve(options.out, runId);
  mkdirSync(runDir, { recursive: true });

  const recorder = new CompletionRecorder();
  const app = await NestFactory.createApplicationContext(EvalModule.forVariant(env, recorder), {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    // CC-412: com cartão e caso do gabarito da mesma origem, a nota mediria
    // o Copiloto contra ele mesmo — não mede.
    await assertNoCircularGoldCases(prisma);
    const config = app.get(ConfigService);
    const gateway = app.get(AiGatewayService);
    const requestedModel = config.getOrThrow<string>('AI_MODEL');
    // Sem o prefixo do perfil (`groq:...`): o fallback de recusa olha o id do modelo.
    const refusalFallback = isRefusalFallbackActive(
      gateway.getProviderName(),
      gateway.route().model,
      config,
    );
    const funnel = options.mode === 'funnel';
    const services = {
      orchestrator: app.get(OrchestratorService),
      encounters: app.get(EncountersService),
      prisma,
      recorder,
      physicianId: await ensureEvalPhysician(prisma),
      refusalFallback,
      simulator: funnel ? createPhysicianSimulator() : undefined,
      guided: funnel
        ? { intake: app.get(IntakeService), conversation: app.get(ConversationService) }
        : undefined,
    };

    const meta: RunMeta = {
      runId,
      variant: {
        name: variant.name,
        description: variant.description,
        env: redactVariantEnv(variant),
      },
      startedAt: new Date().toISOString(),
      finishedAt: null,
      git: gitInfo(),
      caseSet: {
        set: options.set,
        version: context.caseSetVersion,
        selector: options.cases ?? null,
        caseIds: cases.map((clinicalCase) => clinicalCase.id),
      },
      reps: options.reps,
      mode: options.mode,
      concurrency: options.concurrency,
      caseTimeoutMs: options.caseTimeoutMs,
      database: context.database,
      pipeline: {
        completionProvider: gateway.getProviderName(),
        embeddingProvider: gateway.getEmbeddingProviderName(),
        requestedModel,
        embeddingModel: gateway.getEmbeddingModel(),
        maxOutputTokens: readMaxOutputTokens(config),
        effort: readChoice(config, 'AI_EFFORT', AI_EFFORTS, 'high'),
        ...stagesSettings(config, requestedModel),
        ...decisionSettings(config),
        structuredOutput: readFlag(config, 'AI_STRUCTURED_OUTPUT', true),
        refusalFallback,
        intake: funnel
          ? {
              mode: readIntakeMode(config),
              readingModel: readIntakeReadingModel(config) ?? requestedModel,
            }
          : null,
      },
      knowledgeBase: await knowledgeBaseSnapshot(prisma),
      judge: null,
    };
    writeRunMeta(runDir, meta);

    console.log(
      `\n▶ ${variant.name}: ${meta.pipeline.completionProvider} · ${meta.pipeline.requestedModel} — ${runDir}`,
    );
    console.log(
      `  Modo ${funnel ? `afunilamento (médico simulado ${services.simulator?.model}, leitura do caso ${meta.pipeline.intake?.mode})` : 'caso completo'} · raciocínio ${meta.pipeline.reasoning} · decisão ${meta.pipeline.decisionPrompt}${meta.pipeline.whyLine ? ' com a linha de por quê' : ''} · fonte ${meta.pipeline.knowledgeSource}${meta.pipeline.research ? ` · pesquisa ${meta.pipeline.research.model}` : ''}`,
    );
    console.log(
      `  Base: ${meta.knowledgeBase.approvedChunks} trechos aprovados (${meta.knowledgeBase.approvedChunksWithEmbedding} com embedding), ${meta.knowledgeBase.officialChunks} oficiais`,
    );

    const tasks = cases.flatMap((clinicalCase) =>
      Array.from({ length: options.reps }, (_unused, rep) => ({ clinicalCase, rep })),
    );
    let finished = 0;
    await mapWithConcurrency(tasks, options.concurrency, async ({ clinicalCase, rep }) => {
      const outcome = await runCase(
        services,
        clinicalCase,
        { runId, variant: variant.name, rep },
        { caseTimeoutMs: options.caseTimeoutMs, mode: options.mode },
      );
      const file = outcome.kind === 'result' ? RUN_FILES.results : RUN_FILES.errors;
      appendJsonLine(join(runDir, file), outcome.row);
      finished++;
      console.log(
        `  [${finished}/${tasks.length}] ${clinicalCase.id}#${rep} ${describeOutcome(outcome)}`,
      );
    });

    writeRunMeta(runDir, { ...meta, finishedAt: new Date().toISOString() });
  } finally {
    await app.close();
  }
  return runDir;
}

async function gradeRun(
  runDir: string,
  casesById: Map<string, ClinicalCase>,
  judgeClient: JudgeClient | null,
  concurrency: number,
  caseSetVersion: string,
  reuseJudge = false,
): Promise<RunSummary> {
  const meta = readRunMeta(runDir);
  if (meta.caseSet.version !== caseSetVersion) {
    console.warn(
      `  ⚠️ O gabarito mudou desde esta execução (${meta.caseSet.version} → ${caseSetVersion}); as notas usam o gabarito ATUAL.`,
    );
  }

  const results = readJsonLines(join(runDir, RUN_FILES.results), ResultRowSchema);
  const gradable = results.flatMap((row) => {
    const clinicalCase = casesById.get(row.caseId);
    if (!clinicalCase)
      console.warn(`  ⚠️ Caso ${row.caseId} não existe mais no gabarito — linha ignorada.`);
    return clinicalCase ? [{ row, clinicalCase }] : [];
  });

  const previous = reuseJudge
    ? new Map(
        readJsonLines(join(runDir, RUN_FILES.grades), GradeRowSchema).map((grade) => [
          `${grade.caseId}#${grade.rep}`,
          grade.judge,
        ]),
      )
    : null;
  console.log(
    `  Avaliando ${gradable.length} execução(ões)${previous ? ' reaproveitando o veredito gravado do juiz' : judgeClient ? ` com o juiz ${judgeClient.provider} · ${judgeClient.model}` : ' sem juiz'}...`,
  );
  const grades = await mapWithConcurrency(gradable, concurrency, ({ row, clinicalCase }) =>
    gradeResult(
      row,
      clinicalCase,
      judgeClient,
      undefined,
      previous ? (previous.get(`${row.caseId}#${row.rep}`) ?? null) : undefined,
    ),
  );
  grades.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.rep - right.rep);
  writeJsonLines(join(runDir, RUN_FILES.grades), grades);

  writeRunMeta(runDir, {
    ...meta,
    judge: previous
      ? meta.judge
      : judgeClient
        ? {
            provider: judgeClient.provider,
            model: judgeClient.model,
            gradedAt: new Date().toISOString(),
          }
        : null,
  });

  const run = loadRun(runDir);
  const summary = summarizeRun(run, casesById);
  writeFileSync(join(runDir, RUN_FILES.summary), renderSummaryMarkdown(run, summary));
  console.log(
    `  Portão: ${summary.gate.toUpperCase()} · erros críticos no subconjunto crítico: ${summary.criticalErrors.criticalSubsetCaseIds.length} · ${join(runDir, RUN_FILES.summary)}`,
  );
  return summary;
}

async function main(): Promise<number> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const loadedEnvFiles = loadDotEnvFiles();
  // A regravação usa o conjunto em que a execução rodou, não o da linha de comando.
  const setName = options.regrade ? readRunMeta(resolve(options.regrade)).caseSet.set : options.set;
  const caseSet = loadCaseSet(CASE_SETS[setName]);
  const casesById = new Map(caseSet.cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));
  const judgeClient = options.judge === 'none' ? null : createJudgeClient(options.judge);

  if (options.regrade) {
    const summary = await gradeRun(
      resolve(options.regrade),
      casesById,
      judgeClient,
      options.concurrency,
      caseSet.version,
      options.reuseJudge,
    );
    return summary.gate === 'reprovado' ? 2 : 0;
  }

  const selected = selectCases(caseSet.cases, options.cases);
  // Afunilamento só faz sentido com roteiro: os casos sem `input.funnel` ficam fora.
  const cases =
    options.mode === 'funnel'
      ? selected.filter((clinicalCase) => clinicalCase.input.funnel)
      : selected;
  if (cases.length === 0) {
    console.error('Nenhum caso selecionado tem input.funnel para o modo afunilamento.');
    return 1;
  }
  if (cases.length < selected.length) {
    console.log(
      `Modo afunilamento: ${selected.length - cases.length} caso(s) sem input.funnel ficaram fora.`,
    );
  }
  const variants = pickVariants(loadVariants(options.variantsFile), options.variants).map(
    (variant) => {
      const env = resolveVariantEnv(variant);
      return { variant, env: options.mode === 'funnel' ? withGuidedIntake(env) : env };
    },
  );
  const database = formatDatabaseTarget(
    assertSafeDatabase(process.env.DATABASE_URL, { allowRemote: options.allowRemoteDb }),
  );

  console.log(
    `Banco: ${database}${loadedEnvFiles.length > 0 ? ` (ambiente de ${loadedEnvFiles.join(', ')})` : ''}`,
  );
  console.log(
    `Gabarito ${caseSet.version}: ${cases.length} caso(s) × ${options.reps} repetição(ões) · variantes: ${variants.map(({ variant }) => variant.name).join(', ')} · juiz: ${judgeClient ? `${judgeClient.provider} · ${judgeClient.model}` : 'nenhum'}`,
  );

  if (options.dryRun) {
    for (const clinicalCase of cases) {
      console.log(
        `  ${clinicalCase.critical ? '!' : ' '} ${clinicalCase.id} — ${clinicalCase.title}`,
      );
    }
    return 0;
  }

  let gateFailed = false;
  for (const { variant, env } of variants) {
    const runDir = await executeVariant({
      variant,
      env,
      cases,
      caseSetVersion: caseSet.version,
      options,
      database,
    });
    const summary = await gradeRun(
      runDir,
      casesById,
      judgeClient,
      options.concurrency,
      caseSet.version,
    );
    gateFailed ||= summary.gate === 'reprovado';
  }
  return gateFailed ? 2 : 0;
}

// Saída explícita: uma chamada abandonada pelo teto de tempo pode manter o
// processo vivo depois de tudo gravado.
main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
