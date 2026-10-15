import { describe, expect, it } from 'vitest';
import { calcHACOR } from '../any-reference/calculations';
import * as anyVm from '../any-reference/vmData';
import type { CalculatorEvaluation } from '../../src/shared/clinical-tools/calculator';
import { validateNumber } from '../../src/shared/clinical-tools/ranges';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  ROX_INDEX,
  VENTILATION_CALCULATIONS,
} from '../../src/shared/clinical-tools/ventilation/calculations';
import {
  evaluateVentilation,
  formatReading,
  usualRangeWarning,
} from '../../src/shared/clinical-tools/ventilation/evaluate';
import {
  appendHacorReassessment,
  evaluateHacor,
  HACOR,
  hacorBand,
  hacorTrend,
  startHacorHistory,
} from '../../src/shared/clinical-tools/ventilation/hacor';
import type {
  VentilationCalculation,
  VentilationInput,
} from '../../src/shared/clinical-tools/ventilation/types';
import { hacorAnswersFor } from './hacor-options';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';
import { findAll, findByText, loadVmGuide, textContent, type VmNode } from './vm-guide-harness';

/**
 * CC-327 — as 14 contas, os 18 avisos de faixa e o HACOR do VM Guide dão o
 * mesmo que o ANY congelado (tests/any-reference/vmData.ts e VmGuide.tsx).
 *
 * Em cada conta, 1.000 entradas sorteadas dentro das faixas aceitas (semente
 * fixa) e os casos de borda das faixas são comparados em dois níveis:
 * - com a função do vmData: valor sem tolerância (mesma aritmética), nome da
 *   faixa e tom;
 * - com a própria página do ANY (o botão "Calcular" de cada calculadora):
 *   o texto do resultado, as linhas abaixo dele e o atalho para a via aérea.
 *
 * O texto da ação não entra: passou pela regra de linguagem do ADR-017 e vai
 * para a revisão clínica (CC-310). As diferenças de propósito estão no fim
 * do arquivo e em docs/ferramentas/revisao-clinica/ventilacao-mecanica.md.
 */

const SEED = 20261015;

/** ADR-017, "Cores": verde do ANY vira neutro, amarelo vira laranja (atenção), vermelho fica. */
const STATUS_TONE: Record<string, ResultTone> = {
  success: 'neutral',
  warning: 'attention',
  danger: 'critical',
};

interface Interpreted {
  status: string;
  text: string;
}

interface Case {
  inputs: Record<string, number>;
  choices: Record<string, string>;
}

interface VmPort {
  id: string;
  /** Calculadora interna da página do ANY. */
  component: string;
  /** Posições dos `useState` dos campos no ANY: id do campo ou da escolha. */
  state: readonly string[];
  /** Conta do vmData com os valores como o ANY os lia. `null` = o ANY não calcula. */
  anyValue: (inputs: Record<string, number>, choices: Record<string, string>) => number | null;
  anyInterpret?: (value: number) => Interpreted;
  /** Casos fixos nas bordas das faixas, além dos sorteados. */
  edges?: readonly Partial<Case>[];
}

/** No ANY a FiO₂ era fração; aqui é digitada em %. */
const PERCENT_FIO2 = new Set(['fio2', 'fio2Atual']);
const SEX_TO_ANY: Record<string, string> = { masculino: 'M', feminino: 'F' };

function value(inputs: Record<string, number>, id: string): number {
  const found = inputs[id];
  if (found === undefined) throw new Error(`Caso sem o campo ${id}`);
  return found;
}

/** O número como o ANY o recebia (FiO₂ em fração). */
function anyNumber(inputs: Record<string, number>, id: string): number {
  return PERCENT_FIO2.has(id) ? value(inputs, id) / 100 : value(inputs, id);
}

