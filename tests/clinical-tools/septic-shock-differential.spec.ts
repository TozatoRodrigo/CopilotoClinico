import { describe, expect, it } from 'vitest';
import { calcVNERi, getQuadrant, getVNERiZone } from '../any-reference/calculations';
import { normalizeSearchText } from '../../src/shared/clinical-tools/catalog';
import {
  describeLactate,
  LACTATE_RANGES,
  readLactate,
  type LactateUnit,
} from '../../src/shared/clinical-tools/shock/lactate';
import {
  classifyPerfusion,
  PERFUSION_INPUTS,
  PERFUSION_QUADRANTS,
  type PerfusionQuadrantId,
} from '../../src/shared/clinical-tools/shock/perfusion-quadrant';
import {
  computeSepticProfile,
  describeSepticEvent,
  INITIAL_SEPTIC_STATE,
  septicShockReducer,
  type SepticShockAction,
  type SepticShockState,
} from '../../src/shared/clinical-tools/shock/septic-roteiro';
import {
  adjustNorepinephrineDose,
  capillaryRefillResult,
  CAPILLARY_REFILL,
  PROFILE_NOT_RECOMMENDED,
  PULSE_PRESSURE,
  pulsePressureResult,
  SEPTIC_INFUSION_LINKS,
  tecReevaluationTone,
  VASOPRESSOR,
  type ProfileNotRecommendedId,
  type ProfileSuggestionId,
  type SepticStep,
  type YesNo,
} from '../../src/shared/clinical-tools/shock/septic-shock';
import {
  computeVneri,
  VNERI_INPUTS,
  vneriConduct,
  vneriZone,
  type VneriZoneId,
} from '../../src/shared/clinical-tools/shock/vneri';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';
import {
  anyShock,
  applyAny,
  buttonWithText,
  click,
  componentsNamed,
  findAll,
  renderShockPath,
  type AnyShockState,
  type HeadlessElement,
  type ShockPathRender,
} from './shock-path-harness';

/**
 * CC-316 — o roteiro do choque séptico dá o mesmo resultado do ShockPath
 * congelado do ANY (tests/any-reference/ShockPath.tsx, rodado pelo
 * shock-path-harness) em 1.000 entradas aleatórias com semente fixa por
 * conta, e nas bordas de cada limiar.
 *
 * Compara-se: o número, o nome da faixa, o tom (cores do ANY pela tabela do
 * ADR-017), qual conduta aparece (pelo texto exato do ANY → id do motor), o
 * texto de cada registro da linha do tempo e para onde o roteiro vai. O texto
 * das condutas não entra: passou pela regra de linguagem e vai para a revisão
 * clínica (CC-310).
 */

const SEED = 20261015;

/** O ANY escreve ScvO2/ScvO₂; o Copiloto, SvcO2. Fora isso, sem acento e sem caixa. */
function norm(text: string): string {
  return normalizeSearchText(text.replace(/ScvO(₂|2)/g, 'SvcO2').replace(/\.$/, ''));
}

// ---- Cores do ANY → tom do motor (ADR-017, "Cores") ----

/** Bolinhas do perfil e cartões de resultado. */
const ANY_FINDING_TONE: Record<string, ResultTone> = {
  '#FF6B6B': 'critical',
  '#66BB6A': 'neutral',
  '#FFD740': 'attention',
  '#A0A0A0': 'neutral',
};

/**
 * Zonas do VNERi (`getVNERiZone`). O laranja #FF9800 é atenção; o azul do
 * tônus preservado também, porque a barra do próprio ANY pinta essa zona de
 * amarelo e a mortalidade volta a subir (revisão clínica).
 */
const ANY_VNERI_TONE: Record<string, ResultTone> = {
  '#F44336': 'critical',
  '#FF9800': 'attention',
  '#4CAF50': 'neutral',
  '#2196F3': 'attention',
};

/** Quadrantes (`getQuadrant`). O azul da hipóxia citopática é cinza na grade do ANY: neutro. */
const ANY_QUADRANT_TONE: Record<string, ResultTone> = {
  '#F44336': 'critical',
  '#FF9800': 'attention',
  '#FFC107': 'attention',
  '#2196F3': 'neutral',
};

const ANY_QUADRANT_ID: Record<string, PerfusionQuadrantId> = {
  lowDC: 'baixo-debito',
  anemic: 'disoxia-anemica',
  micro: 'microcirculacao-inadequada',
  cytopathic: 'hipoxia-citopatica',
};

