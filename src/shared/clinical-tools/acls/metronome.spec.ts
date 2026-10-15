import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../../tests/clinical-tools/seeded-random';
import { ACLS_METRONOME } from './content';
import {
  beatTime,
  createBeatTrack,
  HIDDEN_SCHEDULE_AHEAD_SECONDS,
  intervalForRate,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_TICK_MS,
  takeBeats,
} from './metronome';

const INTERVAL = intervalForRate(ACLS_METRONOME.compressionsPerMinute);
const TWENTY_MINUTES = 20 * 60;

interface Simulation {
  beats: number[];
  skipped: number;
}

/**
 * Relógio falso: o laço de agendamento acorda a cada `tickMs` com atraso
 * aleatório (semente fixa) e, de vez em quando, trava por `stallMs` — como um
 * celular ocupado. Devolve as batidas que teriam sido marcadas no áudio.
 */
function simulate(options: {
  seconds: number;
  tickMs: number;
  jitterMs: number;
  horizon: number;
  stallEvery?: number;
  stallMs?: number;
  seed?: number;
}): Simulation {
  const random = seededRandom(options.seed ?? 20261015);
  const track = createBeatTrack({ anchor: 0.05, interval: INTERVAL });
  const beats: number[] = [];
  let skipped = 0;
  let now = 0;
  let wakeups = 0;
  while (now < options.seconds) {
    const window = track.take(now, options.horizon);
    beats.push(...window.beats.filter((beat) => beat < options.seconds));
    skipped += window.skipped;
    wakeups += 1;
    const stall =
      options.stallEvery && wakeups % options.stallEvery === 0 ? (options.stallMs ?? 0) : 0;
    now += (options.tickMs + random.next() * options.jitterMs + stall) / 1000;
  }
  return { beats, skipped };
}

/** Desvio do ritmo médio em relação a 110/min, em fração (0,02 = 2%). */
function rateDrift(beats: readonly number[]): number {
  const first = beats[0] ?? 0;
  const last = beats.at(-1) ?? 0;
  const perMinute = ((beats.length - 1) / (last - first)) * 60;
  return (
    Math.abs(perMinute - ACLS_METRONOME.compressionsPerMinute) /
    ACLS_METRONOME.compressionsPerMinute
  );
}

function expectOnGrid(beats: readonly number[]): void {
  for (let index = 1; index < beats.length; index += 1) {
    const gap = (beats[index] ?? 0) - (beats[index - 1] ?? 0);
    // Sem rajada: nunca duas batidas mais perto que o intervalo.
    expect(gap).toBeGreaterThan(INTERVAL - 1e-9);
    // Na grade: a distância é um número inteiro de intervalos.
    const steps = gap / INTERVAL;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
  }
}

describe('takeBeats', () => {
  it('agenda as batidas da janela e avança o cursor', () => {
    const grid = { anchor: 0, interval: 0.5 };
    expect(takeBeats(grid, 0, 0, 1.2)).toEqual({ beats: [0, 0.5, 1], skipped: 0, nextIndex: 3 });
    expect(takeBeats(grid, 3, 1.2, 0.4)).toEqual({ beats: [1.5], skipped: 0, nextIndex: 4 });
  });

  it('toca na hora a batida pouco atrasada e pula a muito atrasada', () => {
    const grid = { anchor: 0, interval: 0.5 };
    expect(takeBeats(grid, 1, 0.53, 0.1).beats).toEqual([0.5]);
    expect(takeBeats(grid, 1, 0.6, 0.1)).toEqual({ beats: [], skipped: 1, nextIndex: 2 });
  });

  it('pula uma pausa longa de uma vez, sem rajada', () => {
    const grid = { anchor: 0, interval: 0.5 };
    // Uma hora parada: nenhuma batida perdida é tocada.
    const window = takeBeats(grid, 0, 3600, 0.2);
    expect(window.beats).toEqual([3600]);
    expect(window.skipped).toBe(7200);
  });

  it('não repete batida já agendada', () => {
    const grid = { anchor: 0, interval: 0.5 };
    const first = takeBeats(grid, 0, 0, 0.6);
    const second = takeBeats(grid, first.nextIndex, 0.025, 0.6);
    expect(second.beats).toEqual([]);
  });
});

describe('metrônomo de 110/min com relógio falso (métrica do CC-313)', () => {
  it('20 min com o laço atrasando: deriva < 2% e nenhuma batida perdida', () => {
    const { beats, skipped } = simulate({
      seconds: TWENTY_MINUTES,
      tickMs: SCHEDULER_TICK_MS,
      jitterMs: 60,
      horizon: SCHEDULE_AHEAD_SECONDS,
    });
    expect(skipped).toBe(0);
    expect(beats).toHaveLength(Math.floor((TWENTY_MINUTES - 0.05) / INTERVAL) + 1);
    expect(rateDrift(beats)).toBeLessThan(0.02);
    // A grade não anda: a batida 2.000 sai exatamente onde deveria.
    expect(beats[2000]).toBeCloseTo(beatTime({ anchor: 0.05, interval: INTERVAL }, 2000), 9);
    expectOnGrid(beats);
  });

  it('com a aba oculta (timer a cada ~1 s) a janela maior segura o ritmo', () => {
    const { beats, skipped } = simulate({
      seconds: TWENTY_MINUTES,
      tickMs: 1000,
      jitterMs: 200,
      horizon: HIDDEN_SCHEDULE_AHEAD_SECONDS,
    });
    expect(skipped).toBe(0);
    expect(rateDrift(beats)).toBeLessThan(0.02);
    expectOnGrid(beats);
  });

  it('travadas maiores que a janela pulam batidas, mas o ritmo segue na grade', () => {
    const { beats, skipped } = simulate({
      seconds: TWENTY_MINUTES,
      tickMs: SCHEDULER_TICK_MS,
      jitterMs: 20,
      horizon: SCHEDULE_AHEAD_SECONDS,
      stallEvery: 2000,
      stallMs: 900,
    });
    expect(skipped).toBeGreaterThan(0);
    expect(rateDrift(beats)).toBeLessThan(0.02);
    expectOnGrid(beats);
  });

  it('controle: somar o intervalo a cada disparo (setInterval puro) deriva além de 2%', () => {
    // O que o ANY fazia: cada batida sai quando o timer acorda, e o atraso fica.
    const random = seededRandom(20261015);
    const beats: number[] = [];
    let now = 0;
    while (now < TWENTY_MINUTES) {
      beats.push(now);
      now += INTERVAL + (random.next() * 60) / 1000;
    }
    expect(rateDrift(beats)).toBeGreaterThan(0.02);
  });

  it('ventilação a cada 6 s na sua própria grade', () => {
    const track = createBeatTrack({
      anchor: 1,
      interval: ACLS_METRONOME.ventilationIntervalSeconds,
    });
    const beats: number[] = [];
    for (let now = 0; now < 60; now += 0.025) beats.push(...track.take(now, 0.2).beats);
    expect(beats).toEqual([1, 7, 13, 19, 25, 31, 37, 43, 49, 55]);
  });
});