function anyText(id: string, testCase: Case): string {
  if (id === 'sexo') return SEX_TO_ANY[testCase.choices.sexo ?? ''] ?? 'M';
  if (testCase.inputs[id] === undefined) return '';
  return String(anyNumber(testCase.inputs, id));
}

/** O que o médico digitaria aqui: vírgula decimal. */
function typed(number: number): string {
  return String(number).replace('.', ',');
}

/** O ANY mostrava "0.53" com `toFixed`; a tela do Copiloto usa vírgula. */
function decimalComma(text: string): string {
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}

/** Rótulo da faixa no texto do ANY ("Elevada — considere …" → "elevada"). */
function bandName(text: string): string {
  return (text.split(' — ')[0] ?? text).trim().toLowerCase();
}

const PORTS: readonly VmPort[] = [
  {
    id: 'peso-predito',
    component: 'PesoIdealCalc',
    state: ['sexo', 'altura'],
    anyValue: (inputs, choices) =>
      anyVm.calcPesoIdeal(
        SEX_TO_ANY[choices.sexo ?? ''] === 'F' ? 'F' : 'M',
        value(inputs, 'altura'),
      ),
    edges: [
      { inputs: { altura: 152.4 }, choices: { sexo: 'masculino' } },
      { inputs: { altura: 120 }, choices: { sexo: 'feminino' } },
      { inputs: { altura: 250 }, choices: { sexo: 'masculino' } },
    ],
  },
  {
    id: 'rva',
    component: 'RvaCalc',
    state: ['ppico', 'ppausa', 'fluxo'],
    anyValue: (v) => anyVm.calcRva(value(v, 'ppico'), value(v, 'ppausa'), value(v, 'fluxo')),
    anyInterpret: anyVm.interpretRva,
    edges: [
      { inputs: { ppico: 30, ppausa: 20, fluxo: 60 } }, // 10: borda Normal/Elevada
      { inputs: { ppico: 40, ppausa: 20, fluxo: 60 } }, // 20: borda Elevada/Muito elevada
      { inputs: { ppico: 20, ppausa: 20, fluxo: 60 } }, // 0
    ],
  },
  {
    id: 'cst',
    component: 'CstCalc',
    state: ['vc', 'ppausa', 'peep'],
    anyValue: (v) => anyVm.calcCst(value(v, 'vc'), value(v, 'ppausa'), value(v, 'peep')),
    anyInterpret: anyVm.interpretCst,
    edges: [
      { inputs: { vc: 500, ppausa: 15, peep: 5 } }, // 50
      { inputs: { vc: 300, ppausa: 15, peep: 5 } }, // 30
      { inputs: { vc: 2000, ppausa: 1, peep: 0 } },
    ],
  },
  {
    id: 'driving-pressure',
    component: 'DPCalc',
    state: ['ppausa', 'peep'],
    anyValue: (v) => anyVm.calcDP(value(v, 'ppausa'), value(v, 'peep')),
    anyInterpret: anyVm.interpretDP,
    edges: [
      { inputs: { ppausa: 20, peep: 10 } }, // 10
      { inputs: { ppausa: 20, peep: 5 } }, // 15
      { inputs: { ppausa: 21, peep: 5 } }, // 16
    ],
  },
  {
    id: 'pf',
    component: 'PFCalc',
    state: ['pao2', 'fio2'],
    anyValue: (v) => anyVm.calcPF(value(v, 'pao2'), anyNumber(v, 'fio2')),
    anyInterpret: anyVm.interpretPF,
    edges: [
      { inputs: { pao2: 100, fio2: 100 } }, // 100
      { inputs: { pao2: 80, fio2: 40 } }, // 200
      { inputs: { pao2: 120, fio2: 40 } }, // 300
      { inputs: { pao2: 63, fio2: 21 } },
    ],
  },
  {
    id: 'sf',
    component: 'SFCalc',
    state: ['spo2', 'fio2'],
    anyValue: (v) =>
      value(v, 'spo2') > 97 ? null : anyVm.calcSF(value(v, 'spo2'), anyNumber(v, 'fio2')),
    anyInterpret: anyVm.interpretSF,
    edges: [
      { inputs: { spo2: 74, fio2: 50 } }, // 148
      { inputs: { spo2: 94, fio2: 40 } }, // 235
      { inputs: { spo2: 94.5, fio2: 30 } }, // 315
      { inputs: { spo2: 97, fio2: 21 } },
      { inputs: { spo2: 98, fio2: 21 } }, // SpO₂ > 97%: S/F não confiável
      { inputs: { spo2: 100, fio2: 100 } },
    ],
  },
  {
    id: 'ajuste-fio2',
    component: 'AjusteFiO2Calc',
    state: ['pao2Atual', 'fio2Atual', 'pao2Alvo'],
    anyValue: (v) =>
      anyVm.calcNewFiO2(value(v, 'pao2Atual'), anyNumber(v, 'fio2Atual'), value(v, 'pao2Alvo')),
    edges: [
      { inputs: { pao2Atual: 60, fio2Atual: 40, pao2Alvo: 80 } },
      { inputs: { pao2Atual: 40, fio2Atual: 80, pao2Alvo: 100 } }, // acima de 1,0: fica 1,0
      { inputs: { pao2Atual: 300, fio2Atual: 30, pao2Alvo: 60 } }, // abaixo de 0,21: fica 0,21
    ],
  },
  {
    id: 'ajuste-fr',
    component: 'AjusteFreqCalc',
    state: ['freqAtual', 'paco2Atual', 'paco2Alvo'],
    anyValue: (v) =>
      anyVm.calcNewFreq(value(v, 'freqAtual'), value(v, 'paco2Atual'), value(v, 'paco2Alvo')),
    edges: [{ inputs: { freqAtual: 16, paco2Atual: 50, paco2Alvo: 40 } }],
  },
  {
    id: 'tobin',
    component: 'TobinCalc',
    state: ['freq', 've'],
    anyValue: (v) => anyVm.calcTobin(value(v, 'freq'), value(v, 've')).tobin,
    anyInterpret: anyVm.interpretTobin,
    edges: [
      { inputs: { freq: 20, ve: 5 } }, // 80
      { inputs: { freq: 21, ve: 4.2 } }, // 105
      { inputs: { freq: 30, ve: 8 } },
    ],
  },
  {
    id: 'rox',
    component: 'ROXCalc',
    state: ['spo2', 'fio2', 'freq'],
    anyValue: (v) => anyVm.calcROX(value(v, 'spo2'), anyNumber(v, 'fio2'), value(v, 'freq')),
    anyInterpret: anyVm.interpretROX,
    edges: [
      { inputs: { spo2: 100, fio2: 21, freq: 1 } }, // o maior ROX possível no ANY
      { inputs: { spo2: 94, fio2: 50, freq: 22 } },
    ],
  },
  {
    id: 'tau',
    component: 'TauCalc',
    state: ['rva', 'cst'],
    anyValue: (v) => anyVm.calcTau(value(v, 'rva'), value(v, 'cst')),
    edges: [{ inputs: { rva: 10, cst: 50 } }],
  },
  {
    id: 'pmus',
    component: 'PmusCalc',
    state: ['deltaPocc'],
    anyValue: (v) => anyVm.calcPmus(value(v, 'deltaPocc')),
    anyInterpret: anyVm.interpretPmus,
    edges: [
      { inputs: { deltaPocc: 0 } },
      { inputs: { deltaPocc: -6.5 } },
      { inputs: { deltaPocc: -7 } },
      { inputs: { deltaPocc: -13.5 } },
      { inputs: { deltaPocc: -17 } },
      { inputs: { deltaPocc: -17.5 } },
    ],
  },
  {
    id: 'potencia-mecanica',
    component: 'MPCalc',
    state: ['vc', 'dp', 'freq'],
    anyValue: (v) => anyVm.calcMP(value(v, 'vc'), value(v, 'dp'), value(v, 'freq')),
    anyInterpret: anyVm.interpretMP,
    edges: [{ inputs: { vc: 500, dp: 10, freq: 24 } }, { inputs: { vc: 500, dp: 15, freq: 23 } }],
  },
  {
    id: 'assincronia',
    component: 'IACalc',
    state: ['eventos', 'freqTotal'],
    anyValue: (v) => anyVm.calcIA(value(v, 'eventos'), value(v, 'freqTotal')),
    anyInterpret: anyVm.interpretIA,
    edges: [
      { inputs: { eventos: 1, freqTotal: 20 } }, // 5
      { inputs: { eventos: 2, freqTotal: 20 } }, // 10
      { inputs: { eventos: 0, freqTotal: 20 } },
      { inputs: { eventos: 20, freqTotal: 20 } },
    ],
  },
];

