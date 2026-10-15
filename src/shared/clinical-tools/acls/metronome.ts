/**
 * Agendador do metrônomo de RCP (CC-313), sem áudio e sem relógio próprio.
 *
 * O ANY tocava cada batida num `setInterval` de 545 ms: o navegador atrasa
 * timer (aba em segundo plano, tela cheia de trabalho) e cada atraso entrava
 * no ritmo. Aqui segue o padrão de "agendar à frente" do Web Audio: um laço
 * curto acorda a cada ~25 ms, olha o relógio do áudio e marca no hardware de
 * som toda batida que cai na próxima janela. A hora da batida n é sempre
 * `âncora + n × intervalo` — nunca a anterior somada de novo —, então atraso
 * do laço não acumula: no pior caso uma batida sai pulada, e o ritmo continua
 * na mesma grade.
 *
 * Tudo em segundos do relógio de áudio (`AudioContext.currentTime`).
 */

/** De quanto em quanto tempo o laço de agendamento acorda. */
export const SCHEDULER_TICK_MS = 25;

/** Janela agendada à frente com a aba visível. */
export const SCHEDULE_AHEAD_SECONDS = 0.2;

/**
 * Com a aba oculta o navegador segura timer por até 1 s: a janela cresce para
 * o laço atrasado ainda encontrar as batidas agendadas.
 */
export const HIDDEN_SCHEDULE_AHEAD_SECONDS = 1.5;

/**
 * Batida que já passou há mais que isto não toca: soaria fora do ritmo. Uma
 * pouco atrasada toca na hora (o Web Audio trata horário passado como "agora").
 */
export const LATE_TOLERANCE_SECONDS = 0.05;

export interface BeatGrid {
  /** Hora da batida 0. */
  anchor: number;
  /** Segundos entre batidas (60 / 110 para as compressões). */
  interval: number;
}

export interface BeatWindow {
  /** Horas das batidas para agendar, em ordem. */
  beats: number[];
  /** Batidas que já tinham passado quando o laço acordou. */
  skipped: number;
  /** Índice da próxima batida ainda não agendada. */
  nextIndex: number;
}

export function beatTime(grid: BeatGrid, index: number): number {
  return grid.anchor + index * grid.interval;
}

/**
 * Batidas da grade em `[now - tolerância, now + horizonte)` a partir de
 * `nextIndex`. Uma pausa longa (aparelho travou, aba suspensa) pula as
 * batidas perdidas de uma vez, sem rajada e sem laço proporcional à pausa.
 */
export function takeBeats(
  grid: BeatGrid,
  nextIndex: number,
  now: number,
  horizon: number,
  lateTolerance = LATE_TOLERANCE_SECONDS,
): BeatWindow {
  const firstPlayable = Math.ceil((now - lateTolerance - grid.anchor) / grid.interval);
  const start = Math.max(nextIndex, firstPlayable);
  const beats: number[] = [];
  let index = start;
  while (beatTime(grid, index) < now + horizon) {
    beats.push(beatTime(grid, index));
    index += 1;
  }
  return { beats, skipped: start - nextIndex, nextIndex: index };
}

export interface BeatTrack {
  /** Agenda o que couber na janela e avança o cursor. */
  take(now: number, horizon: number): BeatWindow;
  readonly grid: BeatGrid;
}

/** Uma faixa de batidas (compressão ou ventilação) com o cursor guardado. */
export function createBeatTrack(grid: BeatGrid): BeatTrack {
  let nextIndex = 0;
  return {
    grid,
    take(now, horizon) {
      const window = takeBeats(grid, nextIndex, now, horizon);
      nextIndex = window.nextIndex;
      return window;
    },
  };
}

/** Intervalo entre batidas para uma frequência por minuto. */
export function intervalForRate(perMinute: number): number {
  return 60 / perMinute;
}
