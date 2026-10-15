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
import { createAclsHistoryRecord } from '../../src/shared/clinical-tools/acls/history';
import {
  OVACE_SIGNS,
  OVACE_STEPS,
  OVACE_SUBTITLE,
  OVACE_TITLE,
} from '../../src/shared/clinical-tools/acls/ovace';
import { ACLS_REPORT_TITLE, buildAclsReport } from '../../src/shared/clinical-tools/acls/report';
import {
  HS_CAUSES,
  ROSC_CHECKLIST,
  TS_CAUSES,
  type ReversibleCause,
} from '../../src/shared/clinical-tools/acls/reversible-causes';
import { apply, newPairedSession, nextOperation, type PairedSession } from './acls-driver';
import {
  anyAcls,
  anyComponent,
  anyMetronomeDefaults,
  anyMetronomeSource,
  anyOvaceTexts,
  type AnyGuide,
  type AnyHsTs,
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
 * tempo); em instantes aleatórios entre os toques, o mesmo card "Agora", os
 * mesmos lembretes e a mesma FCT; no fim (CC-314), o mesmo relatório e o mesmo
 * registro no histórico.
 *
 * Diferenças deliberadas, e só elas:
 * - textos com imperativo viraram sugestão (`LANGUAGE_CHANGES`);
 * - o ANY registrava o ritmo duas vezes em cada checagem; o Copiloto, uma
 *   (revisão clínica, item 3.1);
 * - no relatório: título e rodapé do Copiloto, horário de relógio em cada
 *   linha do tempo e a linha "Medicações" (item 3.7).
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
  'Incentive a tosse': 'Incentivar a tosse',
  'Continue monitorando sinais de agravamento. Não interfira enquanto a tosse for efetiva.':
    'Continuar monitorando sinais de agravamento. Não interferir enquanto a tosse for efetiva.',
  '← Voltar': 'Voltar',
  'Repita até que o objeto seja expelido ou o paciente fique inconsciente':
    'Repetir até que o objeto seja expelido ou o paciente fique inconsciente',
  'Inicie compressões torácicas. Antes de cada ventilação, verifique se há objeto visível na boca.':
    'Iniciar compressões torácicas. Antes de cada ventilação, verificar se há objeto visível na boca.',
  'Acione o serviço médico de emergência': 'Acionar o serviço médico de emergência',
  'Iniciar Código de PCR': 'Iniciar código de PCR',
  'Continue monitorando o paciente': 'Continuar monitorando o paciente',
  'Mantenha observação até a chegada do serviço médico de emergência.':
    'Manter observação até a chegada do serviço médico de emergência.',
  'Trombose coronaria (IAM)': 'Trombose coronária (IAM)',
  'Avalie convulsão, solicite EEG se não segue comandos':
    'Avaliar convulsão, solicitar EEG se não segue comandos',
  'Evite hipoglicemia (menor que 70) e hiperglicemia (maior que 180)':
    'Evitar hipoglicemia (menor que 70 mg/dL) e hiperglicemia (maior que 180 mg/dL)',
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

/**
 * Relatório e registro do histórico do ANY para a parada encerrada, gerados
 * no instante do fim e com `previous` registros já salvos no aparelho.
 */
