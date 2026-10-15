import { describe, expect, it } from 'vitest';
import type { IntakeCase } from './case.schema';
import type { ExtractedFields } from './grading';
import type { CallRecord, ReadingRow, RunMeta } from './records';
import { renderReport, summarizeModel, summarizeRun } from './report';

const NO_VITALS = {
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

const intakeCase: IntakeCase = {
  id: 'caso-1',
  source: { kind: 'real_anonymized' },
  review: { status: 'draft' },
  input: { caseText: 'Fem, 34a, dispneia súbita. FC 118, SpO2 89%.' },
  expected: {
    sex: 'F',
    age: 34,
    vitals: { ...NO_VITALS, heartRate: 118, spo2: 89 },
    timeCritical: true,
  },
};
const casesById = new Map([[intakeCase.id, intakeCase]]);

const goodFields: ExtractedFields = {
  sex: 'F',
  age: 34,
  vitals: { ...NO_VITALS, heartRate: 118, spo2: 89 },
  syndrome: 'dispneia',
  instability: true,
  timeCritical: true,
};

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    requestedModel: 'm',
    servedModel: 'm',
    latencyMs: 1,
    usage: null,
    costUsd: 0.01,
    failure: null,
    errorType: null,
    ...overrides,
  };
}

function row(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    model: 'm',
    caseId: 'caso-1',
    rep: 0,
    attempts: 1,
    outcome: 'ask',
    failure: null,
    servedModel: 'm',
    readingMs: 5_000,
    firstQuestionMs: 5_010,
    questions: ['Tem dor torácica?'],
    fields: goodFields,
    piiDetected: false,
    calls: [call()],
    ...overrides,
  };
}

const meta: RunMeta = {
  runId: 'r1',
  startedAt: '2026-10-15T00:00:00.000Z',
  finishedAt: '2026-10-15T00:05:00.000Z',
  git: { commit: 'abcdef1234', dirty: false },
  caseSet: { set: 'local', version: 'v1', selector: null, caseIds: ['caso-1'] },
  models: [
    { ref: 'm', profile: 'default', provider: 'anthropic', model: 'm' },
    { ref: 'n', profile: 'default', provider: 'anthropic', model: 'n' },
  ],
  reps: 3,
  concurrency: 1,
  caseTimeoutMs: 90_000,
  maxUsd: 1,
  settings: { effort: 'low', structuredOutput: true, productionTimeoutMs: 20_000 },
  plannedTasks: 6,
  spentUsd: 0.5,
  stop: null,
};

describe('summarizeModel', () => {
  it('keeps failed and stopped readings out of latency and data errors', () => {
    const summary = summarizeModel(
      'm',
      [
        row({ rep: 0, readingMs: 4_000, firstQuestionMs: 4_000 }),
        row({
          rep: 1,
          outcome: 'complete',
          readingMs: 22_000,
          firstQuestionMs: null,
          questions: [],
        }),
        row({
          rep: 2,
          outcome: 'invalid_output',
          fields: null,
          readingMs: 30_000,
          firstQuestionMs: null,
        }),
        row({
          rep: 3,
          outcome: 'stopped',
          fields: null,
          readingMs: 1,
          firstQuestionMs: null,
          calls: [],
        }),
      ],
      casesById,
      20_000,
    );

    expect(summary).toMatchObject({ executed: 3, valid: 2, overProductionTimeout: 1 });
    expect(summary.outcomes).toMatchObject({ ask: 1, complete: 1, invalid_output: 1, stopped: 1 });
    expect(summary.reading).toEqual({ p50: 13_000, p90: 20_200, n: 2 });
    expect(summary.firstQuestion).toEqual({ p50: 4_000, p90: 4_000, n: 1 });
    // A leitura que falhou também foi paga.
    expect(summary.cost).toEqual({ knownUsd: expect.closeTo(0.03, 9), unknownCalls: 0 });
  });

  it('counts vitals per case and per field, and the judgment only where the gold has it', () => {
    const summary = summarizeModel(
      'm',
      [
        row({ rep: 0 }),
        row({
          rep: 1,
          fields: {
            ...goodFields,
            vitals: { ...NO_VITALS, heartRate: 118, spo2: 0.89, glucose: 90 },
          },
        }),
        row({ rep: 2, fields: { ...goodFields, timeCritical: false, sex: null } }),
      ],
      casesById,
      20_000,
    );

    expect(summary.data).toEqual({
      sex: { errors: 1, total: 3 },
      age: { errors: 0, total: 3 },
      vitalsCases: { errors: 1, total: 3 },
      vitalsFields: { errors: 2, total: 21 },
    });
    expect(summary.judgment).toEqual({
      syndrome: { errors: 0, total: 0 },
      instability: { errors: 0, total: 0 },
      timeCritical: { errors: 1, total: 3 },
    });
    expect(summary.findings.map((finding) => finding.checks.map((check) => check.kind))).toEqual([
      ['wrong', 'invented'],
      ['missing', 'disagree'],
    ]);
  });

  it('says the cost is unknown instead of adding a model without price as zero', () => {
    const summary = summarizeModel(
      'm',
      [row({ calls: [call(), call({ costUsd: null })] })],
      casesById,
      20_000,
    );
    expect(summary.cost).toEqual({ knownUsd: 0.01, unknownCalls: 1 });
  });
});

describe('renderReport', () => {
  it('renders the CC-104 table, the candidates and the failures', () => {
    const rows = [
      row({ model: 'm', rep: 0 }),
      row({ model: 'n', rep: 0, readingMs: 12_000, firstQuestionMs: 12_000 }),
      row({
        model: 'n',
        rep: 1,
        outcome: 'provider_error',
        failure: 'server_error',
        fields: null,
        firstQuestionMs: null,
        questions: [],
        attempts: 4,
        calls: [call({ failure: 'server_error', errorType: 'Error:503', costUsd: 0 })],
      }),
    ];
    const report = renderReport(meta, rows, summarizeRun(meta, rows, casesById));

    expect(report).toContain(
      '| `m` | 1/1 | 5.0 s · 5.0 s | 5.0 s · 5.0 s (1) | 0/1 | 0/1 | 0/1 · 0/7 | US$ 0.01 | ✓ |',
    );
    expect(report).toContain('| `n` | 1/2 | 12.0 s · 12.0 s |');
    expect(report).toContain(
      'Atendem à meta (p50 da 1ª pergunta ≤ 8.0 s e nenhum erro de sexo ou idade): `m`.',
    );
    expect(report).toContain(
      '- `n` · `caso-1` #1: erro do provedor (server_error, Error:503) · 4 tentativa(s)',
    );
    expect(report).toContain('- `m` #0: Tem dor torácica?');
    expect(report).not.toContain('Rodada interrompida');
  });

  it('opens with the reason when the run was stopped', () => {
    const stopped: RunMeta = {
      ...meta,
      stop: {
        kind: 'usage_limit',
        model: 'm',
        detail: 'You have reached your specified API usage limits',
      },
    };
    const report = renderReport(stopped, [], summarizeRun(stopped, [], casesById));
    expect(report).toContain(
      '> ⚠️ **Rodada interrompida:** limite de uso do provedor na chamada a `m`: "You have reached your specified API usage limits".',
    );
    expect(report).toContain('Nenhum modelo atende à meta');
  });
});
