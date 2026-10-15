import { vi } from 'vitest';
import {
  ACLS_MEDICATIONS,
  type AclsMedicationId,
  type AclsRhythm,
  type EpinephrineIntervalSeconds,
} from '../../src/shared/clinical-tools/acls/content';
import {
  aclsReducer,
  cycleDueAt,
  INITIAL_ACLS_STATE,
  type AclsRhythmCheckResult,
  type AclsState,
} from '../../src/shared/clinical-tools/acls/session';
import { anyAcls, type AnyAction, type AnyState } from './acls-reference';
import type { SeededRandom } from './seeded-random';

/**
 * Dirige o ANY e o Copiloto lado a lado com os mesmos toques, no mesmo
 * instante: cada operação da tela vira as ações que o `AclsGuide` do ANY
 * despachava (com `Date.now()` no relógio falso) e a ação do nosso reducer
 * (com `at`). Usado pelo teste diferencial do ACLS.
 */

export type AclsOperation =
  | { kind: 'start'; at: number }
  | { kind: 'select-rhythm'; at: number; rhythm: AclsRhythm }
  | { kind: 'complete-cycle'; at: number }
  | { kind: 'check-rhythm'; at: number; result: AclsRhythmCheckResult; etco2?: number }
  | { kind: 'shock'; at: number }
  | { kind: 'medication'; at: number; medication: AclsMedicationId }
  | { kind: 'airway'; at: number; value: boolean }
  | { kind: 'epinephrine-interval'; at: number; seconds: EpinephrineIntervalSeconds }
  | { kind: 'pause'; at: number };

const MEDICATION_NAME = new Map(ACLS_MEDICATIONS.map(({ id, name }) => [id, name]));

export interface PairedSession {
  any: AnyState;
  ours: AclsState;
  /**
   * Índices de eventos do ANY que o Copiloto não repete: o registro duplicado
   * do ritmo na checagem (SET_RHYTHM depois do ADD_EVENT; revisão clínica,
   * item 3.1).
   */
  duplicateRhythmEvents: Set<number>;
}

export function newPairedSession(): PairedSession {
  return {
    any: anyAcls().INITIAL_STATE,
    ours: INITIAL_ACLS_STATE,
    duplicateRhythmEvents: new Set(),
  };
}

function dispatchAny(session: PairedSession, actions: readonly AnyAction[]): void {
  const { aclsReducer: anyReducer } = anyAcls();
  for (const action of actions) session.any = anyReducer(session.any, action);
}

