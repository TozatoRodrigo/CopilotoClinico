import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ACLS_CYCLE_SECONDS,
  ACLS_MEDICATION_GROUPS,
  ACLS_MEDICATIONS,
  ACLS_METRONOME,
  COMPRESSION_FRACTION_TARGET_PERCENT,
  DEFAULT_EPINEPHRINE_INTERVAL_SECONDS,
  EPINEPHRINE_INTERVALS_SECONDS,
} from '../../src/shared/clinical-tools/acls/content';
import {
  formatElapsed,
  selectCompressionFraction,
  selectGuide,
  selectNudges,
  type AclsGuide,
  type AclsNudge,
  type AclsState,
} from '../../src/shared/clinical-tools/acls/session';
import { apply, newPairedSession, nextOperation, type PairedSession } from './acls-driver';
import {
  anyAcls,
  anyComponent,
  anyMetronomeDefaults,
  anyMetronomeSource,
  type AnyGuide,
  type AnyNudge,
  type AnyState,
} from './acls-reference';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-313 — o ACLS do Copiloto contra o `AclsGuide` do ANY congelado
 * (tests/any-reference), rodando o reducer e as contas do próprio ANY.
 *
 * 1.000 paradas aleatórias (semente fixa): a cada toque, o mesmo estado
 * (contadores, epinefrina, amiodarona, via aérea, pausas, desfecho e linha do
 * tempo) e, em instantes aleatórios entre os toques, o mesmo card "Agora", os
 * mesmos lembretes e a mesma FCT.
 *
 * Diferenças deliberadas, e só elas:
 * - textos com imperativo viraram sugestão (`LANGUAGE_CHANGES`);
 * - o ANY registrava o ritmo duas vezes em cada checagem; o Copiloto, uma
 *   (revisão clínica, item 3.1).
 *
 * O branch antigo do ANY (claude/update-test-database-M10pD) não tem teste do
 * ACLS: não há teste antigo para portar aqui.
 */

const SEED = 20261015;
const BASE_TIME = Date.UTC(2026, 9, 15, 3, 0, 0);

/** Texto do ANY → texto no Copiloto (só linguagem; ver docs/ferramentas/revisao-clinica/acls.md). */
const LANGUAGE_CHANGES: Record<string, string> = {
  'RCP de alta qualidade + prepare choque': 'RCP de alta qualidade + preparar choque',
  'Após 3° choque sem sucesso': 'Após 3º choque sem sucesso',
  'Priorize acesso IV. IO se IV não viável.': 'Considere priorizar acesso IV; IO se IV não viável.',
  '1ª dose (após 3° choque)': '1ª dose (após 3º choque)',
};

function changed(text: string): string {
  const epinephrine = text.match(/^Mantenha epinefrina a cada (\d+(?:\.\d+)?) min$/);
  if (epinephrine) return `Epinefrina a cada ${epinephrine[1]} min`;
  return LANGUAGE_CHANGES[text] ?? text;
}

const ANY_GUIDE_ID: Record<string, AclsGuide['id']> = {
  'RCP de alta qualidade': 'cpr',
  'RCP de alta qualidade + prepare choque': 'cpr-prepare-shock',
  'Considere amiodarona 300 mg IV': 'amiodarone-300',
  'Considere amiodarona 150 mg IV': 'amiodarone-150',
};

const ANY_NUDGE_ID: Record<string, AclsNudge['id']> = {
  epi: 'epinephrine',
  iv: 'iv-access',
  airway: 'advanced-airway',
  ht: 'reversible-causes',
};

const MEDICATION_NAME = new Map(ACLS_MEDICATIONS.map(({ id, name }) => [id, name]));

function projectAny(session: PairedSession) {
  const state: AnyState = session.any;
  return {
    running: state.running,
    rhythm: state.rhythm,
    cycleCount: state.cycleCount,
    shockCount: state.shockCount,
    lastEpinephrineAt: state.lastEpiTime,
    epinephrineInterval: state.epiInterval,
    amiodarone300Given: state.amio300Given,
    amiodarone150Given: state.amio150Given,
    advancedAirway: state.advancedAirway,
    outcome: state.outcome,
    endedAt: state.endTime,
    pauseStartedAt: state.pauseStart,
    totalPauseMs: state.totalPauseTime,
    medications: state.medCounts,
    events: state.events
      .filter((_, index) => !session.duplicateRhythmEvents.has(index))
      .map(({ time, type, detail }) => ({ time, type, detail })),
  };
}