/** Texto exato de conduta do VNERi no ANY → zona do texto no motor. */
const ANY_VNERI_CONDUCT_ZONE = new Map<string, VneriZoneId>([
  [anyShock.getVneriCondutaText(1), 'hiporresponsividade-grave'],
  [anyShock.getVneriCondutaText(5), 'resposta-parcial'],
  [anyShock.getVneriCondutaText(8), 'resposta-adequada'],
  [anyShock.getVneriCondutaText(12), 'tonus-preservado'],
]);

/** Condutas do perfil do ANY (texto exato) → id no motor. */
const ANY_SUGGESTION_ID: Record<string, ProfileSuggestionId> = {
  'Reavaliar TEC a cada 1 hora por 6 horas': 'reavaliarTec',
  'Titular noradrenalina para PAD ≥ 50 mmHg (Bertrand et al. 2025)': 'titularNoradrenalina',
  'Considere vasopressina 0,01-0,04 UI/min ou hidrocortisona 200 mg/dia (Goury et al. 2025)':
    'adjuvante',
  'Considere dobutamina 5-20 mcg/kg/min para disfunção de VE': 'dobutaminaVe',
  'Considere inotrópico para baixo débito cardíaco (Ltaief et al. 2021)': 'inotropicoBaixoDebito',
  'Checar hemoglobina e SaO2. Considere transfusão se Hb < 7 g/dL': 'hemoglobina',
  'Considere teste de PAM 80-85 mmHg por 1 hora (hipertenso crônico)': 'testePam',
  'Manter PAM alvo 80-85 mmHg (teste positivo)': 'manterPam',
  'Manter dobutamina (teste positivo)': 'manterDobutamina',
  'Monitorização clínica. Reavaliar TEC a cada 1 hora.': 'monitorizacao',
};

const ANY_NOT_RECOMMENDED_ID: Record<string, ProfileNotRecommendedId> = {
  'Evitar fluidos liberais sem avaliação de responsividade (Hernandez et al. 2025)':
    'fluidosLiberais',
  'Não administrar mais fluidos em paciente não responsivo a volume': 'maisFluidos',
  'Não escalar NE isoladamente em hiporresponsividade grave (Goury et al. 2025)': 'escalarNe',
};

const ANY_SCREEN: Record<string, SepticStep> = {
  step1: 'reconhecimento',
  step2: 'fluidos',
  step3: 'vasopressor',
  step4: 'perfusao',
  step5: 'perfil',
};

// ---- Casos aleatórios: os mesmos números nos dois lados ----

interface ShockCase {
  tec: number | null;
  lactate: { value: number; unit: LactateUnit } | null;
  pp: number | null;
  bolusTotal: 0 | 500 | 1000;
  fluidResp: YesNo | null;
  pad: number | null;
  fc: number | null;
  doseNE: number | null;
  echo: { ve: boolean; vd: boolean; outra: boolean };
  svco2: number | null;
  gapCO2: number | null;
  hta: YesNo | null;
  mapTest: YesNo | null;
  dobutamineTest: YesNo | null;
}

function randomCase(random: SeededRandom): ShockCase {
  const maybe = <T>(make: () => T): T | null => (random.next() < 0.25 ? null : make());
  const yesNo = (): YesNo | null => random.pick([null, 'sim', 'nao'] as const);
  const unit = random.pick(['mmol/L', 'mg/dL'] as const);
  const lactateRange = LACTATE_RANGES[unit];
  return {
    tec: maybe(() => random.onGrid(0.1, 20, 0.1)),
    lactate: maybe(() => ({
      value: random.onGrid(lactateRange.min, lactateRange.max, 0.1),
      unit,
    })),
    pp: maybe(() => random.onGrid(5, 200, 1)),
    bolusTotal: random.pick([0, 500, 1000] as const),
    fluidResp: yesNo(),
    pad: maybe(() => random.onGrid(VNERI_INPUTS.pad.min, VNERI_INPUTS.pad.max, 1)),
    fc: maybe(() => random.onGrid(VNERI_INPUTS.fc.min, VNERI_INPUTS.fc.max, 1)),
    doseNE: maybe(() => random.onGrid(0.01, 3, 0.01)),
    echo: { ve: random.next() < 0.3, vd: random.next() < 0.3, outra: random.next() < 0.3 },
    svco2: maybe(() => random.onGrid(1, 100, 0.1)),
    gapCO2: maybe(() => random.onGrid(0, 40, 0.1)),
    hta: yesNo(),
    mapTest: yesNo(),
    dobutamineTest: yesNo(),
  };
}