const harness = loadVmGuide();

function calculationFor(id: string): VentilationCalculation {
  const found = VENTILATION_CALCULATIONS.find((calculation) => calculation.id === id);
  if (!found) throw new Error(`Conta ${id} não portada`);
  return found;
}

function answersOf(testCase: Case) {
  return {
    choices: testCase.choices,
    inputs: Object.fromEntries(
      Object.entries(testCase.inputs).map(([id, number]) => [id, typed(number)]),
    ),
  };
}

function checksHold(calculation: VentilationCalculation, inputs: Record<string, number>): boolean {
  return (calculation.checks ?? []).every((check) => check.holds(inputs));
}

/** Sorteia um caso válido: na faixa aceita de cada campo e nas regras entre campos. */
function randomCase(calculation: VentilationCalculation, random: SeededRandom): Case {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const inputs = Object.fromEntries(
      calculation.inputs.map((input) => [
        input.id,
        random.onGrid(input.min, input.max, input.step),
      ]),
    );
    const choices = Object.fromEntries(
      (calculation.choices ?? []).map((choice) => [
        choice.id,
        random.pick(choice.options.map(({ id }) => id)),
      ]),
    );
    if (checksHold(calculation, inputs)) return { inputs, choices };
  }
  throw new Error(`Sem caso válido para ${calculation.id}`);
}

