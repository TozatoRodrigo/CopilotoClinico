import type { WhisperModel } from '../../src/modules/audio/whisper.settings';
import { percentile } from '../clinical/stats';
import {
  compareQuantities,
  compareTerms,
  extractQuantities,
  formatQuantity,
  QUANTITY_KIND_LABELS,
  QUANTITY_KINDS,
  type Quantity,
  type QuantityComparison,
  type QuantityKind,
  type TermCount,
} from './clinical';
import type { AudioSample } from './dataset';
import type { CallOutcome, RunResult, StopReason } from './runner';
import { charErrors, errorRate, sumErrors, wordErrors, type ErrorCount } from './text';
import {
  VOCABULARY_KIND_LABELS,
  VOCABULARY_KINDS,
  type VocabularyEntry,
  type VocabularyKind,
} from './vocabulary';

/**
 * CC-205 — notas por arquivo e por modelo, e o relatório markdown. O
 * relatório traz métricas, ids e os números e termos clínicos que divergiram;
 * nunca frases transcritas.
 */

type OkOutcome = Extract<CallOutcome, { kind: 'ok' }>;
type ErrorOutcome = Extract<CallOutcome, { kind: 'error' }>;

export interface SampleScore {
  id: string;
  model: WhisperModel;
  durationSec: number;
  latencyMs: number;
  costUsd: number;
  /** Sem acento, que é o WER principal: acento trocado não muda conduta. */
  wer: ErrorCount;
  werWithAccents: ErrorCount;
  cer: ErrorCount;
  quantities: QuantityComparison;
  terms: TermCount[];
}

export function scoreSample(
  sample: AudioSample,
  outcome: OkOutcome,
  vocabulary: readonly VocabularyEntry[],
  referenceQuantities: readonly Quantity[] = extractQuantities(sample.reference),
): SampleScore {
  const { reference } = sample;
  const hypothesis = outcome.transcript;
  return {
    id: sample.id,
    model: outcome.model,
    durationSec: sample.durationSec,
    latencyMs: outcome.latencyMs,
    costUsd: outcome.costUsd,
    wer: wordErrors(reference, hypothesis, { ignoreAccents: true }),
    werWithAccents: wordErrors(reference, hypothesis, { ignoreAccents: false }),
    cer: charErrors(reference, hypothesis, { ignoreAccents: true }),
    quantities: compareQuantities(referenceQuantities, extractQuantities(hypothesis)),
    terms: compareTerms(reference, hypothesis, vocabulary),
  };
}

interface Tally {
  reference: number;
  matched: number;
}

export interface ModelSummary {
  model: WhisperModel;
  files: number;
  audioSec: number;
  wer: ErrorCount;
  werWithAccents: ErrorCount;
  cer: ErrorCount;
  quantities: Record<QuantityKind, Tally>;
  extraQuantities: number;
  terms: Record<VocabularyKind, Tally>;
  extraTerms: number;
  latencyP50Ms: number | null;
  latencyP90Ms: number | null;
  costUsd: number;
  /** Custo cobrado (com o mínimo por chamada) dividido pelos minutos de áudio. */
  usdPerAudioMinute: number | null;
  /** Chamadas com erro em toda a execução, não só nos arquivos comparados. */
  errors: number;
}

export interface TranscriptionReport {
  generatedAt: string;
  models: WhisperModel[];
  totalFiles: number;
  totalAudioSec: number;
  /** Arquivos que todos os modelos transcreveram: a comparação usa só estes. */
  comparedIds: string[];
  summaries: ModelSummary[];
  scores: SampleScore[];
  failures: ErrorOutcome[];
  skipped: number;
  stop: RunResult['stop'];
  spentUsd: number;
  maxUsd: number;
}

function tallies<K extends string>(keys: readonly K[]): Record<K, Tally> {
  return Object.fromEntries(keys.map((key) => [key, { reference: 0, matched: 0 }])) as Record<
    K,
    Tally
  >;
}

