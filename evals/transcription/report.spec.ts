import { describe, expect, it } from 'vitest';
import type { WhisperModel } from '../../src/modules/audio/whisper.settings';
import type { AudioSample } from './dataset';
import { buildReport, renderReport, renderSummaryTable } from './report';
import type { CallOutcome, RunResult } from './runner';
import { CLINICAL_VOCABULARY } from './vocabulary';

const V3: WhisperModel = 'whisper-large-v3';
const TURBO: WhisperModel = 'whisper-large-v3-turbo';

const SAMPLES: AudioSample[] = [
  {
    id: 'ditado-01',
    audioPath: '/x/ditado-01.webm',
    mimeType: 'audio/webm',
    sizeBytes: 1,
    durationSec: 60,
    reference:
      'Paciente de 54 anos com dispneia. Noradrenalina 0,1 mcg/kg/min e dobutamina 5 mcg/kg/min.',
  },
  {
    id: 'ditado-02',
    audioPath: '/x/ditado-02.webm',
    mimeType: 'audio/webm',
    sizeBytes: 1,
    durationSec: 30,
    reference: 'PA 120 por 80, FC 110.',
  },
];

function ok(id: string, model: WhisperModel, transcript: string, latencyMs: number): CallOutcome {
  return { kind: 'ok', id, model, transcript, latencyMs, costUsd: 0.001 };
}

const RESULT: RunResult = {
  outcomes: [
    ok(
      'ditado-01',
      V3,
      'paciente de 54 anos com dispneia noradrenalina 0,1 mcg/kg/min e dobutamina 5 mcg/kg/min',
      1000,
    ),
    ok(
      'ditado-01',
      TURBO,
      'paciente de 54 anos com dispneia noradrenalina 1 mcg/kg/min e dopamina 5 mcg/kg/min',
      400,
    ),
    ok('ditado-02', V3, 'PA 120 por 80, FC 110.', 2000),
    {
      kind: 'error',
      id: 'ditado-02',
      model: TURBO,
      failure: 'other',
      status: 500,
      message: 'Whisper transcription failed (500)',
      latencyMs: 100,
    },
  ],
  stop: null,
  spentUsd: 0.004,
};

function report(result: RunResult = RESULT) {
  return buildReport({
    samples: SAMPLES,
    models: [V3, TURBO],
    result,
    vocabulary: CLINICAL_VOCABULARY,
    maxUsd: 0.5,
    generatedAt: new Date('2026-10-15T12:00:00Z'),
  });
}

describe('buildReport', () => {
  it('compares only the files every model transcribed, and counts the errors', () => {
    const built = report();

    expect(built.comparedIds).toEqual(['ditado-01']);
    expect(built.scores).toHaveLength(2);
    expect(built.summaries.map((s) => [s.model, s.files, s.errors])).toEqual([
      [V3, 1, 0],
      [TURBO, 1, 1],
    ]);
  });

  it('adds up word errors, numbers and clinical terms per model', () => {
    const [v3, turbo] = report().summaries;

    expect(v3?.wer.errors).toBe(0);
    expect(v3?.quantities.dose).toEqual({ reference: 2, matched: 2 });
    expect(v3?.terms.droga).toEqual({ reference: 2, matched: 2 });

    expect(turbo?.wer).toMatchObject({ substitutions: 2, errors: 2, referenceLength: 17 });
    expect(turbo?.quantities.dose).toEqual({ reference: 2, matched: 1 });
    expect(turbo?.extraQuantities).toBe(1);
    expect(turbo?.terms.droga).toEqual({ reference: 2, matched: 1 });
    expect(turbo?.terms.unidade).toEqual({ reference: 2, matched: 2 });
    expect(turbo?.extraTerms).toBe(1);
  });

  it('computes latency percentiles and cost per audio minute', () => {
    const [v3] = report({
      ...RESULT,
      outcomes: [
        ...RESULT.outcomes.slice(0, 3),
        ok('ditado-02', TURBO, 'PA 120 por 80, FC 110.', 300),
      ],
    }).summaries;

    expect(v3?.latencyP50Ms).toBe(1500);
    expect(v3?.latencyP90Ms).toBe(1900);
    expect(v3?.usdPerAudioMinute).toBeCloseTo(0.002 / 1.5);
  });
});

describe('renderReport', () => {
  it('shows the clinical differences per file, doses in bold', () => {
    const markdown = renderReport(report());

    expect(markdown).toContain('| ditado-01 | whisper-large-v3-turbo |');
    expect(markdown).toContain('**0,1 mcg/kg/min**');
    expect(markdown).toContain('**1 mcg/kg/min**');
    expect(markdown).toMatch(/\| dobutamina \| droga \| 1 \| 1 \| 0 \|/);
    expect(markdown).toMatch(/\| dopamina \| droga \| 0 \| 0 \| 0 \(\+1 a mais\) \|/);
    expect(markdown).toContain('| ditado-02 | whisper-large-v3-turbo | other | 500 |');
  });

  it('never carries the transcribed or reference sentences', () => {
    const markdown = renderReport(report());

    expect(markdown).not.toMatch(/paciente de 54 anos/i);
    expect(markdown).not.toMatch(/com dispneia/i);
  });

  it('says when the run stopped early', () => {
    const markdown = renderReport(
      report({ ...RESULT, stop: { reason: 'limit', id: 'ditado-02', model: TURBO } }),
    );

    expect(markdown).toContain('**Parou antes do fim:** limite de uso da API');
  });
});

describe('renderSummaryTable', () => {
  it('has metrics per model and nothing from the dictations (it goes to the console)', () => {
    const summary = renderSummaryTable(report());

    expect(summary).toContain('| WER (sem acento) | 0,0% | 11,8% |');
    expect(summary).toContain('| · doses e volumes | 100,0% (2/2) | 50,0% (1/2) |');
    expect(summary).not.toContain('ditado-');
    expect(summary).not.toContain('mcg');
    expect(summary).not.toContain('dobutamina');
  });
});
