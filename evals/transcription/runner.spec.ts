import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WhisperApiError } from '../../src/modules/audio/whisper.service';
import type { WhisperModel } from '../../src/modules/audio/whisper.settings';
import type { AudioSample } from './dataset';
import { billedCostUsd, MIN_BILLED_SECONDS, plannedCostUsd } from './pricing';
import { runTranscriptions, TranscriptionFailure, type Transcriber } from './runner';
import { createWhisperTranscriber, failureKind } from './whisper-transcriber';

const MODELS: WhisperModel[] = ['whisper-large-v3', 'whisper-large-v3-turbo'];

function sample(id: string, durationSec = 60): AudioSample {
  return {
    id,
    audioPath: `/nao/usado/${id}.webm`,
    mimeType: 'audio/webm',
    sizeBytes: 1,
    durationSec,
    reference: `referência de ${id}`,
  };
}

/** Transcritor falso: devolve a referência, ou o erro programado para id/modelo. */
function fakeTranscriber(failures: Record<string, Error> = {}): Transcriber & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    transcribe: (audio, model) => {
      calls.push(`${audio.id}/${model}`);
      const failure = failures[`${audio.id}/${model}`];
      return failure ? Promise.reject(failure) : Promise.resolve(audio.reference);
    },
  };
}

describe('pricing', () => {
  it('bills per hour of audio with a 10 s minimum per call', () => {
    expect(billedCostUsd('whisper-large-v3', 3600)).toBeCloseTo(0.111);
    expect(billedCostUsd('whisper-large-v3-turbo', 3600)).toBeCloseTo(0.04);
    expect(billedCostUsd('whisper-large-v3', 2)).toBe(
      billedCostUsd('whisper-large-v3', MIN_BILLED_SECONDS),
    );
  });

  it('plans the cost of every audio with every model', () => {
    expect(plannedCostUsd([1800, 1800], MODELS)).toBeCloseTo(0.111 + 0.04);
  });
});