/** O lactato como o ANY guarda (mmol/L; mg/dL ÷ 9 no `handleLactatoChange`). */
function anyLactate(lactate: ShockCase['lactate']): number | null {
  if (!lactate) return null;
  return lactate.unit === 'mmol/L' ? lactate.value : lactate.value / 9;
}

function anyState(shockCase: ShockCase, screen: string): AnyShockState {
  const { svco2, gapCO2 } = shockCase;
  return {
    screen,
    tec: shockCase.tec,
    lactato: anyLactate(shockCase.lactate),
    lactatoUnit: shockCase.lactate?.unit === 'mg/dL' ? 'mgdl' : 'mmol',
    pp: shockCase.pp,
    bolusTotal: shockCase.bolusTotal,
    fluidResp: shockCase.fluidResp,
    pad: shockCase.pad,
    fc: shockCase.fc,
    doseNE: shockCase.doseNE,
    ecoVE: shockCase.echo.ve,
    ecoVD: shockCase.echo.vd,
    ecoOutra: shockCase.echo.outra,
    scvo2: svco2,
    gapCO2,
    // No ANY o quadrante só existe depois de "Interpretar"; aqui ele é ao vivo.
    quadrante: svco2 !== null && gapCO2 !== null ? getQuadrant(gapCO2, svco2) : null,
    htaCronica: shockCase.hta,
    testePAM: shockCase.mapTest,
    testeDobu: shockCase.dobutamineTest,
  };
}