function summarizeModel(
  model: WhisperModel,
  scores: readonly SampleScore[],
  errors: number,
): ModelSummary {
  const quantities = tallies(QUANTITY_KINDS);
  const terms = tallies(VOCABULARY_KINDS);
  let extraQuantities = 0;
  let extraTerms = 0;
  for (const score of scores) {
    for (const kind of QUANTITY_KINDS) {
      quantities[kind].reference += score.quantities.byKind[kind].reference;
      quantities[kind].matched += score.quantities.byKind[kind].matched;
    }
    extraQuantities += score.quantities.extra.length;
    for (const term of score.terms) {
      terms[term.kind].reference += term.reference;
      terms[term.kind].matched += term.matched;
      extraTerms += term.extra;
    }
  }
  const audioSec = scores.reduce((sum, score) => sum + score.durationSec, 0);
  const costUsd = scores.reduce((sum, score) => sum + score.costUsd, 0);
  const latencies = scores.map((score) => score.latencyMs);
  return {
    model,
    files: scores.length,
    audioSec,
    wer: sumErrors(scores.map((score) => score.wer)),
    werWithAccents: sumErrors(scores.map((score) => score.werWithAccents)),
    cer: sumErrors(scores.map((score) => score.cer)),
    quantities,
    extraQuantities,
    terms,
    extraTerms,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP90Ms: percentile(latencies, 0.9),
    costUsd,
    usdPerAudioMinute: audioSec === 0 ? null : costUsd / (audioSec / 60),
    errors,
  };
}

export function buildReport(input: {
  samples: readonly AudioSample[];
  models: readonly WhisperModel[];
  result: RunResult;
  vocabulary: readonly VocabularyEntry[];
  maxUsd: number;
  generatedAt: Date;
}): TranscriptionReport {
  const { samples, models, result, vocabulary } = input;
  // O id não tem espaço (dataset.ts), então "id modelo" não colide.
  const key = (id: string, model: WhisperModel) => `${id} ${model}`;
  const okByKey = new Map<string, OkOutcome>();
  for (const outcome of result.outcomes) {
    if (outcome.kind === 'ok') okByKey.set(key(outcome.id, outcome.model), outcome);
  }
  const compared = samples.filter((sample) =>
    models.every((model) => okByKey.has(key(sample.id, model))),
  );

  const scores = compared.flatMap((sample) => {
    const referenceQuantities = extractQuantities(sample.reference);
    return models.map((model) =>
      scoreSample(
        sample,
        okByKey.get(key(sample.id, model)) as OkOutcome,
        vocabulary,
        referenceQuantities,
      ),
    );
  });
  const failures = result.outcomes.filter(
    (outcome): outcome is ErrorOutcome => outcome.kind === 'error',
  );

  return {
    generatedAt: input.generatedAt.toISOString(),
    models: [...models],
    totalFiles: samples.length,
    totalAudioSec: samples.reduce((sum, sample) => sum + sample.durationSec, 0),
    comparedIds: compared.map((sample) => sample.id),
    summaries: models.map((model) =>
      summarizeModel(
        model,
        scores.filter((score) => score.model === model),
        failures.filter((failure) => failure.model === model).length,
      ),
    ),
    scores,
    failures,
    skipped: result.outcomes.filter((outcome) => outcome.kind === 'skipped').length,
    stop: result.stop,
    spentUsd: result.spentUsd,
    maxUsd: input.maxUsd,
  };
}

// ── Markdown ────────────────────────────────────────────────────────────────

