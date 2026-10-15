import { describe, expect, it } from 'vitest';
import {
  ACLS_MEDICATIONS,
  EPINEPHRINE_INTERVALS_SECONDS,
  GUIDE_TEXT,
  NUDGE_TEXT,
  RHYTHM_CHECK_TEXT,
} from './content';
import {
  aclsElapsedSeconds,
  aclsReducer,
  cycleDueAt,
  formatElapsed,
  INITIAL_ACLS_STATE,
  parseAclsState,
  selectCompressionFraction,
  selectCycle,
  selectEpinephrineTimer,
  selectGuide,
  selectNudges,
  type AclsAction,
  type AclsState,
} from './session';

const T0 = Date.UTC(2026, 9, 15, 17, 30, 0);
const s = (seconds: number) => T0 + seconds * 1000;

function run(actions: readonly AclsAction[], from: AclsState = INITIAL_ACLS_STATE): AclsState {
  return actions.reduce(aclsReducer, from);
}

function started(rhythm: 'shockable' | 'nonshockable' = 'shockable'): AclsState {
  return run([
    { type: 'start', at: s(0) },
    { type: 'select-rhythm', at: s(5), rhythm },
  ]);
}

function shocks(state: AclsState, count: number, fromSecond = 10): AclsState {
  return run(
    Array.from({ length: count }, (_, index) => ({
      type: 'register-shock' as const,
      at: s(fromSecond + index),
    })),
    state,
  );
}

describe('aclsReducer — parada (CC-313)', () => {
  it('inicia com o evento "Código iniciado" e espera o ritmo', () => {
    const state = run([{ type: 'start', at: s(0) }]);
    expect(state.status).toBe('running');
    expect(state.events).toEqual([
      { at: s(0), elapsedSeconds: 0, type: 'system', detail: 'Código iniciado' },
    ]);
    expect(selectCycle(state, s(30))).toEqual({ phase: 'waiting-rhythm' });
  });

  it('o ritmo inicial dispara o ciclo de 2 min', () => {
    const state = started('nonshockable');
    expect(state.events.at(-1)).toMatchObject({ elapsedSeconds: 5, detail: 'AESP/Assistolia' });
    expect(selectCycle(state, s(5))).toMatchObject({
      phase: 'running',
      number: 1,
      remainingSeconds: 120,
    });
    expect(selectCycle(state, s(65.4))).toMatchObject({ remainingSeconds: 60 });
    expect(cycleDueAt(state)).toBe(s(125));
  });

  it('não registra nada antes de iniciar nem depois de encerrar', () => {
    expect(aclsReducer(INITIAL_ACLS_STATE, { type: 'register-shock', at: s(1) })).toBe(
      INITIAL_ACLS_STATE,
    );
    const ended = run(
      [
        { type: 'complete-cycle', at: s(125) },
        { type: 'check-rhythm', at: s(130), result: 'rosc' },
      ],
      started(),
    );
    expect(aclsReducer(ended, { type: 'register-shock', at: s(140) })).toBe(ended);
  });

  it('fim do ciclo pede checagem de ritmo e o novo ritmo reinicia o ciclo', () => {
    const due = run([{ type: 'complete-cycle', at: s(125) }], started());
    expect(due.cycleCount).toBe(1);
    expect(due.events.at(-1)).toMatchObject({ elapsedSeconds: 125, detail: 'Ciclo 1 completo' });
    expect(selectCycle(due, s(126))).toEqual({ phase: 'awaiting-rhythm-check', number: 1 });
    expect(cycleDueAt(due)).toBeNull();
    // Um segundo aviso do mesmo ciclo não conta outro ciclo.
    expect(aclsReducer(due, { type: 'complete-cycle', at: s(126) })).toBe(due);

    const next = run(
      [{ type: 'check-rhythm', at: s(131), result: 'nonshockable', etco2: 12.5 }],
      due,
    );
    expect(next.rhythm).toBe('nonshockable');
    expect(next.events.slice(-2).map(({ detail }) => detail)).toEqual([
      'ETCO2: 12,5 mmHg',
      'Ritmo não chocável',
    ]);
    expect(selectCycle(next, s(131))).toMatchObject({ phase: 'running', number: 2 });
  });

  it('a checagem só vale com o ciclo vencido', () => {
    const state = started();
    expect(aclsReducer(state, { type: 'check-rhythm', at: s(30), result: 'rosc' })).toBe(state);
  });

  it('RCE e óbito encerram e param o relógio no fim', () => {
    const rosc = run(
      [
        { type: 'complete-cycle', at: s(125) },
        { type: 'check-rhythm', at: s(130), result: 'rosc' },
      ],
      started(),
    );
    expect(rosc).toMatchObject({ status: 'finished', outcome: 'rosc', endedAt: s(130) });
    expect(rosc.events.at(-1)?.detail).toBe('RCE obtido');
    expect(aclsElapsedSeconds(rosc, s(900))).toBe(130);
    expect(selectCycle(rosc, s(131))).toEqual({ phase: 'over' });

    const death = run(
      [
        { type: 'complete-cycle', at: s(125) },
        { type: 'check-rhythm', at: s(128), result: 'death' },
      ],
      started(),
    );
    expect(death.events.at(-1)?.detail).toBe('Óbito declarado');
  });

  it('conta choques e medicações com o nome na linha do tempo', () => {
    let state = shocks(started(), 2);
    state = run(
      [
        { type: 'register-medication', at: s(40), medication: 'epinefrina' },
        { type: 'register-medication', at: s(50), medication: 'epinefrina' },
        { type: 'register-medication', at: s(60), medication: 'lidocaina' },
      ],
      state,
    );
    expect(state.shockCount).toBe(2);
    expect(state.medicationCounts).toEqual({ epinefrina: 2, lidocaina: 1 });
    expect(state.lastEpinephrineAt).toBe(s(50));
    expect(state.events.slice(-5).map(({ detail }) => detail)).toEqual([
      'Choque 1',
      'Choque 2',
      'Epinefrina 1 mg IV/IO',
      'Epinefrina 1 mg IV/IO',
      'Lidocaína 100 mg IV',
    ]);
  });

  it('via aérea avançada registra só quando liga', () => {
    const on = run([{ type: 'set-advanced-airway', at: s(20), value: true }], started());
    const off = run([{ type: 'set-advanced-airway', at: s(30), value: false }], on);
    expect(on.events.at(-1)?.detail).toBe('Via aérea avançada confirmada');
    expect(off.advancedAirway).toBe(false);
    expect(off.events).toHaveLength(on.events.length);
  });

  it('pausa e retomada somam o tempo parado', () => {
    const state = run(
      [
        { type: 'toggle-compression-pause', at: s(60) },
        { type: 'toggle-compression-pause', at: s(68.4) },
      ],
      started(),
    );
    expect(state.totalPauseMs).toBe(8400);
    expect(state.events.slice(-2).map(({ detail }) => detail)).toEqual([
      'Pausa nas compressões',
      'Compressões retomadas (pausa: 8s)',
    ]);
  });

  it('descartar volta ao início', () => {
    expect(run([{ type: 'discard' }], started())).toBe(INITIAL_ACLS_STATE);
  });
});