/** Como o médico digitaria: vírgula decimal. */
function typed(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function myState(shockCase: ShockCase, step: SepticStep): SepticShockState {
  return {
    ...INITIAL_SEPTIC_STATE,
    step,
    lactateUnit: shockCase.lactate?.unit ?? 'mmol/L',
    tec: shockCase.tec === null ? null : { source: 'digitado', value: shockCase.tec },
    tecRaw: typed(shockCase.tec),
    fields: {
      lactate: typed(shockCase.lactate?.value ?? null),
      pp: typed(shockCase.pp),
      pas: '',
      pad: typed(shockCase.pad),
      fc: typed(shockCase.fc),
      doseNE: typed(shockCase.doseNE),
      svco2: typed(shockCase.svco2),
      gapCO2: typed(shockCase.gapCO2),
    },
    bolusTotalMl: shockCase.bolusTotal,
    fluidResponsive: shockCase.fluidResp,
    echo: {
      've-hipocinetico': shockCase.echo.ve,
      'vd-dilatado': shockCase.echo.vd,
      'outra-disfuncao': shockCase.echo.outra,
    },
    chronicHypertension: shockCase.hta,
    mapTest: shockCase.mapTest,
    dobutamineTest: shockCase.dobutamineTest,
  };
}

function cases(seed: number): ShockCase[] {
  const random = seededRandom(seed);
  return Array.from({ length: DIFFERENTIAL_CASES }, () => randomCase(random));
}

function interventionTexts(actions: ShockPathRender['dispatched']): string[] {
  return actions
    .filter((action) => action.type === 'ADD_INTERVENTION')
    .map((action) => (action.intervention as { text: string }).text);
}

/** Uma ação no ANY (o toque) e a ação equivalente no motor: mesmos registros, mesmo destino. */
function compareTransition(
  shockCase: ShockCase,
  screen: string,
  touch: (render: ShockPathRender) => ShockPathRender['dispatched'],
  action: SepticShockAction,
  label: string,
) {
  const before = anyState(shockCase, screen);
  const render = renderShockPath(before);
  const actions = touch(render);
  const after = applyAny(before, actions);

  const mine = myState(shockCase, ANY_SCREEN[screen] ?? 'reconhecimento');
  const next = septicShockReducer(mine, action);
  const expected = {
    step: ANY_SCREEN[String(after.screen)],
    events: interventionTexts(actions).map(norm),
    bolus: after.bolusTotal,
  };
  const received = {
    step: next.step,
    events: next.events.slice(mine.events.length).map(describeSepticEvent).map(norm),
    bolus: next.bolusTotalMl,
  };
  return JSON.stringify(expected) === JSON.stringify(received)
    ? null
    : { case: label, expected, received };
}

function expectNoMismatch(mismatches: readonly unknown[]) {
  expect(mismatches.filter(Boolean).slice(0, 5)).toEqual([]);
}

// ---- VNERi ----

describe('VNERi contra o ANY (calcVNERi, getVNERiZone, texto de conduta)', () => {
  function compareVneri(value: number, label: string) {
    const zone = getVNERiZone(value);
    const expected = {
      zone: norm(zone.label),
      tone: ANY_VNERI_TONE[zone.color],
      mortality: zone.mortality,
      conduct: ANY_VNERI_CONDUCT_ZONE.get(anyShock.getVneriCondutaText(value)),
    };
    const received = {
      zone: norm(vneriZone(value).label),
      tone: vneriZone(value).tone,
      mortality: vneriZone(value).mortality,
      conduct: vneriConduct(value).zone,
    };
    return JSON.stringify(expected) === JSON.stringify(received)
      ? null
      : { case: label, expected, received };
  }

  it(`dá o mesmo valor, zona, tom, mortalidade e conduta em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED);
    const mismatches = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const pad = random.onGrid(VNERI_INPUTS.pad.min, VNERI_INPUTS.pad.max, 1);
      const fc = random.onGrid(VNERI_INPUTS.fc.min, VNERI_INPUTS.fc.max, 1);
      const dose = random.onGrid(0.01, 3, 0.01);
      const value = computeVneri(pad, dose, fc);
      expect(value, `caso ${index}`).toBe(calcVNERi(pad, dose, fc));
      mismatches.push(compareVneri(value, `caso ${index}: ${pad}/${dose}/${fc}`));
    }
    expectNoMismatch(mismatches);
  });

  it('dá o mesmo resultado nos cortes 2,6, 6,7 e 10,8', () => {
    const edges = [0, 2.59, 2.6, 2.61, 6.69, 6.7, 6.71, 10.79, 10.8, 10.81, 15, 40];
    expectNoMismatch(edges.map((value) => compareVneri(value, String(value))));
  });

  it('reproduz o 10,8 exato que o ANY mostra como "tônus preservado" com o texto da resposta adequada', () => {
    // PAD 54, NE 0,05, FC 100 dá 10,8 exato (revisão clínica).
    const value = computeVneri(54, 0.05, 100);
    expect(value).toBe(10.8);
    expect(vneriZone(value).id).toBe('tonus-preservado');
    expect(vneriConduct(value).zone).toBe('resposta-adequada');
    expect(compareVneri(value, '54/0,05/100')).toBeNull();
  });
});

// ---- Quadrante gap CO2 × SvcO2 ----

describe('quadrante gap CO2 × SvcO2 contra o ANY (getQuadrant e grade)', () => {
  function compareQuadrant(svco2: number, gapCO2: number) {
    const any = getQuadrant(gapCO2, svco2);
    const mine = classifyPerfusion(svco2, gapCO2);
    const expected = {
      id: ANY_QUADRANT_ID[any.id],
      label: norm(any.label),
      tone: ANY_QUADRANT_TONE[any.color],
    };
    const received = { id: mine.id, label: norm(mine.label), tone: mine.tone };
    return JSON.stringify(expected) === JSON.stringify(received)
      ? null
      : { case: `${svco2}/${gapCO2}`, expected, received };
  }

  it(`dá o mesmo quadrante e tom em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 1);
    const mismatches = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      mismatches.push(
        compareQuadrant(
          random.onGrid(PERFUSION_INPUTS.svco2.min, PERFUSION_INPUTS.svco2.max, 0.1),
          random.onGrid(PERFUSION_INPUTS.gapCO2.min, PERFUSION_INPUTS.gapCO2.max, 0.1),
        ),
      );
    }
    expectNoMismatch(mismatches);
  });

  it('dá o mesmo quadrante em todas as combinações das bordas (SvcO2 70, gap 6)', () => {
    const mismatches = [];
    for (const svco2 of [1, 69.9, 70, 70.1, 100]) {
      for (const gapCO2 of [0, 5.9, 6, 6.1, 40]) mismatches.push(compareQuadrant(svco2, gapCO2));
    }
    expectNoMismatch(mismatches);
  });

  it('tem a grade do ANY: mesma ordem, títulos e critérios', () => {
    expect(PERFUSION_QUADRANTS.map(({ id }) => id)).toEqual(
      anyShock.QUADRANT_CELLS.map(({ id }) => ANY_QUADRANT_ID[id]),
    );
    PERFUSION_QUADRANTS.forEach((quadrant, index) => {
      const cell = anyShock.QUADRANT_CELLS[index];
      expect(norm(quadrant.cell.title)).toBe(norm(cell?.title ?? ''));
      expect(norm(quadrant.cell.criteria)).toBe(norm(cell?.text.split('\n')[0] ?? ''));
    });
  });

  it('a conduta de cada quadrante é a do ANY passada para sugestão', () => {
    // Mesmos números e referências; só a forma do verbo muda.
    for (const quadrant of PERFUSION_QUADRANTS) {
      const anyId = Object.keys(ANY_QUADRANT_ID).find((id) => ANY_QUADRANT_ID[id] === quadrant.id);
      const anyText = anyShock.getQuadrantConductText(anyId ?? '');
      const numbers = (text: string) => text.match(/\d+(,\d+)?/g) ?? [];
      expect(numbers(quadrant.conduct), quadrant.id).toEqual(numbers(anyText));
    }
  });
});