function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${decimal(rate * 100, 1)}%`;
}

function tallyCell({ reference, matched }: Tally): string {
  return reference === 0 ? '—' : `${percent(matched / reference)} (${matched}/${reference})`;
}

function seconds(ms: number | null): string {
  return ms === null ? '—' : `${decimal(ms / 1000, 2)} s`;
}

function usd(value: number | null, digits = 4): string {
  return value === null ? '—' : `US$ ${decimal(value, digits)}`;
}

function minutes(sec: number): string {
  return `${decimal(sec / 60, 1)} min`;
}

function table(header: string[], rows: string[][]): string {
  return [header, header.map(() => '---'), ...rows]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n');
}

const STOP_LABELS: Record<StopReason, string> = {
  limit: 'limite de uso da API',
  auth: 'chave recusada pela API',
  budget: 'teto de gasto (--max-usd)',
};

function summaryRows(summaries: readonly ModelSummary[]): string[][] {
  const row = (label: string, cell: (summary: ModelSummary) => string) => [
    label,
    ...summaries.map(cell),
  ];
  const sumTallies = (record: Record<string, Tally>): Tally =>
    Object.values(record).reduce(
      (total, tally) => ({
        reference: total.reference + tally.reference,
        matched: total.matched + tally.matched,
      }),
      { reference: 0, matched: 0 },
    );
  return [
    row('WER (sem acento)', (s) => percent(errorRate(s.wer))),
    row('WER (com acento)', (s) => percent(errorRate(s.werWithAccents))),
    row('CER', (s) => percent(errorRate(s.cer))),
    row('Números certos', (s) => tallyCell(sumTallies(s.quantities))),
    ...QUANTITY_KINDS.map((kind) =>
      row(`· ${QUANTITY_KIND_LABELS[kind]}`, (s) => tallyCell(s.quantities[kind])),
    ),
    row('Números a mais', (s) => String(s.extraQuantities)),
    row('Termos clínicos certos', (s) => tallyCell(sumTallies(s.terms))),
    ...VOCABULARY_KINDS.map((kind) =>
      row(`· ${VOCABULARY_KIND_LABELS[kind]}`, (s) => tallyCell(s.terms[kind])),
    ),
    row('Termos a mais', (s) => String(s.extraTerms)),
    row('Latência p50 / p90', (s) => `${seconds(s.latencyP50Ms)} / ${seconds(s.latencyP90Ms)}`),
    row('Custo por minuto de áudio', (s) => usd(s.usdPerAudioMinute, 5)),
    row('Custo dos arquivos comparados', (s) => usd(s.costUsd)),
    row('Chamadas com erro', (s) => String(s.errors)),
  ];
}

/** A tabela de métricas por modelo, sem nada do conteúdo: é o que vai para o console. */
export function renderSummaryTable(report: TranscriptionReport): string {
  return table(['', ...report.models], summaryRows(report.summaries));
}

function listQuantities(quantities: readonly Quantity[]): string {
  if (quantities.length === 0) return '—';
  // Dose em negrito: é o erro que mais pesa.
  return quantities
    .map((q) => (q.kind === 'dose' ? `**${formatQuantity(q)}**` : formatQuantity(q)))
    .join(', ');
}

function listTerms(terms: readonly TermCount[], pick: (term: TermCount) => number): string {
  const listed = terms
    .filter((term) => pick(term) > 0)
    .map((term) => (pick(term) > 1 ? `${term.term} ×${pick(term)}` : term.term));
  return listed.length === 0 ? '—' : listed.join(', ');
}

function perFileTable(scores: readonly SampleScore[]): string {
  return table(
    [
      'Arquivo',
      'Modelo',
      'Duração',
      'WER',
      'CER',
      'Números perdidos',
      'Números a mais',
      'Termos perdidos',
      'Termos a mais',
      'Latência',
      'Custo',
    ],
    scores.map((score) => [
      score.id,
      score.model,
      `${decimal(score.durationSec, 0)} s`,
      percent(errorRate(score.wer)),
      percent(errorRate(score.cer)),
      listQuantities(score.quantities.missed),
      listQuantities(score.quantities.extra),
      listTerms(score.terms, (term) => term.reference - term.matched),
      listTerms(score.terms, (term) => term.extra),
      seconds(score.latencyMs),
      usd(score.costUsd, 5),
    ]),
  );
}

function termTable(report: TranscriptionReport): string | null {
  const totals = new Map<
    string,
    { kind: VocabularyKind; reference: number; byModel: Map<WhisperModel, TermCount[]> }
  >();
  for (const score of report.scores) {
    for (const term of score.terms) {
      const entry = totals.get(term.term) ?? { kind: term.kind, reference: 0, byModel: new Map() };
      // A referência é a mesma para todos os modelos: conta uma vez, pelo primeiro.
      if (score.model === report.models[0]) entry.reference += term.reference;
      entry.byModel.set(score.model, [...(entry.byModel.get(score.model) ?? []), term]);
      totals.set(term.term, entry);
    }
  }
  const rows = [...totals]
    .map(([term, entry]) => {
      const perModel = report.models.map((model) => {
        const counts = entry.byModel.get(model) ?? [];
        const matched = counts.reduce((sum, count) => sum + count.matched, 0);
        const extra = counts.reduce((sum, count) => sum + count.extra, 0);
        return { matched, extra, misses: entry.reference - matched + extra };
      });
      return { term, entry, perModel };
    })
    .filter(({ perModel }) => perModel.some(({ misses }) => misses > 0))
    .sort(
      (left, right) =>
        right.perModel.reduce((sum, m) => sum + m.misses, 0) -
          left.perModel.reduce((sum, m) => sum + m.misses, 0) ||
        left.term.localeCompare(right.term),
    );
  if (rows.length === 0) return null;
  return table(
    ['Termo', 'Tipo', 'Na referência', ...report.models],
    rows.map(({ term, entry, perModel }) => [
      term,
      entry.kind,
      String(entry.reference),
      ...perModel.map(
        ({ matched, extra }) => `${matched}${extra > 0 ? ` (+${extra} a mais)` : ''}`,
      ),
    ]),
  );
}

export function renderReport(report: TranscriptionReport): string {
  const lines: string[] = [];
  lines.push(`# Transcrição: ${report.models.join(' × ')}`, '');
  lines.push(
    `Gerado em ${report.generatedAt}. Áudios: ${report.totalFiles} (${minutes(report.totalAudioSec)}). ` +
      `Comparados: ${report.comparedIds.length}, os que todos os modelos transcreveram. ` +
      `Gasto estimado: ${usd(report.spentUsd)} (teto ${usd(report.maxUsd, 2)}).`,
    '',
  );
  if (report.stop) {
    lines.push(
      `> **Parou antes do fim:** ${STOP_LABELS[report.stop.reason]}, em \`${report.stop.id}\` com ` +
        `${report.stop.model}. ${report.skipped} chamadas não foram feitas. A comparação cobre só ` +
        'os arquivos que todos os modelos transcreveram.',
      '',
    );
  }

  lines.push('## Resumo por modelo', '', renderSummaryTable(report), '');
  lines.push(
    'WER e CER contam palavra a palavra (e letra a letra), sem caixa e sem pontuação. ' +
      'Número certo é o mesmo valor com a mesma unidade da referência: "0,5" sem "mg" conta como ' +
      'erro, "cento e vinte" vale "120". Termo certo é a palavra do vocabulário clínico ' +
      '(evals/transcription/vocabulary.ts) tantas vezes quanto na referência; "a mais" é número ' +
      'ou termo que a transcrição trouxe e a referência não tem (troca ou invenção). O custo ' +
      'inclui o mínimo de 10 s cobrado por chamada.',
    '',
  );

  lines.push('## Diferenças por arquivo', '');
  lines.push(
    report.scores.length === 0 ? 'Nenhum arquivo comparado.' : perFileTable(report.scores),
    '',
  );
  lines.push('Doses em negrito.', '');

  const terms = termTable(report);
  lines.push('## Termos clínicos que algum modelo errou', '');
  lines.push(terms ?? 'Nenhum: todos os modelos acertaram todos os termos do vocabulário.', '');

  if (report.failures.length > 0) {
    lines.push('## Chamadas com erro', '');
    lines.push(
      table(
        ['Arquivo', 'Modelo', 'Tipo', 'HTTP', 'Mensagem'],
        report.failures.map((failure) => [
          failure.id,
          failure.model,
          failure.failure,
          failure.status === null ? '—' : String(failure.status),
          failure.message.replace(/[|\n]/g, ' '),
        ]),
      ),
      '',
    );
  }
  return lines.join('\n');
}