describe('amiodarona no card "Agora" (critério 3 do CC-313)', () => {
  it('3 choques: sugere amiodarona 300 mg', () => {
    expect(selectGuide(shocks(started(), 3))).toMatchObject({
      id: 'amiodarone-300',
      kind: 'alert',
      text: 'Considere amiodarona 300 mg IV',
      detail: 'Após 3º choque sem sucesso',
    });
  });

  it('5 choques com a 1ª dose dada: sugere amiodarona 150 mg', () => {
    const state = run(
      [{ type: 'register-medication', at: s(100), medication: 'amiodarona-300' }],
      shocks(started(), 5),
    );
    expect(selectGuide(state)).toMatchObject({
      id: 'amiodarone-150',
      text: 'Considere amiodarona 150 mg IV',
      detail: 'Dose adicional',
    });
  });

  it('mantém os limiares do ANY: 300 mg desde o 2º choque, 150 mg desde o 4º', () => {
    expect(selectGuide(shocks(started(), 1)).id).toBe('cpr-prepare-shock');
    expect(selectGuide(shocks(started(), 2)).id).toBe('amiodarone-300');
    const after300 = run(
      [{ type: 'register-medication', at: s(100), medication: 'amiodarona-300' }],
      shocks(started(), 3),
    );
    expect(selectGuide(after300).id).toBe('cpr-prepare-shock');
    expect(selectGuide(shocks(after300, 1, 110)).id).toBe('amiodarone-150');
    const after150 = run(
      [{ type: 'register-medication', at: s(200), medication: 'amiodarona-150' }],
      shocks(after300, 2, 110),
    );
    expect(selectGuide(after150).id).toBe('cpr-prepare-shock');
  });

  it('5 choques sem a 1ª dose: continua sugerindo 300 mg', () => {
    expect(selectGuide(shocks(started(), 5)).id).toBe('amiodarone-300');
  });

  it('ritmo não chocável nunca sugere amiodarona', () => {
    expect(selectGuide(shocks(started('nonshockable'), 5))).toEqual({
      id: 'cpr',
      kind: 'action',
      text: GUIDE_TEXT.cpr,
      detail: 'Epinefrina a cada 4 min',
    });
  });

  it('o intervalo de epinefrina aparece no card', () => {
    const state = run([{ type: 'set-epinephrine-interval', seconds: 180 }], started());
    expect(selectGuide(state).detail).toBe('Epinefrina a cada 3 min');
  });
});