// ---- Lactato ----

describe('lactato mg/dL ↔ mmol/L contra o ANY', () => {
  it(`guarda o mesmo mmol/L e mostra o mesmo texto em ${DIFFERENTIAL_CASES} valores`, () => {
    const random = seededRandom(SEED + 2);
    const mismatches = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const unit = random.pick(['mmol/L', 'mg/dL'] as const);
      const { min, max } = LACTATE_RANGES[unit];
      const value = random.onGrid(min, max, 0.1);
      const anyUnit = unit === 'mmol/L' ? 'mmol' : 'mgdl';

      // O campo do ANY é type="number": chega com ponto.
      const step1 = renderShockPath({ screen: 'step1', lactatoUnit: anyUnit });
      const input = findAll(
        step1.tree,
        (element) => element.type === 'input' && element.props.placeholder === '2.0',
      )[0] as HeadlessElement;
      (input.props.onChange as (event: unknown) => void)({ target: { value: String(value) } });
      const stored = step1.dispatched.find((action) => action.type === 'SET_LACTATO')?.value;
      const display = renderShockPath({ screen: 'step1', lactato: stored, lactatoUnit: anyUnit })
        .memos[0];

      const mine = readLactate(typed(value), unit);
      const received = mine.ok
        ? { mmol: mine.value, display: describeLactate(mine.value, unit) }
        : mine;
      const expected = { mmol: stored, display };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: `${value} ${unit}`, expected, received });
      }
    }
    expectNoMismatch(mismatches);
  });
});

// ---- Passo 1: TEC ----

describe('TEC contra o ANY (passo 1 e reavaliações)', () => {
  it(`mostra o mesmo resultado do TEC em ${DIFFERENTIAL_CASES} valores e nas bordas`, () => {
    const random = seededRandom(SEED + 3);
    const values = [
      0.1,
      2.9,
      3,
      3.1,
      20,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(0.1, 20, 0.1)),
    ];
    const mismatches = values.map((tec) => {
      const titles = componentsNamed(renderShockPath({ screen: 'step1', tec }), 'ResultCard').map(
        ({ props }) => norm(String(props.title)),
      );
      const result = capillaryRefillResult(tec);
      return JSON.stringify(titles) === JSON.stringify([norm(result.title)]) &&
        (tec > 3 ? 'critical' : 'neutral') === result.tone
        ? null
        : { case: tec, expected: titles, received: result };
    });
    expectNoMismatch(mismatches);
  });

  it('a escolha "normal" e "anormal" vira 3 s e 4 s, como no ANY', () => {
    for (const mode of ['normal', 'anormal'] as const) {
      const render = renderShockPath({ screen: 'step1' });
      const toggle = componentsNamed(render, 'Toggle').find(({ props }) =>
        (props.options as { value: string }[]).some(({ value }) => value === 'anormal'),
      );
      (toggle?.props.onChange as (value: string) => void)(mode);
      const any = applyAny({ screen: 'step1' }, render.dispatched);
      const mine = septicShockReducer(INITIAL_SEPTIC_STATE, { type: 'tec-por-faixa', mode });
      expect(mine.tec?.value).toBe(any.tec);
      expect(mine.tecMode).toBe(any.tecMode);
    }
  });

  it(`pinta cada reavaliação com o mesmo tom em ${DIFFERENTIAL_CASES} valores e nas bordas`, () => {
    const random = seededRandom(SEED + 4);
    const dotTone: Record<string, ResultTone> = {
      'bg-success': 'neutral',
      'bg-warning': 'attention',
      'bg-danger': 'critical',
    };
    const values = [
      3,
      3.01,
      4.5,
      4.51,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(0.1, 20, 0.1)),
    ];
    const mismatches = values.map((value) => {
      const tree = anyShock.TecReavalSection({
        history: [{ value, time: '10:00' }],
        onSave: () => {},
      });
      const dot = findAll(tree, (element) =>
        String(element.props.className ?? '').includes('rounded-full'),
      )[0];
      const color = Object.keys(dotTone).find((name) =>
        String(dot?.props.className ?? '').includes(name),
      );
      const expected = color ? dotTone[color] : undefined;
      return expected === tecReevaluationTone(value)
        ? null
        : { case: value, expected, received: tecReevaluationTone(value) };
    });
    expectNoMismatch(mismatches);
  });
});