function casesFor(port: VmPort, calculation: VentilationCalculation): Case[] {
  const random = seededRandom(SEED + port.id.length * 7919);
  const edges = (port.edges ?? []).map((edge) => ({
    inputs: edge.inputs ?? {},
    choices: edge.choices ?? { sexo: 'masculino' },
  }));
  const sampled = Array.from({ length: DIFFERENTIAL_CASES }, () => randomCase(calculation, random));
  return [...edges, ...sampled];
}

interface Mismatch {
  case: string;
  expected: unknown;
  received: unknown;
}

function sameNumber(a: number | null, b: number | null): boolean {
  return a === b || (a !== null && b !== null && Number.isNaN(a) && Number.isNaN(b));
}

describe.each(PORTS.map((port) => [port.id, port] as const))('conta %s', (_id, port) => {
  const calculation = calculationFor(port.id);
  const cases = casesFor(port, calculation);

  it(`dá o mesmo valor, faixa e tom do vmData em ${cases.length} casos`, () => {
    const mismatches: Mismatch[] = [];
    for (const testCase of cases) {
      const result = evaluateVentilation(calculation, answersOf(testCase));
      const anyValue = port.anyValue(testCase.inputs, testCase.choices);
      const label = JSON.stringify(testCase);
      if (result.status !== 'complete') {
        mismatches.push({ case: label, expected: anyValue, received: result });
        continue;
      }
      const { outcome } = result;
      if (!sameNumber(outcome.value, anyValue)) {
        mismatches.push({ case: label, expected: anyValue, received: outcome.value });
        continue;
      }
      if (anyValue === null) continue;
      const interpreted = port.anyInterpret?.(anyValue);
      const expected = interpreted
        ? { band: bandName(interpreted.text), tone: STATUS_TONE[interpreted.status] }
        : null;
      const received = outcome.band
        ? { band: outcome.band.label.toLowerCase(), tone: outcome.band.tone }
        : null;
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: label, expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('mostra o mesmo resultado que a página do ANY', () => {
    const component = harness.calculator(port.component);
    const mismatches: Mismatch[] = [];
    for (const testCase of cases) {
      const result = evaluateVentilation(calculation, answersOf(testCase));
      if (result.status !== 'complete')
        throw new Error(`Caso inválido: ${JSON.stringify(testCase)}`);
      const { tree } = component.calculate(port.state.map((id) => anyText(id, testCase)));
      const box = findAll(tree, 'ResultBox')[0];
      if (!box) {
        mismatches.push({ case: JSON.stringify(testCase), expected: 'resultado', received: null });
        continue;
      }
      const lines = String(box.props.detail).split('<br>').map(decimalComma);
      const anyBand = port.anyInterpret && box.props.status !== 'info' ? lines.pop() : undefined;
      const relatedShown = findByText(tree, 'Abrir Airway Guide') !== undefined;
      const expected = {
        reading: decimalComma(String(box.props.value)),
        details: lines,
        band: anyBand ? bandName(anyBand) : null,
        tone: anyBand ? STATUS_TONE[String(box.props.status)] : null,
        related: relatedShown,
      };
      const { outcome } = result;
      const received = {
        reading: formatReading(outcome.reading),
        details: outcome.details,
        band: outcome.band ? outcome.band.label.toLowerCase() : null,
        tone: outcome.band ? outcome.band.tone : null,
        related: Boolean(
          calculation.related &&
          outcome.band &&
          calculation.related.bandIds.includes(outcome.band.id),
        ),
      };
      // O ANY chamava o peso predito de "peso ideal"; o número e a unidade são os mesmos.
      if (port.id === 'peso-predito') {
        expected.reading = expected.reading.replace('Peso ideal', 'Peso predito');
      }
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: JSON.stringify(testCase), expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe('avisos de faixa habitual (18 no ANY)', () => {
  const withUsual = VENTILATION_CALCULATIONS.flatMap((calculation) =>
    calculation.inputs.filter((input) => input.usual).map((input) => ({ calculation, input })),
  );

  it('são 18, nos mesmos campos em que a página do ANY avisa', () => {
    expect(withUsual).toHaveLength(18);
    const anyWarns: string[] = [];
    for (const port of PORTS) {
      const calculation = calculationFor(port.id);
      calculation.inputs.forEach((input, index) => {
        // Valor absurdo: se o campo tem aviso no ANY, ele aparece.
        const testCase: Case = {
          inputs: { [input.id]: 1_000_000 },
          choices: { sexo: 'masculino' },
        };
        const tree = harness
          .calculator(port.component)
          .render(port.state.map((id) => anyText(id, testCase)));
        const fields = findAll(tree, 'CalcInput');
        expect(fields).toHaveLength(calculation.inputs.length);
        if (fields[index]?.props.warning) anyWarns.push(`${port.id}.${input.id}`);
      });
    }
    expect(anyWarns.sort()).toEqual(
      withUsual.map(({ calculation, input }) => `${calculation.id}.${input.id}`).sort(),
    );
  });

  function samples(input: VentilationInput, random: SeededRandom): number[] {
    const usual = input.usual;
    if (!usual) return [];
    const span = input.max - input.min;
    const round = (n: number) => Number(n.toFixed(2));
    const edges = [
      usual.min,
      usual.max,
      usual.min - input.step,
      usual.max + input.step,
      usual.min - 0.01,
      usual.max + 0.01,
      usual.min + 0.01,
      usual.max - 0.01,
      input.min,
      input.max,
      input.min - input.step,
      input.max + input.step,
      0,
      -1,
    ].map(round);
    // Centésimos: o médico digita decimal, e a borda do aviso fica coberta dos dois lados.
    const sampled = Array.from({ length: DIFFERENTIAL_CASES }, () =>
      random.onGrid(round(input.min - span / 2), round(input.max + span / 2), 0.01),
    );
    return [...new Set([...edges, ...sampled])];
  }

  describe.each(
    withUsual.map((entry) => [`${entry.calculation.id}.${entry.input.id}`, entry] as const),
  )('%s', (_name, { calculation, input }) => {
    const port = PORTS.find(({ id }) => id === calculation.id);
    if (!port) throw new Error(`Sem porte para ${calculation.id}`);
    const index = calculation.inputs.indexOf(input);
    const random = seededRandom(SEED + index * 104729 + calculation.id.length);
    const values = samples(input, random);

    it(`avisa nos mesmos valores que o ANY (${values.length} valores, com as bordas)`, () => {
      const component = harness.calculator(port.component);
      const mismatches: Mismatch[] = [];
      for (const number of values) {
        const testCase: Case = { inputs: { [input.id]: number }, choices: { sexo: 'masculino' } };
        const tree = component.render(port.state.map((id) => anyText(id, testCase)));
        const anyWarning = findAll(tree, 'CalcInput')[index]?.props.warning;
        const raw = typed(number);
        const outOfRange = !validateNumber(raw, input).ok;
        const soft = usualRangeWarning(input, raw);
        // No ANY o zero não avisava (`parseFloat("0")` é falso) e a conta o recusava;
        // aqui o zero fora da faixa aceita é erro. Nos demais, aviso ⇔ alerta.
        const anyAlerts = Boolean(anyWarning);
        const ourAlerts = outOfRange || soft !== null;
        const sameAlert = number === 0 ? !anyAlerts : anyAlerts === ourAlerts;
        const sameText = soft === null || soft === decimalComma(String(anyWarning));
        if (!sameAlert || !sameText) {
          mismatches.push({
            case: `${input.id}=${number}`,
            expected: anyWarning ?? null,
            received: { outOfRange, soft },
          });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });

  it('dentro da faixa aceita, o aviso não barra a conta (como no ANY)', () => {
    const calculation = calculationFor('rva');
    const result = evaluateVentilation(calculation, {
      inputs: { ppico: '70', ppausa: '50', fluxo: '60' },
    });
    expect(result.status).toBe('complete');
    const ppico = calculation.inputs[0];
    expect(ppico && usualRangeWarning(ppico, '70')).toBe(
      'Valor fora da faixa habitual (5-60 cmH₂O)',
    );
  });
});

// ----- HACOR -----

/** Pontos do ANY por item, na ordem dos botões. */
function anyHacorOptions() {
  return anyVm.HACOR_VARIABLES.map(
    (variable: { key: string; label: string; options: { label: string; value: number }[] }) => ({
      id: variable.key,
      label: variable.label,
      options: variable.options.map((option) => ({
        label: option.label.replace(/:\s*\d+$/, ''),
        points: option.value,
      })),
    }),
  );
}

function* everyHacorCombination(): Generator<number[]> {
  const sizes = HACOR.items.map((item) => item.options.length);
  const current = sizes.map(() => 0);
  while (true) {
    yield [...current];
    let position = current.length - 1;
    while (position >= 0) {
      current[position] = ((current[position] ?? 0) + 1) % (sizes[position] ?? 1);
      if (current[position] !== 0) break;
      position -= 1;
    }
    if (position < 0) return;
  }
}

function total(evaluation: CalculatorEvaluation): number {
  if (evaluation.status !== 'complete') throw new Error('HACOR incompleto');
  return evaluation.value;
}

describe('HACOR', () => {
  it('tem os itens, opções e pontos dos botões do ANY', () => {
    expect(
      HACOR.items.map((item) => ({
        id: item.id,
        label: item.label,
        options: item.options.map(({ label, points }) => ({ label, points })),
      })),
    ).toEqual(anyHacorOptions());
  });

  it('soma e classifica como o ANY em todas as 960 combinações', () => {
    const mismatches: Mismatch[] = [];
    for (const combination of everyHacorCombination()) {
      const items: Record<string, string> = {};
      const anyScores: Record<string, number> = {};
      HACOR.items.forEach((item, index) => {
        const option = item.options[combination[index] ?? 0];
        if (!option) return;
        items[item.id] = option.id;
        anyScores[item.id] = option.points;
      });
      const score = total(evaluateHacor({ items }));
      const anyScore = anyVm.hacorTotal(anyScores);
      const interpreted = anyVm.interpretHACOR(anyScore ?? -1);
      const band = hacorBand(score);
      const expected = {
        score: anyScore,
        band: bandName(interpreted.text),
        tone: interpreted.risk === 'low' ? 'neutral' : 'critical',
      };
      const received = { score, band: band.label.toLowerCase(), tone: band.tone };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: combination.join(','), expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it(`dá o mesmo que o calcHACOR do ANY (por valor medido) em ${DIFFERENTIAL_CASES} casos`, () => {
    const random = seededRandom(SEED);
    const mismatches: Mismatch[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const measured = {
        tachycardia: random.pick([true, false]),
        ph: random.onGrid(6.8, 7.6, 0.01),
        gcs: random.integer(3, 15),
        pf: random.integer(40, 500),
        respiratoryRate: random.integer(8, 60),
      };
      const expected = calcHACOR(
        measured.tachycardia,
        measured.ph,
        measured.gcs,
        measured.pf,
        measured.respiratoryRate,
      );
      const received = total(evaluateHacor(hacorAnswersFor(measured)));
      if (expected !== received) {
        mismatches.push({ case: JSON.stringify(measured), expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  describe('na tela do ANY (início e reavaliação)', () => {
    const section = harness.calculator('HACORSection');
    const empty = { fc: null, ph: null, gcs: null, pf: null, fr: null };

    function scoresFor(target: number): Record<string, number> {
      // Distribui o score pelos itens, do maior peso para o menor.
      const result: Record<string, number> = {};
      let remaining = target;
      for (const item of [...HACOR.items].reverse()) {
        const points =
          item.options
            .map((option) => option.points)
            .filter((points) => points <= remaining)
            .sort((a, b) => b - a)[0] ?? 0;
        result[item.id] = points;
        remaining -= points;
      }
      if (remaining !== 0) throw new Error(`Score ${target} sem combinação`);
      return result;
    }

    const reachable = Array.from({ length: 26 }, (_, score) => score).filter((score) => {
      try {
        scoresFor(score);
        return true;
      } catch {
        return false;
      }
    });

    it('classifica alto risco a partir do mesmo score nas duas telas', () => {
      for (const score of reachable) {
        const expectedHigh = hacorBand(score).id === 'alto-risco';
        const start = textContent(section.render(['início', scoresFor(score), empty, []]));
        const again = textContent(section.render(['reaval', empty, scoresFor(score), []]));
        expect(start.includes('Alto risco de falha'), `início, score ${score}`).toBe(expectedHigh);
        expect(again.includes('Alto risco de falha'), `reavaliação, score ${score}`).toBe(
          expectedHigh,
        );
      }
    });

    it('registra o T0 e as reavaliações com os mesmos rótulos', () => {
      const tree = section.render(['início', scoresFor(7), empty, []]);
      const startButton = findByText(tree, 'Iniciar VNI e registrar T0');
      (startButton?.props.onClick as () => void)();
      const t0 = section.calls().find(({ position }) => position === 3)?.value as {
        label: string;
        score: number;
      }[];
      const ours = startHacorHistory(7, '10:00');
      expect(t0.map(({ label, score }) => ({ label, score }))).toEqual(
        ours.map(({ label, score }) => ({ label, score })),
      );

      let anyHistory = t0;
      let history = ours;
      for (const score of [9, 4, 4]) {
        const reval = section.render(['reaval', empty, scoresFor(score), anyHistory]);
        (findByText(reval, 'Salvar e reavaliar depois')?.props.onClick as () => void)();
        const update = section.calls().find(({ position }) => position === 3)?.value as (
          previous: typeof anyHistory,
        ) => typeof anyHistory;
        anyHistory = update(anyHistory);
        history = appendHacorReassessment(history, score, '11:00');
      }
      expect(anyHistory.map(({ label, score }) => ({ label, score }))).toEqual(
        history.map(({ label, score }) => ({ label, score })),
      );
    });

    it('compara com a avaliação anterior como o ANY (melhora, piora, estável)', () => {
      for (const previous of reachable) {
        for (const current of reachable) {
          const tree = section.render([
            'reaval',
            empty,
            scoresFor(current),
            [{ time: '10:00', score: previous, label: 'T0' }],
          ]);
          const line = findByText(tree, 'Anterior:');
          expect(line && textContent(line)).toBe(
            `Anterior: ${previous} → Atual: ${current} (${hacorTrend(previous, current).label})`,
          );
        }
      }
    });
  });
});

// ----- Diferenças de propósito (achados da revisão clínica) -----

describe('diferenças de propósito em relação ao ANY', () => {
  it('não calcula com platô igual ou abaixo da PEEP (no ANY: Cst infinita "Normal")', () => {
    expect(anyVm.interpretCst(anyVm.calcCst(400, 10, 10)).status).toBe('success');
    const result = evaluateVentilation(calculationFor('cst'), {
      inputs: { vc: '400', ppausa: '10', peep: '10' },
    });
    expect(result.status).toBe('pending');
    expect(result.status === 'pending' && result.failedChecks.map(({ id }) => id)).toEqual([
      'plato-acima-da-peep',
    ]);
  });

  it('não calcula driving pressure negativa (no ANY: "Excelente")', () => {
    expect(anyVm.interpretDP(anyVm.calcDP(8, 10)).text).toMatch(/^Excelente/);
    const result = evaluateVentilation(calculationFor('driving-pressure'), {
      inputs: { ppausa: '8', peep: '10' },
    });
    expect(result.status).toBe('pending');
  });

  it('não calcula Rva com pico abaixo do platô (no ANY: Rva negativa "Normal")', () => {
    expect(anyVm.interpretRva(anyVm.calcRva(20, 30, 60)).text).toBe('Normal');
    const result = evaluateVentilation(calculationFor('rva'), {
      inputs: { ppico: '20', ppausa: '30', fluxo: '60' },
    });
    expect(result.status).toBe('pending');
  });

  it('não calcula assincronia acima de 100% (mais eventos que ciclos)', () => {
    expect(anyVm.calcIA(30, 20)).toBe(150);
    const result = evaluateVentilation(calculationFor('assincronia'), {
      inputs: { eventos: '30', freqTotal: '20' },
    });
    expect(result.status).toBe('pending');
  });

  it('ROX: com a conta do ANY (FiO₂ em %), só FR de 1 ipm sai do alto risco — achado 1.1', () => {
    // Mantida por paridade até a revisão clínica. O maior ROX com FR ≥ 2 ipm:
    // SpO₂ 100%, FiO₂ 21%, FR 2 → 2,38; com a FiO₂ em fração seria 238.
    const best = evaluateVentilation(ROX_INDEX, { inputs: { spo2: '100', fio2: '21', freq: '2' } });
    expect(best.status === 'complete' && best.outcome.value).toBeCloseTo(2.38, 2);
    expect(best.status === 'complete' && best.outcome.band?.id).toBe('alto-risco');
  });
});