describe('epinefrina', () => {
  it('conta o intervalo desde a última dose e vence no intervalo escolhido', () => {
    const state = run(
      [{ type: 'register-medication', at: s(30), medication: 'epinefrina' }],
      started(),
    );
    expect(selectEpinephrineTimer(state, s(30))).toMatchObject({
      remainingSeconds: 240,
      due: false,
      progress: 0,
      dueAt: s(270),
    });
    expect(selectEpinephrineTimer(state, s(269.9))).toMatchObject({
      remainingSeconds: 1,
      due: false,
    });
    expect(selectEpinephrineTimer(state, s(270))).toMatchObject({ remainingSeconds: 0, due: true });
    expect(selectEpinephrineTimer(state, s(400))?.progress).toBe(1);
  });

  it('não tem timer antes da 1ª dose', () => {
    expect(selectEpinephrineTimer(started(), s(100))).toBeNull();
  });
});

describe('lembretes (no máximo 2)', () => {
  it('não chocável: epinefrina e acesso no começo', () => {
    expect(selectNudges(started('nonshockable'), s(10))).toEqual([
      { id: 'epinephrine', text: NUDGE_TEXT.epinephrine, urgent: false },
      { id: 'iv-access', text: NUDGE_TEXT.ivAccess, urgent: false },
    ]);
  });

  it('chocável: epinefrina só depois do 1º ciclo', () => {
    expect(selectNudges(started(), s(10)).map(({ id }) => id)).toEqual(['iv-access']);
    const afterCycle = run(
      [
        { type: 'complete-cycle', at: s(125) },
        { type: 'check-rhythm', at: s(130), result: 'shockable' },
      ],
      started(),
    );
    expect(selectNudges(afterCycle, s(131)).map(({ id }) => id)).toEqual(['epinephrine']);
  });

  it('epinefrina vencida vira lembrete urgente', () => {
    const state = run(
      [{ type: 'register-medication', at: s(10), medication: 'epinefrina' }],
      started(),
    );
    expect(selectNudges(state, s(249)).some(({ id }) => id === 'epinephrine')).toBe(false);
    expect(selectNudges(state, s(250))[0]).toEqual({
      id: 'epinephrine',
      text: NUDGE_TEXT.epinephrine,
      urgent: true,
    });
  });

  it('mostra no máximo 2, na ordem de prioridade', () => {
    let state = started('nonshockable');
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const at = s(5 + (cycle + 1) * 125);
      state = run(
        [
          { type: 'complete-cycle', at },
          { type: 'check-rhythm', at: at + 1000, result: 'nonshockable' },
        ],
        state,
      );
    }
    // Faltam epinefrina, via aérea e H's e T's: ficam os dois primeiros.
    expect(selectNudges(state, s(600)).map(({ id }) => id)).toEqual([
      'epinephrine',
      'advanced-airway',
    ]);
  });
});

describe('fração de compressão torácica', () => {
  it('desconta as pausas, inclusive a que está em curso', () => {
    const state = run(
      [
        { type: 'toggle-compression-pause', at: s(50) },
        { type: 'toggle-compression-pause', at: s(60) },
        { type: 'toggle-compression-pause', at: s(90) },
      ],
      started(),
    );
    // 100 s de parada, 10 s de pausa encerrada e 10 s da pausa em curso.
    expect(selectCompressionFraction(state, s(100))).toBe(80);
  });

  it('não calcula no primeiro segundo nem fora da parada', () => {
    expect(selectCompressionFraction(started(), s(0.5))).toBeNull();
    expect(selectCompressionFraction(INITIAL_ACLS_STATE, s(100))).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('mostra m:ss como o ANY', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(75)).toBe('1:15');
    expect(formatElapsed(3700)).toBe('61:40');
  });
});

describe('parseAclsState', () => {
  it('devolve o estado salvo quando o formato bate', () => {
    const state = run(
      [{ type: 'register-medication', at: s(30), medication: 'epinefrina' }],
      shocks(started(), 2),
    );
    expect(parseAclsState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('recusa formato estranho em vez de quebrar a tela', () => {
    expect(parseAclsState(null)).toBeNull();
    expect(parseAclsState({ ...started(), status: 'pausado' })).toBeNull();
    expect(parseAclsState({ ...started(), medicationCounts: { dipirona: 1 } })).toBeNull();
    expect(parseAclsState({ ...started(), epinephrineIntervalSeconds: 200 })).toBeNull();
    expect(parseAclsState({ ...started(), events: [{ at: 'ontem' }] })).toBeNull();
  });
});

/** Regra de linguagem do ADR-017 (mesma do registry.spec das calculadoras). */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Mantenha)\b/;

describe('linguagem do conteúdo', () => {
  it('sugere em vez de mandar', () => {
    const texts = [
      ...Object.values(GUIDE_TEXT).map((text) => (typeof text === 'string' ? text : text(4))),
      ...Object.values(NUDGE_TEXT),
      RHYTHM_CHECK_TEXT.hint,
      ...ACLS_MEDICATIONS.flatMap(({ name, hint }) => [name, hint]),
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente|AGORA/);
    }
  });

  it('oferece os intervalos de epinefrina do ANY', () => {
    expect(EPINEPHRINE_INTERVALS_SECONDS).toEqual([180, 240, 300]);
  });
});