// ---- Passos 2 e 3: PP, PAD e dose ----

describe('pressão de pulso, PAD e dose de noradrenalina contra o ANY', () => {
  it(`classifica a PP como o ANY em ${DIFFERENTIAL_CASES} valores e nas bordas`, () => {
    const random = seededRandom(SEED + 5);
    const { min, max } = PULSE_PRESSURE.inputs.pp;
    const values = [
      min,
      39,
      40,
      41,
      max,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(min, max, 1)),
    ];
    const mismatches = values.map((pp) => {
      const titles = componentsNamed(renderShockPath({ screen: 'step2', pp }), 'ResultCard').map(
        ({ props }) => norm(String(props.title)),
      );
      return titles[0] === norm(pulsePressureResult(pp).title)
        ? null
        : { case: pp, expected: titles, received: pulsePressureResult(pp).title };
    });
    expectNoMismatch(mismatches);
  });

  it(`alerta vasoplegia nas mesmas PAD em ${DIFFERENTIAL_CASES} valores e nas bordas`, () => {
    const random = seededRandom(SEED + 6);
    const { min, max } = VASOPRESSOR.inputs.pad;
    const values = [
      min,
      49,
      50,
      51,
      max,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(min, max, 1)),
    ];
    const mismatches = values.map((pad) => {
      const alerts = componentsNamed(renderShockPath({ screen: 'step3', pad }), 'AlertCard').map(
        ({ props }) => norm(String(props.title)),
      );
      // O ANY escreve "Vasopledia"; o porte corrigiu a grafia.
      const anyAlert = alerts.includes(norm('Vasopledia provável'));
      const mine = pad < VASOPRESSOR.padLowerThan;
      return anyAlert === mine ? null : { case: pad, expected: anyAlert, received: mine };
    });
    expectNoMismatch(mismatches);
  });

  it(`ajusta a dose nos botões − e + como o ANY em ${DIFFERENTIAL_CASES} doses`, () => {
    const random = seededRandom(SEED + 7);
    const doses: (number | null)[] = [
      null,
      0.01,
      0.04,
      2.98,
      3,
      5,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(0.01, 3, 0.01)),
    ];
    const mismatches = [];
    for (const doseNE of doses) {
      for (const [label, delta] of [
        ['-', -VASOPRESSOR.doseStep],
        ['+', VASOPRESSOR.doseStep],
      ] as const) {
        const render = renderShockPath({ screen: 'step3', doseNE });
        const [action] = click(render, buttonWithText(render, label));
        const received = adjustNorepinephrineDose(doseNE, delta);
        const viaReducer = septicShockReducer(
          {
            ...INITIAL_SEPTIC_STATE,
            fields: { ...INITIAL_SEPTIC_STATE.fields, doseNE: typed(doseNE) },
          },
          { type: 'ajustar-noradrenalina', delta },
        ).fields.doseNE;
        if (action?.value !== received || typed(received) !== viaReducer) {
          mismatches.push({ case: `${doseNE} ${label}`, expected: action?.value, received });
        }
      }
    }
    expectNoMismatch(mismatches);
  });
});

// ---- Navegação e linha do tempo ----

