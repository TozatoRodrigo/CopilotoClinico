import { describe, expect, it } from 'vitest';
import * as anyCalculations from '../any-reference/calculations';
import * as anyFormatters from '../any-reference/formatters';
import {
  heparinAdjustment,
  heparinStart,
  heparinStatus,
  HEPARIN_PROTOCOL,
  type HeparinIndication,
} from '../../src/shared/clinical-tools/infusions/heparin';
import {
  insulinAdjustment,
  insulinStart,
  insulinStatus,
  insulinTrend,
  type InsulinBolus,
  type InsulinInfusion,
} from '../../src/shared/clinical-tools/infusions/insulin';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import type { DoseStatus } from '../../src/shared/clinical-tools/tone';
import {
  createHeadlessReact,
  findAll,
  isElement,
  loadFrozenModule,
  textOf,
  valueNextTo,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';

/**
 * CC-312 — protocolos de heparina e insulina contra a referência congelada do
 * ANY: o `calcHeparina` de calculations.ts e os componentes
 * HeparinCalculator.tsx e InsulinCalculator.tsx, rodados sem React
 * (any-component-harness). Compara-se cada número que o ANY mostra, a linha do
 * nomograma ou da tabela em destaque e a cor.
 *
 * Diferenças deliberadas, que este arquivo NÃO compara (ver
 * docs/ferramentas/revisao-clinica/infusoes.md):
 * - no Início da heparina o ANY pintava o resultado pelo TTPa digitado no
 *   Ajuste; aqui o Início não tem cor de TTPa (os casos de Início vão sem TTPa);
 * - o ANY escrevia a infusão de insulina com ponto ("2.5"); aqui, vírgula.
 */

const SEED = 20261016;

function statusFromColor(color: unknown): DoseStatus | undefined {
  const entries = Object.entries(anyFormatters.statusColors) as [DoseStatus, { border: string }][];
  return entries.find(([, colors]) => colors.border === color)?.[0];
}

const react = createHeadlessReact();
const AlertCard = (props: { title: string; type: string; children: HeadlessNode }) =>
  react.module.createElement('alertcard', { title: props.title, type: props.type }, props.children);

/** Caixa de resultado do ANY: título, valor e unidade, com a cor no estilo. */
function resultBox(tree: HeadlessNode, title: string): { value: string; status?: DoseStatus } {
  const box = findAll(tree, (element) => {
    const children = element.children.filter(isElement);
    return children.length === 3 && textOf(children[0]) === title && 'style' in element.props;
  })[0];
  if (!box) throw new Error(`caixa ${title} ausente`);
  return {
    value: textOf(box.children.filter(isElement)[1]),
    status: statusFromColor((box.props.style as { borderColor?: string }).borderColor),
  };
}

/** Primeira célula da linha em destaque na tabela do ANY. */
function highlightedRow(tree: HeadlessNode): string | null {
  const row = findAll(
    tree,
    (element) => element.type === 'tr' && element.props.style !== undefined,
  )[0];
  const cell = row?.children.filter(isElement)[0];
  return cell ? textOf(cell) : null;
}

// ---- Heparina ------------------------------------------------------------------------------

let heparinWeight: number | null = 70;
const HeparinCalculator = loadFrozenModule('HeparinCalculator.tsx', react, {
  '../../contexts/WeightContext': { useWeight: () => ({ weight: heparinWeight }) },
  '../common/AlertCard': { AlertCard },
  '../../utils/formatters': anyFormatters,
}).HeparinCalculator as () => HeadlessNode;

/** Posições de `useState` no HeparinCalculator congelado: fase, modo, TTPa e dose atual. */
function renderHeparin(
  weight: number,
  state: { fase: 'inicio' | 'ajuste'; modo: HeparinIndication; ttpa?: string; dose?: string },
): HeadlessNode {
  heparinWeight = weight;
  return react.render(HeparinCalculator, {}, [
    state.fase,
    state.modo,
    state.ttpa ?? '',
    state.dose ?? '',
  ]);
}

/** TTPa/R com mais casos perto dos limites do nomograma. */
function randomRatio(random: SeededRandom): number {
  if (random.next() < 0.3) {
    const edge = random.pick([1.2, 1.5, 2.5, 3.0]);
    return Number((edge + random.pick([-0.01, 0, 0.01])).toFixed(2));
  }
  return random.onGrid(0.2, 10, 0.01);
}

describe('Heparina × ANY', () => {
  it(`início = calcHeparina em ${DIFFERENTIAL_CASES} pesos`, () => {
    const random = seededRandom(SEED);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(40, 200, 0.1);
      const indication = random.pick(['sca', 'tep'] as const);
      const reference = anyCalculations.calcHeparina(weight, indication);
      expect(heparinStart(weight, indication), `caso ${index}: ${weight} kg ${indication}`).toEqual(
        {
          bolusUnits: reference.bolusDose,
          bolusVolumeMl: reference.bolusVolume,
          unitsPerHour: reference.infusionDose,
          mlh: reference.infusionMlh,
        },
      );
    }
  });

  it(`início = HeparinCalculator.tsx em ${DIFFERENTIAL_CASES} pesos`, () => {
    const random = seededRandom(SEED + 1);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(40, 200, 0.1);
      const indication = random.pick(['sca', 'tep'] as const);
      const tree = renderHeparin(weight, { fase: 'inicio', modo: indication });
      const start = heparinStart(weight, indication);
      const content = HEPARIN_PROTOCOL.indications[indication];
      const expected = {
        bolus: `${formatDecimal(start.bolusUnits, 0)} UI`,
        bolusText: content.bolusText,
        infusionText: content.infusionText,
        mlh: formatDecimal(start.mlh),
        unitsPerHour: formatDecimal(start.unitsPerHour, 0),
      };
      const received = {
        bolus: valueNextTo(tree, 'Este paciente'),
        bolusText: valueNextTo(tree, 'Dose bolus'),
        infusionText: valueNextTo(tree, 'Infusão inicial'),
        mlh: resultBox(tree, 'Velocidade').value,
        unitsPerHour: resultBox(tree, 'Dose').value,
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ caso: index, weight, indication, expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it(`ajuste por TTPa = HeparinCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 2);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(40, 200, 0.1);
      const indication = random.pick(['sca', 'tep'] as const);
      const ratio = randomRatio(random);
      const currentDose = random.next() < 0.4 ? null : random.onGrid(0, 40, 0.5);
      const tree = renderHeparin(weight, {
        fase: 'ajuste',
        modo: indication,
        ttpa: String(ratio).replace('.', ','),
        dose: currentDose === null ? '' : String(currentDose).replace('.', ','),
      });
      const result = heparinAdjustment(weight, indication, ratio, currentDose);
      const expected = {
        row: result.row.range,
        extraBolus:
          result.extraBolusUnits > 0
            ? `${formatDecimal(result.extraBolusUnits, 0)} UI (${formatDecimal(result.extraBolusMl)} mL)`
            : '—',
        newDose: `${formatDecimal(result.newDosePerKg)} UI/kg/h`,
        pause: result.pauseOneHour ? 'Parar infusão por 1 hora' : null,
        mlh: formatDecimal(result.mlh),
        unitsPerHour: formatDecimal(result.unitsPerHour, 0),
        status: heparinStatus(ratio),
      };
      const velocity = resultBox(tree, 'Velocidade');
      const received = {
        row: highlightedRow(tree),
        extraBolus: valueNextTo(tree, 'Bolus adicional'),
        newDose: valueNextTo(tree, 'Nova dose'),
        pause: valueNextTo(tree, 'Ação'),
        mlh: velocity.value,
        unitsPerHour: resultBox(tree, 'Dose').value,
        status: velocity.status,
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({
          caso: index,
          weight,
          indication,
          ratio,
          currentDose,
          expected,
          received,
        });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('tem o nomograma e os textos de indicação do ANY', () => {
    const tree = renderHeparin(70, { fase: 'ajuste', modo: 'sca' });
    const rows = findAll(tree, (element) => element.type === 'tr')
      .slice(1)
      .map((row: HeadlessElement) => row.children.filter(isElement).map(textOf));
    expect(rows).toEqual(
      HEPARIN_PROTOCOL.nomogram.map(({ range, bolusText, actionText }) => [
        range,
        bolusText,
        actionText,
      ]),
    );
    expect(textOf(tree)).toContain(HEPARIN_PROTOCOL.preparation);
    expect(textOf(tree)).toContain(`${HEPARIN_PROTOCOL.concentration} UI/mL`);
  });
});

// ---- Insulina ------------------------------------------------------------------------------

const InsulinCalculator = loadFrozenModule('InsulinCalculator.tsx', react, {
  '../common/AlertCard': { AlertCard },
  '../../utils/formatters': anyFormatters,
}).InsulinCalculator as () => HeadlessNode;

/** Posições de `useState` no InsulinCalculator congelado. */
function renderInsulin(state: {
  fase: 'inicio' | 'ajuste';
  inicial?: string;
  atual?: string;
  anterior?: string;
  infusao?: string;
}): HeadlessNode {
  return react.render(InsulinCalculator, {}, [
    state.fase,
    state.inicial ?? '',
    state.atual ?? '',
    state.anterior ?? '',
    state.infusao ?? '',
  ]);
}

/** O que o ANY escreve no bolus e na infusão, lido de volta como dado. */
function readAnyBolus(text: string): InsulinBolus | string {
  if (text === '—') return { kind: 'nenhum' };
  if (text === 'PARAR') return { kind: 'parar' };
  const units = Number(text);
  return Number.isNaN(units) ? text : { kind: 'ui', units };
}

function readAnyInfusion(text: string): InsulinInfusion | string {
  if (text === 'Corrigir hipo') return { kind: 'corrigir-hipo' };
  if (text === 'Não iniciar') return { kind: 'nao-iniciar' };
  if (text === 'G50% 40mL') return { kind: 'glicose-50' };
  const halved = /^PARAR ou ↓50% \((\d+)\)$/.exec(text);
  if (halved) return { kind: 'parar-ou-metade', halved: Number(halved[1]) };
  const units = /^(-?[\d.]+)( \(↓50%\)| \(↓1\))?$/.exec(text);
  if (units) {
    return {
      kind: 'ui-h',
      unitsPerHour: Number(units[1]),
      reduction: units[2] === ' (↓50%)' ? 'metade' : units[2] === ' (↓1)' ? 'menos-1' : null,
    };
  }
  return text;
}

/** Glicemia com mais casos perto dos limites da tabela. */
function randomGlucose(random: SeededRandom): number {
  if (random.next() < 0.3) {
    return random.pick([70, 140, 180, 200, 250, 300, 350]) + random.pick([-1, 0, 1]);
  }
  return random.integer(10, 450);
}

describe('Insulina × ANY', () => {
  it(`início = InsulinCalculator.tsx em ${DIFFERENTIAL_CASES} glicemias`, () => {
    const random = seededRandom(SEED + 3);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const glucose = randomGlucose(random);
      const tree = renderInsulin({ fase: 'inicio', inicial: String(glucose) });
      const suggestion = insulinStart(glucose);
      const bolus = resultBox(tree, 'Bolus');
      const received = {
        row: highlightedRow(tree),
        bolus: readAnyBolus(bolus.value),
        infusion: readAnyInfusion(resultBox(tree, 'Infusão').value),
        status: bolus.status,
      };
      const expected = {
        row: suggestion.row.range,
        bolus: suggestion.bolus,
        infusion: suggestion.infusion,
        status: insulinStatus(glucose),
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ caso: index, glucose, expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it(`ajuste pela glicemia e pela queda = InsulinCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 4);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const glucose = randomGlucose(random);
      const previous = random.next() < 0.3 ? null : glucose + random.integer(-80, 200);
      const infusion = random.next() < 0.15 ? 0 : random.onGrid(0.5, 12, 0.5);
      const tree = renderInsulin({
        fase: 'ajuste',
        atual: String(glucose),
        anterior: previous === null ? '' : String(previous),
        infusao: String(infusion).replace('.', ','),
      });
      const suggestion = insulinAdjustment(glucose, previous, infusion);
      const trend = previous === null ? null : insulinTrend(glucose, previous);
      const bolus = resultBox(tree, 'Bolus');
      const received = {
        row: highlightedRow(tree),
        bolus: readAnyBolus(bolus.value),
        infusion: readAnyInfusion(resultBox(tree, 'Infusão').value),
        status: bolus.status,
        drop: valueNextTo(tree, 'Queda em 1 h'),
        reading: valueNextTo(tree, 'Leitura'),
      };
      const expected = {
        row: suggestion.row.range,
        bolus: suggestion.bolus,
        infusion: suggestion.infusion,
        status: insulinStatus(glucose),
        // As glicemias são inteiras: o texto da queda é o mesmo nos dois.
        drop: trend?.dropText ?? null,
        reading: trend?.readingText ?? null,
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ caso: index, glucose, previous, infusion, expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