describe('runTranscriptions', () => {
  const options = { models: MODELS, maxUsd: 1, concurrency: 1 };

  it('runs every audio with every model, file by file', async () => {
    const transcriber = fakeTranscriber();

    const result = await runTranscriptions([sample('a'), sample('b')], transcriber, options);

    expect(transcriber.calls).toEqual([
      'a/whisper-large-v3',
      'a/whisper-large-v3-turbo',
      'b/whisper-large-v3',
      'b/whisper-large-v3-turbo',
    ]);
    expect(result.stop).toBeNull();
    expect(result.outcomes.every((outcome) => outcome.kind === 'ok')).toBe(true);
    expect(result.spentUsd).toBeCloseTo(plannedCostUsd([60, 60], MODELS));
  });

  it('measures latency with the injected clock', async () => {
    let tick = 0;
    const result = await runTranscriptions([sample('a')], fakeTranscriber(), {
      ...options,
      models: ['whisper-large-v3'],
      now: () => (tick += 250),
    });

    expect(result.outcomes[0]).toMatchObject({ kind: 'ok', latencyMs: 250 });
  });

  it('stops at the first usage-limit error and skips the rest', async () => {
    const transcriber = fakeTranscriber({
      'a/whisper-large-v3-turbo': new TranscriptionFailure('limit', 429),
    });

    const result = await runTranscriptions(
      [sample('a'), sample('b'), sample('c')],
      transcriber,
      options,
    );

    expect(transcriber.calls).toEqual(['a/whisper-large-v3', 'a/whisper-large-v3-turbo']);
    expect(result.stop).toEqual({ reason: 'limit', id: 'a', model: 'whisper-large-v3-turbo' });
    expect(result.outcomes.map((outcome) => outcome.kind)).toEqual([
      'ok',
      'error',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });

  it('also stops when the key is refused', async () => {
    const result = await runTranscriptions(
      [sample('a'), sample('b')],
      fakeTranscriber({ 'a/whisper-large-v3': new TranscriptionFailure('auth', 401) }),
      options,
    );

    expect(result.stop?.reason).toBe('auth');
  });

  it('records other failures and keeps going', async () => {
    const transcriber = fakeTranscriber({
      'a/whisper-large-v3': new TranscriptionFailure('other', 500),
      'b/whisper-large-v3': new TypeError('fetch failed'),
    });

    const result = await runTranscriptions([sample('a'), sample('b')], transcriber, options);

    expect(result.stop).toBeNull();
    expect(transcriber.calls).toHaveLength(4);
    expect(result.outcomes[0]).toMatchObject({ kind: 'error', failure: 'other', status: 500 });
    expect(result.outcomes[2]).toMatchObject({
      kind: 'error',
      failure: 'other',
      status: null,
      message: 'fetch failed',
    });
  });

  it('never starts a call that would pass the spending ceiling', async () => {
    const perCall = billedCostUsd('whisper-large-v3', 600);
    const transcriber = fakeTranscriber();

    const result = await runTranscriptions([sample('a', 600), sample('b', 600)], transcriber, {
      models: ['whisper-large-v3'],
      maxUsd: perCall * 1.5,
      concurrency: 1,
    });

    expect(transcriber.calls).toEqual(['a/whisper-large-v3']);
    expect(result.stop).toEqual({ reason: 'budget', id: 'b', model: 'whisper-large-v3' });
    expect(result.spentUsd).toBeCloseTo(perCall);
  });

  it('runs a plan that costs exactly the ceiling', async () => {
    const samples = [sample('a', 37), sample('b', 41), sample('c', 53)];
    const ceiling = plannedCostUsd(
      samples.map((s) => s.durationSec),
      MODELS,
    );

    const result = await runTranscriptions(samples, fakeTranscriber(), {
      ...options,
      maxUsd: ceiling,
    });

    expect(result.stop).toBeNull();
  });

  it('keeps parallel calls under the ceiling and at the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const transcriber: Transcriber = {
      transcribe: async (audio) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return audio.reference;
      },
    };
    const samples = Array.from({ length: 6 }, (_, i) => sample(`s${i}`, 600));
    const perCall = billedCostUsd('whisper-large-v3', 600);

    const result = await runTranscriptions(samples, transcriber, {
      models: ['whisper-large-v3'],
      maxUsd: perCall * 4,
      concurrency: 2,
    });

    expect(peak).toBe(2);
    expect(result.outcomes.filter((outcome) => outcome.kind === 'ok')).toHaveLength(4);
    expect(result.spentUsd).toBeLessThanOrEqual(perCall * 4 + 1e-12);
  });

  it('reports progress without the transcript', async () => {
    const onOutcome = vi.fn();
    await runTranscriptions([sample('a')], fakeTranscriber(), {
      ...options,
      models: ['whisper-large-v3'],
      onOutcome,
    });

    expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 1, 1);
  });
});

describe('createWhisperTranscriber', () => {
  it('sends the audio file to the project Whisper client with the chosen model', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc205-'));
    try {
      writeFileSync(join(dir, 'a.webm'), 'audio');
      const whisper = { transcribe: vi.fn().mockResolvedValue('texto') };

      const text = await createWhisperTranscriber(whisper).transcribe(
        { ...sample('a'), audioPath: join(dir, 'a.webm') },
        'whisper-large-v3-turbo',
      );

      expect(text).toBe('texto');
      expect(whisper.transcribe).toHaveBeenCalledWith(Buffer.from('audio'), 'audio/webm', {
        model: 'whisper-large-v3-turbo',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('classifies provider errors so the runner can stop on a usage limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc205-'));
    try {
      writeFileSync(join(dir, 'a.webm'), 'audio');
      const whisper = { transcribe: vi.fn().mockRejectedValue(new WhisperApiError(429)) };

      const error = await createWhisperTranscriber(whisper)
        .transcribe({ ...sample('a'), audioPath: join(dir, 'a.webm') }, 'whisper-large-v3')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TranscriptionFailure);
      expect(error).toMatchObject({ kind: 'limit', status: 429 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    [429, 'limit'],
    [402, 'limit'],
    [401, 'auth'],
    [403, 'auth'],
    [413, 'other'],
    [500, 'other'],
  ] as const)('maps HTTP %d to %s', (status, kind) => {
    expect(failureKind(status)).toBe(kind);
  });
});