function anyReport(session: PairedSession, previous: number) {
  vi.setSystemTime(session.any.endTime ?? 0);
  let saved = '[]';
  const storage = {
    getItem: () => JSON.stringify(Array.from({ length: previous }, (_, index) => ({ num: index }))),
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const text = anyComponent({ state: session.any, totalElapsed: 0, storage }).generateReport();
  const records = JSON.parse(saved) as Record<string, unknown>[];
  return { text, record: records.at(-1) ?? {} };
}

/** Relatório do ANY sem título/rodapé dele e sem a linha do ritmo duplicado. */
function normalizeAnyReport(text: string, duplicates: ReadonlySet<number>): string {
  const lines = text.split('\n');
  const timeline = lines.indexOf('LINHA DO TEMPO:') + 1;
  return lines
    .filter((_, index) => !(index >= timeline && duplicates.has(index - timeline)))
    .map((line, index, all) =>
      index === 0 ? ACLS_REPORT_TITLE : index === all.length - 1 ? 'RODAPÉ' : line,
    )
    .join('\n');
}

/** Relatório do Copiloto sem o que ele acrescenta (horário de relógio e "Medicações"). */
function normalizeOurReport(text: string): string {
  const lines = text.split('\n');
  return lines
    .filter((line) => !line.startsWith('Medicações: '))
    .map((line, index, all) =>
      index === all.length - 1 ? 'RODAPÉ' : line.replace(/^( {2}\d+:\d{2}) \(\d{2}:\d{2}\)/, '$1'),
    )
    .join('\n');
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
    const reached = {
      amiodarone150: 0,
      urgentEpinephrine: 0,
      rosc: 0,
      death: 0,
      twoNudges: 0,
      reports: 0,
    };

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
      if (session.ours.status !== 'finished' || mismatches.length > 0) continue;

      // CC-314: relatório e registro do histórico iguais aos do ANY.
      const previous = random.integer(0, 4);
      const any = anyReport(session, previous);
      const report = buildAclsReport(session.ours, previous + 1) ?? '';
      const expectedReport = normalizeAnyReport(any.text, session.duplicateRhythmEvents);
      if (normalizeOurReport(report) !== expectedReport) {
        mismatches.push({ case: index, expected: expectedReport, received: report });
        continue;
      }
      const record = createAclsHistoryRecord(session.ours, { id: 'x', number: previous + 1 });
      const expectedRecord = {
        number: any.record.num,
        date: any.record.date,
        startTime: any.record.startTime,
        endTime: any.record.endTime,
        initialRhythm: any.record.rhythm,
        outcome: any.record.outcome,
        cycles: any.record.cycles,
        shocks: any.record.shocks,
        durationSeconds: any.record.duration,
      };
      const { id: _id, report: _report, ...receivedRecord } = record ?? { id: '', report: '' };
      if (JSON.stringify(receivedRecord) !== JSON.stringify(expectedRecord)) {
        mismatches.push({ case: index, expected: expectedRecord, received: receivedRecord });
      }
      reached.reports += 1;
    }

    expect(mismatches).toEqual([]);
    // O gerador chegou aos casos que importam (senão o teste passaria vazio).
    expect(reached.amiodarone150).toBeGreaterThan(0);
    expect(reached.urgentEpinephrine).toBeGreaterThan(0);
    expect(reached.twoNudges).toBeGreaterThan(0);
    expect(reached.rosc + reached.death).toBe(DIFFERENTIAL_CASES);
    expect(reached.reports).toBe(DIFFERENTIAL_CASES);
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

const ANY_LINK: Record<string, ReversibleCause['link']> = {
  '/airway': 'via-aerea',
  '/tox': 'toxicologia',
};

function expectedCauses(causes: readonly AnyHsTs[]) {
  return causes.map(({ name, action, link }) => ({
    name: changed(name),
    action: changed(action),
    link: link ? ANY_LINK[link.path] : undefined,
  }));
}

describe('conteúdo do pós-parada igual ao do ANY (CC-314)', () => {
  const any = anyAcls();

  it("os 10 cards de H's e T's, com os links para Via aérea e Toxicologia", () => {
    const ours = (causes: readonly ReversibleCause[]) =>
      causes.map(({ name, action, link }) => ({ name, action, link }));
    expect(ours(HS_CAUSES)).toEqual(expectedCauses(any.HS_CAUSES));
    expect(ours(TS_CAUSES)).toEqual(expectedCauses(any.TS_CAUSES));
    expect(HS_CAUSES.length + TS_CAUSES.length).toBe(10);
  });

  it('os 10 itens do checklist pós-RCE, na mesma ordem', () => {
    expect(ROSC_CHECKLIST.map(({ text }) => text)).toEqual(any.ROSC_CHECKLIST.map(changed));
  });

  it('os sinais e todos os textos do roteiro de OVACE', () => {
    expect(OVACE_SIGNS).toEqual(any.OVACE_SIGNS);
    const ours = new Set<string>([OVACE_TITLE, OVACE_SUBTITLE]);
    for (const step of Object.values(OVACE_STEPS)) {
      for (const block of step.blocks) {
        for (const text of [block.label, block.title, block.text]) if (text) ours.add(text);
      }
      if (step.note) ours.add(step.note);
      for (const option of step.options) ours.add(option.label);
    }
    expect([...ours].sort()).toEqual([...new Set(anyOvaceTexts().map(changed))].sort());
  });
});