describe('roteiro e linha do tempo contra o ANY', () => {
  const at = Date.UTC(2026, 9, 15, 13, 0);

  it(`"Iniciar Tier 1" registra o mesmo reconhecimento em ${DIFFERENTIAL_CASES} casos`, () => {
    const mismatches = cases(SEED + 8)
      .map((shockCase) => ({
        ...shockCase,
        tec: (shockCase.tec ?? 4) > 3 ? (shockCase.tec ?? 4) : 4,
      }))
      .map((shockCase, index) =>
        compareTransition(
          shockCase,
          'step1',
          (render) => click(render, buttonWithText(render, CAPILLARY_REFILL.startTier1)),
          { type: 'iniciar-tier-1', at },
          `caso ${index}`,
        ),
      );
    expectNoMismatch(mismatches);
  });

  it(`"Passo 3", "Passo 4" e "Resumo" registram o passo como o ANY em ${DIFFERENTIAL_CASES} casos`, () => {
    const mismatches = cases(SEED + 9).flatMap((shockCase, index) =>
      (
        [
          ['step2', 'Passo 3'],
          ['step3', 'Passo 4'],
          ['step4', 'Resumo'],
        ] as const
      ).map(([screen, button]) =>
        compareTransition(
          shockCase,
          screen,
          (render) => click(render, buttonWithText(render, button)),
          { type: 'avancar', at },
          `caso ${index} ${screen}`,
        ),
      ),
    );
    // O ANY grava "Perfusão: " até sem SvcO2 e gap; o porte só grava com algum dado.
    const deliberate = (mismatch: (typeof mismatches)[number]) =>
      mismatch !== null &&
      JSON.stringify(mismatch.expected.events) === JSON.stringify([norm('Perfusão: ')]) &&
      mismatch.received.events.length === 0;
    expectNoMismatch(mismatches.filter((mismatch) => !deliberate(mismatch)));
  });

  it('"TEC normalizou?" segue o mesmo caminho do ANY depois dos fluidos e do vasopressor', () => {
    const mismatches = cases(SEED + 10).flatMap((shockCase, index) => {
      const fluids = { ...shockCase, pp: 30, fluidResp: 'sim' as const };
      return [
        ...([true, false] as const).map((normalized) =>
          compareTransition(
            fluids,
            'step2',
            (render) => click(render, buttonWithText(render, normalized ? 'Sim' : 'Não')),
            { type: 'tec-apos-fluidos', normalized, at },
            `caso ${index} fluidos ${normalized}`,
          ),
        ),
        ...([true, false] as const).map((normalized) =>
          compareTransition(
            shockCase,
            'step3',
            (render) => click(render, buttonWithText(render, normalized ? 'Sim' : 'Não')),
            { type: 'tec-apos-vasopressor', normalized, at },
            `caso ${index} vasopressor ${normalized}`,
          ),
        ),
      ];
    });
    expectNoMismatch(mismatches);
  });

  it('"+ 500 mL" soma o bolus até 1000 mL, como o ANY', () => {
    for (const bolusTotal of [0, 500] as const) {
      const shockCase = { ...cases(SEED)[0]!, pp: 30, fluidResp: 'sim' as const, bolusTotal };
      expect(
        compareTransition(
          shockCase,
          'step2',
          (render) => click(render, buttonWithText(render, '+ 500 mL')),
          { type: 'adicionar-bolus', at },
          String(bolusTotal),
        ),
      ).toBeNull();
    }
    const full = myState({ ...cases(SEED)[0]!, bolusTotal: 1000 }, 'fluidos');
    expect(septicShockReducer(full, { type: 'adicionar-bolus', at })).toBe(full);
    expect(applyAny({ bolusTotal: 1000 }, [{ type: 'ADD_BOLUS' }]).bolusTotal).toBe(1000);
  });

  it('os testes de PAM e de dobutamina registram o mesmo texto', () => {
    for (const answer of ['sim', 'nao'] as const) {
      const shockCase = {
        ...cases(SEED)[1]!,
        hta: 'sim' as const,
        mapTest: null,
        dobutamineTest: null,
      };
      const toggles = (render: ShockPathRender) => componentsNamed(render, 'Toggle');
      // Passo 4 com hipertensão crônica: HTA, teste de PAM e teste de dobutamina, nessa ordem.
      expect(
        compareTransition(
          shockCase,
          'step4',
          (render) => {
            (toggles(render)[1]?.props.onChange as (value: string) => void)(answer);
            return render.dispatched;
          },
          { type: 'teste-pam', answer, at },
          `pam ${answer}`,
        ),
      ).toBeNull();
      expect(
        compareTransition(
          shockCase,
          'step4',
          (render) => {
            (toggles(render)[2]?.props.onChange as (value: string) => void)(answer);
            return render.dispatched;
          },
          { type: 'teste-dobutamina', answer, at },
          `dobutamina ${answer}`,
        ),
      ).toBeNull();
    }
  });

  it(`a reavaliação do TEC no perfil registra o mesmo texto e vira o TEC em vigor (${DIFFERENTIAL_CASES} valores)`, () => {
    const random = seededRandom(SEED + 11);
    const mismatches = Array.from({ length: DIFFERENTIAL_CASES }, (_, index) => {
      const value = random.onGrid(0.1, 20, 0.1);
      const shockCase = cases(SEED)[index % 10]!;
      return compareTransition(
        shockCase,
        'step5',
        (render) => {
          const form = findAll(render.tree, (element) => element.type === 'form')[0];
          (form?.props.onSubmit as (event: unknown) => void)({
            preventDefault() {},
            currentTarget: { querySelector: () => ({ value: String(value) }) },
          });
          return render.dispatched;
        },
        { type: 'reavaliar-tec', value, at },
        `caso ${index}: ${value}`,
      );
    });
    expectNoMismatch(mismatches);
  });

  it('diferença deliberada: a reavaliação feita no passo 1 também entra na linha do tempo', () => {
    // No ANY a reavaliação com TEC normal ia só para o histórico; o critério de
    // aceite do CC-316 pede cada reavaliação com horário na linha do tempo.
    const render = renderShockPath({ screen: 'step1', tec: 2 });
    const form = findAll(render.tree, (element) => element.type === 'form')[0];
    (form?.props.onSubmit as (event: unknown) => void)({
      preventDefault() {},
      currentTarget: { querySelector: () => ({ value: '2.5' }) },
    });
    expect(render.dispatched.map(({ type }) => type)).toEqual(['ADD_TEC_REEVAL']);
    const mine = septicShockReducer(INITIAL_SEPTIC_STATE, {
      type: 'reavaliar-tec',
      value: 2.5,
      at,
    });
    expect(mine.events.map(describeSepticEvent)).toEqual(['Reavaliação TEC: 2,5s']);
  });

  it('os atalhos de Infusões levam às mesmas drogas', () => {
    const step3 = renderShockPath({ screen: 'step3' });
    click(step3, buttonWithText(step3, 'Calculadora NE'));
    click(step3, buttonWithText(step3, 'Calculadora vasopressina'));
    const step5 = renderShockPath({ screen: 'step5' });
    for (const label of ['NE', 'Vasopressina', 'Dobutamina'])
      click(step5, buttonWithText(step5, label));
    const step4 = renderShockPath({ screen: 'step4' });
    click(step4, buttonWithText(step4, 'Calculadora dobutamina'));
    const drug = (path: string) => path.replace('/infusion?drug=', '');
    expect(step3.navigated.map(drug)).toEqual(SEPTIC_INFUSION_LINKS.vasopressor);
    expect(step4.navigated.map(drug)).toEqual(SEPTIC_INFUSION_LINKS.perfusao);
    expect(step5.navigated.map(drug)).toEqual(SEPTIC_INFUSION_LINKS.perfil);
  });
});

