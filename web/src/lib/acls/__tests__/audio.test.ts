import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACLS_METRONOME } from '@clinical-tools/acls/content';
import { createAclsAudio, type AudioContextLike } from '../audio';

/**
 * Metrônomo de verdade (o motor de áudio do CC-313) contra um AudioContext
 * falso cujo relógio é o relógio falso do Vitest, com o laço de agendamento
 * acordando atrasado ao acaso — como num celular ocupado.
 */

interface Played {
  at: number;
  frequency: number;
  wave: string;
  stoppedEarly: boolean;
}

function fakeAudioContext(origin: number) {
  const played: Played[] = [];
  const context = {
    state: 'running',
    destination: {},
    get currentTime() {
      return (Date.now() - origin) / 1000;
    },
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    },
    createOscillator() {
      const entry: Played = { at: Number.NaN, frequency: 0, wave: 'sine', stoppedEarly: false };
      const oscillator = {
        type: 'sine',
        frequency: { value: 0 },
        onended: null as (() => void) | null,
        connect: vi.fn(),
        start(at: number) {
          entry.at = at;
          entry.frequency = oscillator.frequency.value;
          entry.wave = oscillator.type;
          played.push(entry);
        },
        stop(at: number) {
          if (at === 0) entry.stoppedEarly = true;
        },
      };
      return oscillator;
    },
  };
  return { context: context as unknown as AudioContextLike, played };
}

/** setInterval que acorda com 0–60 ms de atraso a cada vez (semente fixa). */
function jitteryTimer(seed = 7) {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return {
    setTimer(callback: () => void, ms: number) {
      const handle = { id: undefined as ReturnType<typeof setTimeout> | undefined };
      const loop = () => {
        handle.id = setTimeout(
          () => {
            callback();
            loop();
          },
          ms + random() * 60,
        );
      };
      loop();
      return handle;
    },
    clearTimer(handle: unknown) {
      clearTimeout((handle as { id: ReturnType<typeof setTimeout> }).id);
    },
  };
}

const INTERVAL = 60 / ACLS_METRONOME.compressionsPerMinute;

describe('createAclsAudio — metrônomo', () => {
  let origin: number;

  beforeEach(() => {
    vi.useFakeTimers();
    origin = Date.now();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('20 min a 110/min com o laço atrasando: deriva < 2%, sem batida perdida nem dobrada', () => {
    const { context, played } = fakeAudioContext(origin);
    const audio = createAclsAudio({
      createContext: () => context,
      isHidden: () => false,
      ...jitteryTimer(),
    });

    expect(audio.startMetronome({ ventilation: false })).toBe(true);
    vi.advanceTimersByTime(20 * 60 * 1000);
    audio.stopMetronome();

    const clicks = played.filter(({ frequency }) => frequency === ACLS_METRONOME.click.frequencyHz);
    const first = clicks[0]?.at ?? 0;
    const last = clicks.at(-1)?.at ?? 0;
    const perMinute = ((clicks.length - 1) / (last - first)) * 60;
    expect(Math.abs(perMinute - 110) / 110).toBeLessThan(0.02);
    // 20 min a 110/min = 2.200 batidas (mais a que cai na janela já agendada).
    expect(clicks.length).toBeGreaterThanOrEqual(2200);
    expect(clicks.length).toBeLessThanOrEqual(2201);
    for (let index = 1; index < clicks.length; index += 1) {
      const gap = (clicks[index]?.at ?? 0) - (clicks[index - 1]?.at ?? 0);
      expect(gap).toBeCloseTo(INTERVAL, 9);
    }
  });

  it('com via aérea avançada soma o bipe duplo de ventilação a cada 6 s', () => {
    const { context, played } = fakeAudioContext(origin);
    const audio = createAclsAudio({ createContext: () => context, isHidden: () => false });

    audio.startMetronome({ ventilation: true });
    vi.advanceTimersByTime(60_000);

    const breaths = played.filter(({ frequency }) => frequency === 1200);
    const second = played.filter(({ frequency }) => frequency === 1500);
    expect(breaths).toHaveLength(10);
    expect(second).toHaveLength(10);
    expect((breaths[1]?.at ?? 0) - (breaths[0]?.at ?? 0)).toBeCloseTo(6, 9);
    expect((second[0]?.at ?? 0) - (breaths[0]?.at ?? 0)).toBeCloseTo(0.18, 9);
  });

  it('desligar a ventilação cancela o bipe já agendado e mantém as compressões', () => {
    const { context, played } = fakeAudioContext(origin);
    const audio = createAclsAudio({ createContext: () => context, isHidden: () => true });

    audio.startMetronome({ ventilation: true });
    vi.advanceTimersByTime(5_000);
    audio.setVentilation(false);
    vi.advanceTimersByTime(10_000);

    const breaths = played.filter(({ frequency }) => frequency === 1200);
    expect(breaths.length).toBeGreaterThan(0);
    expect(breaths.every(({ stoppedEarly }) => stoppedEarly)).toBe(true);
    expect(audio.isMetronomeRunning()).toBe(true);
  });

  it('parar cancela as batidas agendadas à frente', () => {
    const { context, played } = fakeAudioContext(origin);
    const audio = createAclsAudio({ createContext: () => context, isHidden: () => true });

    audio.startMetronome({ ventilation: false });
    vi.advanceTimersByTime(3_000);
    audio.stopMetronome();
    const future = played.filter(({ at }) => at > (Date.now() - origin) / 1000);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every(({ stoppedEarly }) => stoppedEarly)).toBe(true);
    expect(audio.isMetronomeRunning()).toBe(false);

    const before = played.length;
    vi.advanceTimersByTime(10_000);
    expect(played).toHaveLength(before);
  });

  it('o alerta são dois bipes graves de 600 Hz', () => {
    const { context, played } = fakeAudioContext(origin);
    const audio = createAclsAudio({ createContext: () => context });

    audio.playAlert();

    expect(played.map(({ frequency, wave }) => ({ frequency, wave }))).toEqual([
      { frequency: 600, wave: 'square' },
      { frequency: 600, wave: 'square' },
    ]);
    expect((played[1]?.at ?? 0) - (played[0]?.at ?? 0)).toBeCloseTo(0.2, 9);
  });

  it('sem Web Audio, não liga e não quebra', () => {
    const audio = createAclsAudio({ createContext: () => null });
    expect(audio.unlock()).toBe(false);
    expect(audio.startMetronome({ ventilation: false })).toBe(false);
    expect(() => audio.playAlert()).not.toThrow();
    expect(() => audio.release()).not.toThrow();
  });

  it('retoma o contexto suspenso (iOS) e fecha ao encerrar a parada', () => {
    const { context } = fakeAudioContext(origin);
    (context as unknown as { state: string }).state = 'suspended';
    const audio = createAclsAudio({ createContext: () => context });

    audio.unlock();
    audio.release();

    expect(context.resume).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
});
