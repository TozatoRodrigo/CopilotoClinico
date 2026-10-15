import { ACLS_METRONOME } from '@clinical-tools/acls/content';
import {
  createBeatTrack,
  HIDDEN_SCHEDULE_AHEAD_SECONDS,
  intervalForRate,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_TICK_MS,
  type BeatTrack,
} from '@clinical-tools/acls/metronome';

/**
 * Som do ACLS (CC-313): metrônomo de 110/min com bipe de ventilação e o
 * alerta de fim de ciclo e de epinefrina. As batidas são marcadas no relógio
 * do Web Audio pelo agendador do motor (`@clinical-tools/acls/metronome`):
 * o laço de 25 ms só olha à frente e agenda, então atraso de timer não entra
 * no ritmo.
 *
 * Os sons e frequências são os do `MetronomeContext` do ANY.
 */

/** O pedaço do Web Audio que usamos; o teste injeta um falso com relógio controlado. */
export type AudioContextLike = Pick<
  AudioContext,
  'currentTime' | 'state' | 'destination' | 'resume' | 'close' | 'createOscillator' | 'createGain'
>;

export interface AclsAudioOptions {
  /** Cria o contexto de áudio; `null` quando o navegador não tem Web Audio. */
  createContext?: () => AudioContextLike | null;
  /** Aba oculta: a janela agendada cresce porque o navegador segura timer. */
  isHidden?: () => boolean;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface AclsAudio {
  /** Cria/retoma o contexto. Chame dentro de um toque: o iOS só libera som assim. */
  unlock(): boolean;
  startMetronome(options: { ventilation: boolean }): boolean;
  stopMetronome(): void;
  setVentilation(enabled: boolean): void;
  isMetronomeRunning(): boolean;
  /** Dois bipes graves: fim do ciclo de 2 min ou epinefrina vencida. */
  playAlert(): void;
  /** Fim da parada: para tudo e devolve o canal de áudio ao normal. */
  release(): void;
}

type Wave = OscillatorType;

/**
 * No iOS o Web Audio toca pelo canal de "ambiente", que obedece à chave do
 * silencioso. Declarar a sessão como reprodução (Safari 16.4+) faz o
 * metrônomo tocar com a chave no silencioso, como no ANY; sem suporte, nada
 * muda.
 */
function setAudioSession(type: 'playback' | 'auto'): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = type;
  } catch {
    /* navegador sem audioSession */
  }
}

function defaultCreateContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const Context =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
}

export function createAclsAudio(options: AclsAudioOptions = {}): AclsAudio {
  const createContext = options.createContext ?? defaultCreateContext;
  const isHidden =
    options.isHidden ??
    (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const setTimer = options.setTimer ?? ((callback, ms) => setInterval(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));

  let context: AudioContextLike | null = null;
  let loop: unknown = null;
  let compressions: BeatTrack | null = null;
  let ventilation: BeatTrack | null = null;
  /** Sons já marcados no futuro: parar o metrônomo cancela os que ainda não tocaram. */
  const pending = new Map<OscillatorNode, 'compression' | 'ventilation' | 'alert'>();

  function ready(): AudioContextLike | null {
    context ??= createContext();
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  }

  function tone(
    ctx: AudioContextLike,
    at: number,
    spec: { frequencyHz: number; seconds: number; gain: number; wave: Wave },
    kind: 'compression' | 'ventilation' | 'alert',
  ): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = spec.wave;
    oscillator.frequency.value = spec.frequencyHz;
    gain.gain.setValueAtTime(spec.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + spec.seconds);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    pending.set(oscillator, kind);
    oscillator.onended = () => pending.delete(oscillator);
    oscillator.start(at);
    oscillator.stop(at + spec.seconds);
  }

  function cancel(kind: 'compression' | 'ventilation'): void {
    for (const [oscillator, oscillatorKind] of pending) {
      if (oscillatorKind !== kind) continue;
      try {
        oscillator.stop(0);
      } catch {
        /* já tocou */
      }
      pending.delete(oscillator);
    }
  }

  function schedule(): void {
    const ctx = context;
    if (!ctx || !compressions) return;
    const horizon = isHidden() ? HIDDEN_SCHEDULE_AHEAD_SECONDS : SCHEDULE_AHEAD_SECONDS;
    const { click, ventilation: breath } = ACLS_METRONOME;
    for (const beat of compressions.take(ctx.currentTime, horizon).beats) {
      tone(
        ctx,
        beat,
        {
          frequencyHz: click.frequencyHz,
          seconds: click.durationSeconds,
          gain: click.gain,
          wave: click.wave,
        },
        'compression',
      );
    }
    for (const beat of ventilation?.take(ctx.currentTime, horizon).beats ?? []) {
      breath.frequenciesHz.forEach((frequencyHz, index) => {
        tone(
          ctx,
          beat + index * breath.gapSeconds,
          { frequencyHz, seconds: breath.toneSeconds, gain: breath.gain, wave: breath.wave },
          'ventilation',
        );
      });
    }
  }

  function ventilationTrack(ctx: AudioContextLike): BeatTrack {
    // Como no ANY, o primeiro bipe de ventilação vem 6 s depois de ligar.
    const interval = ACLS_METRONOME.ventilationIntervalSeconds;
    return createBeatTrack({ anchor: ctx.currentTime + interval, interval });
  }

  function stopMetronome(): void {
    if (loop !== null) clearTimer(loop);
    loop = null;
    compressions = null;
    ventilation = null;
    cancel('compression');
    cancel('ventilation');
  }

  return {
    unlock() {
      setAudioSession('playback');
      return ready() !== null;
    },
    startMetronome({ ventilation: withVentilation }) {
      const ctx = ready();
      if (!ctx) return false;
      setAudioSession('playback');
      stopMetronome();
      compressions = createBeatTrack({
        anchor: ctx.currentTime + 0.05,
        interval: intervalForRate(ACLS_METRONOME.compressionsPerMinute),
      });
      ventilation = withVentilation ? ventilationTrack(ctx) : null;
      schedule();
      loop = setTimer(schedule, SCHEDULER_TICK_MS);
      return true;
    },
    stopMetronome,
    setVentilation(enabled) {
      if (!compressions || !context) return;
      if (enabled && !ventilation) ventilation = ventilationTrack(context);
      if (!enabled) {
        ventilation = null;
        cancel('ventilation');
      }
    },
    isMetronomeRunning() {
      return compressions !== null;
    },
    playAlert() {
      const ctx = ready();
      if (!ctx) return;
      const { alert } = ACLS_METRONOME;
      for (let beep = 0; beep < alert.beeps; beep += 1) {
        tone(
          ctx,
          ctx.currentTime + beep * alert.gapSeconds,
          {
            frequencyHz: alert.frequencyHz,
            seconds: alert.toneSeconds,
            gain: alert.gain,
            wave: alert.wave,
          },
          'alert',
        );
      }
    },
    release() {
      stopMetronome();
      setAudioSession('auto');
      const ctx = context;
      context = null;
      pending.clear();
      if (ctx) void ctx.close().catch(() => undefined);
    },
  };
}
