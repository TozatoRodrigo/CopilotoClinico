import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ClinicalCase } from './case.schema';
import { CASE_SETS, loadCaseSet } from './cases';
import {
  formatMs,
  formatRate,
  formatUsd,
  loadRun,
  summarizeRun,
  type CaseSummary,
  type LoadedRun,
  type RunSummary,
} from './report';
import type { Rate } from './stats';

/**
 * F0-A — Compara execuções lado a lado (ex.: baseline × Sonnet 5.5 × Opus
 * 5.5, ou a versão atual × a anterior para o portão de release) e lista os
 * casos que viraram. A primeira execução é a referência.
 */

const USAGE = `Uso: pnpm eval:clinical:compare <runDir> <runDir> [...] [--out comparacao.md]`;

type Flag = boolean | null;

/** Caso "passa" num critério só se passou em TODAS as repetições avaliadas. */
function allPassed(rate: Rate): Flag {
  return rate.total === 0 ? null : rate.passed === rate.total;
}

const CASE_FLAGS: Array<[string, (summary: CaseSummary) => Flag]> = [
  ['sem erro crítico', (summary) => (summary.reps === 0 ? null : summary.criticalErrorReps === 0)],
  ['análise entregue', (summary) => (summary.reps === 0 ? null : summary.okReps === summary.reps)],
  ['síndrome', (summary) => allPassed(summary.syndrome)],
  ['diagnósticos', (summary) => allPassed(summary.diagnoses)],
  ['condutas', (summary) => allPassed(summary.actions)],
  ['dados pedidos', (summary) => allPassed(summary.questions)],
  ['sem conduta proibida', (summary) => allPassed(summary.noForbiddenAction)],
  ['próximo passo seguro', (summary) => allPassed(summary.safeNextStep)],
];

interface Flip {
  caseId: string;
  critical: boolean;
  criterion: string;
  before: boolean;
  after: boolean;
}

export function findFlips(reference: RunSummary, candidate: RunSummary): Flip[] {
  const candidateCases = new Map(candidate.perCase.map((summary) => [summary.caseId, summary]));
  const flips: Flip[] = [];
  for (const before of reference.perCase) {
    const after = candidateCases.get(before.caseId);
    if (!after) continue;
    for (const [criterion, flag] of CASE_FLAGS) {
      const beforeFlag = flag(before);
      const afterFlag = flag(after);
      if (beforeFlag === null || afterFlag === null || beforeFlag === afterFlag) continue;
      flips.push({
        caseId: before.caseId,
        critical: before.critical,
        criterion,
        before: beforeFlag,
        after: afterFlag,
      });
    }
  }
  return flips;
}

function firstRepChunkIds(run: LoadedRun): Map<string, string> {
  const byCase = new Map<string, string>();
  for (const row of [...run.results].sort((left, right) => left.rep - right.rep)) {
    if (!byCase.has(row.caseId))
      byCase.set(row.caseId, [...row.retrievedChunkIds].sort().join(','));
  }
  return byCase;
}

/** O bake-off só isola o modelo se o retrieval entregou os mesmos trechos. */
function casesWithDifferentRetrieval(reference: LoadedRun, candidate: LoadedRun): string[] {
  const referenceChunks = firstRepChunkIds(reference);
  const candidateChunks = firstRepChunkIds(candidate);
  return [...referenceChunks.entries()]
    .filter(
      ([caseId, chunks]) => candidateChunks.has(caseId) && candidateChunks.get(caseId) !== chunks,
    )
    .map(([caseId]) => caseId);
}

function cells(summaries: RunSummary[], render: (summary: RunSummary) => string): string {
  return summaries.map(render).join(' | ');
}

const CRITERIA: Array<[keyof RunSummary['criteria'], string]> = [
  ['syndrome', 'Síndrome correta'],
  ['criticalDiagnoses', 'Diagnósticos críticos (itens)'],
  ['importantDiagnoses', 'Diagnósticos importantes (itens)'],
  ['criticalActions', 'Condutas críticas na camada exigida (itens)'],
  ['criticalActionsStrict', 'Condutas críticas agora, estrito (itens)'],
  ['importantActions', 'Condutas importantes na camada exigida (itens)'],
  ['actionsAnyLayer', 'Condutas em qualquer camada (itens)'],
  ['questions', 'Dados ausentes pedidos (itens)'],
  ['noForbiddenAction', 'Sem conduta proibida'],
  ['safeNextStep', 'Próximo passo seguro'],
  ['destination', 'Destino com prioridade e conduta até a transferência'],
];