// ---- Passo 5: perfil ----

describe('perfil hemodinâmico contra o ANY', () => {
  function anyFindingTone(text: string, color: string): ResultTone | undefined {
    if (text.startsWith('VNERi')) return ANY_VNERI_TONE[color];
    if (text.startsWith('Quadrante')) return ANY_QUADRANT_TONE[color];
    return ANY_FINDING_TONE[color];
  }

  it(`dá o mesmo rótulo, achados, condutas e "não recomendado" em ${DIFFERENTIAL_CASES} casos`, () => {
    const mismatches = cases(SEED + 12).map((shockCase, index) => {
      const any = renderShockPath(anyState(shockCase, 'step5')).memos[2] as {
        label: string;
        achados: { text: string; color: string }[];
        condutas: string[];
        naoFazer: string[];
      };
      const mine = computeSepticProfile(myState(shockCase, 'perfil'));
      const expected = {
        label: any.label,
        findings: any.achados.map(({ text, color }) => [norm(text), anyFindingTone(text, color)]),
        suggestions: any.condutas.map((text) => ANY_SUGGESTION_ID[text] ?? `?${text}`),
        notRecommended: any.naoFazer.map((text) => ANY_NOT_RECOMMENDED_ID[text] ?? `?${text}`),
      };
      const received = {
        label: mine.label,
        findings: mine.findings.map(({ text, tone }) => [norm(text), tone]),
        suggestions: mine.suggestions.map(({ id }) => id),
        notRecommended: mine.notRecommended.map(({ id }) => id),
      };
      return JSON.stringify(expected) === JSON.stringify(received)
        ? null
        : { case: `caso ${index}`, expected, received };
    });
    expectNoMismatch(mismatches);
  });

  it('"não recomendado" tem o texto do ANY', () => {
    for (const [text, id] of Object.entries(ANY_NOT_RECOMMENDED_ID)) {
      expect(norm(PROFILE_NOT_RECOMMENDED[id])).toBe(norm(text));
    }
  });
});