/** Aplica a operação nos dois, com o relógio falso parado em `at`. */
export function apply(session: PairedSession, operation: AclsOperation): void {
  vi.setSystemTime(operation.at);
  const { getElapsed } = anyAcls();
  switch (operation.kind) {
    case 'start':
      dispatchAny(session, [{ type: 'START' }]);
      session.ours = aclsReducer(session.ours, { type: 'start', at: operation.at });
      return;
    case 'select-rhythm':
      dispatchAny(session, [{ type: 'SET_RHYTHM', rhythm: operation.rhythm }]);
      session.ours = aclsReducer(session.ours, {
        type: 'select-rhythm',
        at: operation.at,
        rhythm: operation.rhythm,
      });
      return;
    case 'complete-cycle':
      dispatchAny(session, [{ type: 'INCREMENT_CYCLE' }]);
      session.ours = aclsReducer(session.ours, { type: 'complete-cycle', at: operation.at });
      return;
    case 'check-rhythm': {
      // handleRhythmCheck do ANY.
      if (operation.etco2 !== undefined) {
        dispatchAny(session, [
          {
            type: 'ADD_EVENT',
            event: {
              time: getElapsed(session.any.startTime),
              type: 'etco2',
              detail: `ETCO2: ${operation.etco2} mmHg`,
            },
          },
        ]);
      }
      if (operation.result === 'rosc') dispatchAny(session, [{ type: 'FINISH_ROSC' }]);
      else if (operation.result === 'death') dispatchAny(session, [{ type: 'FINISH_DEATH' }]);
      else {
        dispatchAny(session, [
          {
            type: 'ADD_EVENT',
            event: {
              time: getElapsed(session.any.startTime),
              type: 'rhythm',
              detail: operation.result === 'shockable' ? 'Ritmo chocável' : 'Ritmo não chocável',
            },
          },
          { type: 'SET_RHYTHM', rhythm: operation.result },
        ]);
        session.duplicateRhythmEvents.add(session.any.events.length - 1);
      }
      session.ours = aclsReducer(session.ours, {
        type: 'check-rhythm',
        at: operation.at,
        result: operation.result,
        ...(operation.etco2 === undefined ? {} : { etco2: operation.etco2 }),
      });
      return;
    }
    case 'shock':
      dispatchAny(session, [{ type: 'REGISTER_SHOCK' }]);
      session.ours = aclsReducer(session.ours, { type: 'register-shock', at: operation.at });
      return;
    case 'medication': {
      // handleRegisterMed do ANY: a epinefrina também zera o timer.
      const name = MEDICATION_NAME.get(operation.medication) ?? '';
      dispatchAny(session, [{ type: 'REGISTER_MED', name }]);
      if (name.includes('Epinefrina')) {
        dispatchAny(session, [{ type: 'SET_LAST_EPI_TIME', time: Date.now() }]);
      }
      session.ours = aclsReducer(session.ours, {
        type: 'register-medication',
        at: operation.at,
        medication: operation.medication,
      });
      return;
    }
    case 'airway':
      dispatchAny(session, [{ type: 'SET_ADVANCED_AIRWAY', value: operation.value }]);
      session.ours = aclsReducer(session.ours, {
        type: 'set-advanced-airway',
        at: operation.at,
        value: operation.value,
      });
      return;
    case 'epinephrine-interval':
      dispatchAny(session, [{ type: 'SET_EPI_INTERVAL', value: operation.seconds }]);
      session.ours = aclsReducer(session.ours, {
        type: 'set-epinephrine-interval',
        seconds: operation.seconds,
      });
      return;
    case 'pause':
      dispatchAny(session, [{ type: 'TOGGLE_PAUSE' }]);
      session.ours = aclsReducer(session.ours, {
        type: 'toggle-compression-pause',
        at: operation.at,
      });
      return;
  }
}

const MEDICATION_WEIGHTS: readonly AclsMedicationId[] = [
  'epinefrina',
  'epinefrina',
  'epinefrina',
  'amiodarona-300',
  'amiodarona-300',
  'amiodarona-150',
  'lidocaina',
  'sulfato-magnesio',
  'gluconato-calcio',
  'bicarbonato',
];

/**
 * Próxima operação que a tela do ANY permitiria, num instante depois de
 * `now`: o ritmo logo após iniciar, a checagem quando o ciclo vence, e
 * choques (só no ritmo chocável), medicações, via aérea, intervalo da
 * epinefrina e pausas no meio do ciclo. `finishBy` força o fim da parada.
 */
export function nextOperation(
  session: PairedSession,
  now: number,
  random: SeededRandom,
  finishBy: boolean,
): AclsOperation {
  const state = session.ours;
  if (state.status !== 'running') return { kind: 'start', at: now + random.integer(0, 5_000) };
  if (state.rhythm === null) {
    return {
      kind: 'select-rhythm',
      at: now + random.integer(1_000, 20_000),
      rhythm: random.pick(['shockable', 'nonshockable'] as const),
    };
  }
  if (state.awaitingRhythmCheck) {
    const results: readonly AclsRhythmCheckResult[] = finishBy
      ? ['rosc', 'death']
      : ['shockable', 'shockable', 'nonshockable', 'nonshockable', 'rosc', 'death'];
    const etco2 = random.next() < 0.5 ? random.integer(5, 60) : undefined;
    return {
      kind: 'check-rhythm',
      at: now + random.integer(1_000, 15_000),
      result: random.pick(results),
      ...(etco2 === undefined ? {} : { etco2 }),
    };
  }
  const at = now + random.integer(500, 45_000);
  const due = cycleDueAt(state);
  if (due !== null && at >= due) return { kind: 'complete-cycle', at: due };

  const roll = random.next();
  if (state.rhythm === 'shockable' && roll < 0.3) return { kind: 'shock', at };
  if (roll < 0.6) return { kind: 'medication', at, medication: random.pick(MEDICATION_WEIGHTS) };
  if (roll < 0.68) return { kind: 'airway', at, value: !state.advancedAirway };
  if (roll < 0.74) {
    return { kind: 'epinephrine-interval', at, seconds: random.pick([180, 240, 300] as const) };
  }
  return { kind: 'pause', at };
}