function projectOurs(state: AclsState): ReturnType<typeof projectAny> {
  return {
    running: state.status === 'running',
    rhythm: state.rhythm,
    cycleCount: state.cycleCount,
    shockCount: state.shockCount,
    lastEpinephrineAt: state.lastEpinephrineAt,
    epinephrineInterval: state.epinephrineIntervalSeconds,
    amiodarone300Given: state.amiodarone300Given,
    amiodarone150Given: state.amiodarone150Given,
    advancedAirway: state.advancedAirway,
    outcome: state.outcome,
    endedAt: state.endedAt,
    pauseStartedAt: state.pauseStartedAt,
    totalPauseMs: state.totalPauseMs,
    medications: Object.fromEntries(
      Object.entries(state.medicationCounts).map(([id, count]) => [
        MEDICATION_NAME.get(id as never) ?? id,
        count,
      ]),
    ),
    events: state.events.map(({ elapsedSeconds, type, detail }) => ({
      time: elapsedSeconds,
      type,
      detail,
    })),
  };
}

function expectedGuide(guide: AnyGuide): Omit<AclsGuide, 'kind'> & { kind: string } {
  return {
    id: ANY_GUIDE_ID[guide.text] ?? (`?${guide.text}` as AclsGuide['id']),
    kind: guide.type,
    text: changed(guide.text),
    detail: guide.sub === '' ? null : changed(guide.sub),
  };
}

function expectedNudges(nudges: readonly AnyNudge[]): AclsNudge[] {
  return nudges.map((nudge) => ({
    id: ANY_NUDGE_ID[nudge.id] ?? (`?${nudge.id}` as AclsNudge['id']),
    text: changed(nudge.text),
    urgent: nudge.urgent,
  }));
}

/** Instantes logo antes, em cima e logo depois de cada limiar de tempo ainda por vir. */
function boundaries(state: AclsState, now: number): number[] {
  const edges: number[] = [];
  if (state.startedAt !== null) edges.push(state.startedAt + 180_000);
  if (state.lastEpinephrineAt !== null) {
    edges.push(state.lastEpinephrineAt + state.epinephrineIntervalSeconds * 1000);
  }
  return edges.flatMap((edge) => [edge - 1, edge, edge + 999]).filter((at) => at >= now);
}

/** Card "Agora", lembretes e FCT dos dois no instante `now`. */
function observe(session: PairedSession, now: number) {
  vi.setSystemTime(now);
  const { getElapsed } = anyAcls();
  const any = anyComponent({
    state: session.any,
    totalElapsed: getElapsed(session.any.startTime),
    storage: { getItem: () => null, setItem: () => undefined },
  });
  return {
    expected: {
      guide: expectedGuide(any.getGuide()),
      nudges: expectedNudges(any.getNudges()),
      fct: any.fct,
    },
    received: {
      guide: selectGuide(session.ours),
      nudges: selectNudges(session.ours, now),
      fct: selectCompressionFraction(session.ours, now),
    },
  };
}