export function renderComparison(runs: LoadedRun[], casesById: Map<string, ClinicalCase>): string {
  const summaries = runs.map((run) => summarizeRun(run, casesById));
  const [reference] = summaries;
  const [referenceRun] = runs;
  if (!reference || !referenceRun) throw new Error('Nenhuma execução para comparar.');

  const lines: string[] = ['# Gabarito clínico — comparação', ''];
  const header = `| Métrica | ${summaries.map((summary, index) => `${String.fromCharCode(65 + index)}: ${summary.variant}`).join(' | ')} |`;

  const warnings: string[] = [];
  const versions = new Set(runs.map((run) => run.meta.caseSet.version));
  if (versions.size > 1)
    warnings.push(
      `gabaritos diferentes entre as execuções (${[...versions].join(', ')}) — notas não são diretamente comparáveis`,
    );
  const judges = new Set(
    runs.map((run) =>
      run.meta.judge ? `${run.meta.judge.provider}/${run.meta.judge.model}` : 'nenhum',
    ),
  );
  if (judges.size > 1)
    warnings.push(
      `juízes diferentes (${[...judges].join(', ')}) — diferença de nota pode ser do juiz`,
    );
  runs.slice(1).forEach((run, index) => {
    const differing = casesWithDifferentRetrieval(referenceRun, run);
    if (differing.length > 0) {
      warnings.push(
        `${String.fromCharCode(66 + index)} recuperou trechos diferentes de A em ${differing.length} caso(s): ${differing.slice(0, 10).join(', ')}${differing.length > 10 ? '…' : ''}`,
      );
    }
  });
  if (warnings.length > 0)
    lines.push('## Atenção', '', ...warnings.map((warning) => `- ${warning}`), '');

  lines.push('## Lado a lado', '', header, `| --- | ${summaries.map(() => '---').join(' | ')} |`);
  const row = (label: string, render: (summary: RunSummary) => string) =>
    lines.push(`| ${label} | ${cells(summaries, render)} |`);
  row('Execução', (summary) => summary.runId);
  row('Portão', (summary) => summary.gate);
  row('Modelo servido', (summary) => summary.servedModels.join(', ') || '—');
  row('Juiz', (summary) => summary.judge.models.join(', ') || 'nenhum');
  row('Casos × repetições', (summary) => `${summary.caseCount} × ${summary.reps}`);
  row('Casos críticos com erro crítico', (summary) =>
    String(summary.criticalErrors.criticalSubsetCaseIds.length),
  );
  row('Casos com erro crítico (todos)', (summary) => String(summary.criticalErrors.caseIds.length));
  row('Sem resposta', (summary) => formatRate(summary.noAnswer));
  row('Erros de infraestrutura', (summary) => String(summary.outcomes.infraErrors));
  row('Servidas pelo fallback de recusa', (summary) => String(summary.outcomes.servedByFallback));
  for (const [key, label] of CRITERIA) row(label, (summary) => formatRate(summary.criteria[key]));
  row(
    'Perguntas / condutas / para agora (médias)',
    (summary) =>
      `${summary.shape.questionsMean?.toFixed(2) ?? '—'} / ${summary.shape.recommendationsMean?.toFixed(1) ?? '—'} / ${summary.shape.nowMean?.toFixed(1) ?? '—'}`,
  );
  if (summaries.some((summary) => summary.funnel)) {
    row('Afunilamento: fatos decisivos revelados', (summary) =>
      summary.funnel ? formatRate(summary.funnel.allKeyFactsRevealed) : '—',
    );
  }
  row(
    'Latência p50 / p90',
    (summary) => `${formatMs(summary.latency.p50)} / ${formatMs(summary.latency.p90)}`,
  );
  row(
    'Relógio por caso p50 / p90',
    (summary) =>
      `${formatMs(summary.latency.wallClockP50)} / ${formatMs(summary.latency.wallClockP90)}`,
  );
  row(
    'Custo do pipeline (total / por execução)',
    (summary) =>
      `${formatUsd(summary.cost.pipelineComputedUsd)} / ${formatUsd(summary.cost.perExecutionUsd)}${summary.cost.pipelineRowsWithoutPrice > 0 ? ' (incompleto)' : ''}`,
  );
  row('Custo do juiz', (summary) => formatUsd(summary.cost.judgeUsd));
  lines.push('');

  summaries.slice(1).forEach((summary, index) => {
    const letter = String.fromCharCode(66 + index);
    const flips = findFlips(reference, summary);
    const worse = flips.filter((flip) => flip.before && !flip.after);
    lines.push(`## Casos que viraram: A → ${letter} (${summary.variant})`, '');
    if (flips.length === 0) {
      lines.push('Nenhum caso mudou de resultado.', '');
      return;
    }
    lines.push(
      `${worse.length} piora(s), ${flips.length - worse.length} melhora(s). Um caso passa num critério só se passou em todas as repetições.`,
      '',
    );
    lines.push(
      '| Caso | Crítico | Critério | A | ' + letter + ' | |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const flip of [...flips].sort(
      (left, right) =>
        Number(left.after) - Number(right.after) || left.caseId.localeCompare(right.caseId),
    )) {
      lines.push(
        `| ${flip.caseId} | ${flip.critical ? 'sim' : ''} | ${flip.criterion} | ${flip.before ? '✓' : '✗'} | ${flip.after ? '✓' : '✗'} | ${flip.after ? 'melhorou' : '**piorou**'} |`,
      );
    }
    lines.push('');
  });

  return lines.join('\n');
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false } },
  });
  if (values.help || positionals.length < 2) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  const runs = positionals.map((dir) => loadRun(resolve(dir)));
  const sets = new Set(runs.map((run) => run.meta.caseSet.set));
  if (sets.size > 1) {
    console.error('Não compare execuções da prova cega com execuções do conjunto principal.');
    process.exitCode = 1;
    return;
  }
  const { cases } = loadCaseSet(CASE_SETS[runs[0]?.meta.caseSet.set ?? 'main']);
  const casesById = new Map(cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));
  const markdown = renderComparison(runs, casesById);
  if (values.out) {
    writeFileSync(values.out, markdown);
    console.log(`Comparação gravada em ${values.out}`);
    return;
  }
  console.log(markdown);
}

if (require.main === module) main();