describe('ACLS contra o ANY congelado — 1.000 paradas aleatórias', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('mesmo estado, mesmo card "Agora", mesmos lembretes e mesma FCT', () => {
    const random = seededRandom(SEED);
    const mismatches: unknown[] = [];
    const reached = { amiodarone150: 0, urgentEpinephrine: 0, rosc: 0, death: 0, twoNudges: 0 };

    for (let index = 0; index < DIFFERENTIAL_CASES && mismatches.length < 5; index += 1) {
      const session = newPairedSession();
      let now = BASE_TIME + random.integer(0, 365 * 24 * 3600) * 1000;
      const steps = random.integer(5, 80);
      for (let step = 0; step < steps + 40; step += 1) {
        const operation = nextOperation(session, now, random, step >= steps);
        apply(session, operation);
        now = operation.at;

        const state = projectOurs(session.ours);
        const expected = projectAny(session);
        if (JSON.stringify(state) !== JSON.stringify(expected)) {
          mismatches.push({ case: index, step, operation, expected, received: state });
          break;
        }
        if (session.ours.status !== 'running') break;

        // Um instante qualquer antes do próximo toque (os timers correm) e as
        // bordas dos limiares: 3 min de parada e o vencimento da epinefrina.
        for (const at of [now + random.integer(0, 30_000), ...boundaries(session.ours, now)]) {
          const { expected: anyView, received: ourView } = observe(session, at);
          if (JSON.stringify(anyView) !== JSON.stringify(ourView)) {
            mismatches.push({ case: index, step, at, expected: anyView, received: ourView });
            break;
          }
          if (ourView.guide.id === 'amiodarone-150') reached.amiodarone150 += 1;
          if (ourView.nudges.some(({ urgent }) => urgent)) reached.urgentEpinephrine += 1;
          if (ourView.nudges.length === 2) reached.twoNudges += 1;
        }
        if (mismatches.length > 0) break;
      }
      if (session.ours.outcome === 'rosc') reached.rosc += 1;
      if (session.ours.outcome === 'death') reached.death += 1;
    }

    expect(mismatches).toEqual([]);
    // O gerador chegou aos casos que importam (senão o teste passaria vazio).
    expect(reached.amiodarone150).toBeGreaterThan(0);
    expect(reached.urgentEpinephrine).toBeGreaterThan(0);
    expect(reached.twoNudges).toBeGreaterThan(0);
    expect(reached.rosc + reached.death).toBe(DIFFERENTIAL_CASES);
  });
});

describe('conteúdo do ACLS igual ao do ANY', () => {
  const any = anyAcls();
  const source = anyMetronomeSource();

  it('as 7 medicações, na mesma ordem, com nome, uso e grupo', () => {
    expect(
      ACLS_MEDICATIONS.map(({ name, hint, group }) => ({
        name,
        dose: hint,
        group: ACLS_MEDICATION_GROUPS.find(({ id }) => id === group)?.label,
      })),
    ).toEqual(
      any.MEDICATIONS.map((medication) => ({ ...medication, dose: changed(medication.dose) })),
    );
  });

  it('ciclo de 2 min, epinefrina 3/4/5 min (4 sugerido) e meta de FCT de 80%', () => {
    expect(ACLS_CYCLE_SECONDS).toBe(120);
    expect(any.INITIAL_STATE.epiInterval).toBe(DEFAULT_EPINEPHRINE_INTERVAL_SECONDS);
    expect(EPINEPHRINE_INTERVALS_SECONDS).toEqual([180, 240, 300]);
    expect(COMPRESSION_FRACTION_TARGET_PERCENT).toBe(80);
  });

  it('metrônomo de 110/min, ventilação a cada 6 s e os mesmos sons', () => {
    expect(anyMetronomeDefaults()).toEqual({
      bpm: ACLS_METRONOME.compressionsPerMinute,
      ventEnabled: false,
      ventIntervalMs: ACLS_METRONOME.ventilationIntervalSeconds * 1000,
    });
    const { click, ventilation, alert } = ACLS_METRONOME;
    expect(source).toContain(`osc.frequency.value = ${click.frequencyHz}`);
    expect(source).toContain(`ctx.currentTime + ${click.durationSeconds})`);
    expect(source).toContain(`osc1.frequency.value = ${ventilation.frequenciesHz[0]}`);
    expect(source).toContain(`osc2.frequency.value = ${ventilation.frequenciesHz[1]}`);
    expect(source).toContain(`}, ${ventilation.gapSeconds * 1000})`);
    expect(source).toContain(`osc.type = '${alert.wave}'`);
    expect(source).toContain(`osc.frequency.value = ${alert.frequencyHz}`);
    expect(source).toContain(`setTimeout(beep, ${alert.gapSeconds * 1000})`);
  });

  it('formatElapsed igual ao do ANY', () => {
    for (const seconds of [0, 5, 59, 60, 61, 119, 120, 599, 3599, 3600, 3700, 7322]) {
      expect(formatElapsed(seconds)).toBe(any.formatElapsed(seconds));
    }
  });
});
