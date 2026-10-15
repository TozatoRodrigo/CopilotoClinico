import { describe, expect, it } from 'vitest';
import * as anyCalculations from '../any-reference/calculations';
import { categoryLabels, drugConfigs, searchDrug } from '../any-reference/drugConfigs';
import * as anyFormatters from '../any-reference/formatters';
import {
  checkCustomDilution,
  describePreparation,
} from '../../src/shared/clinical-tools/infusions/custom-dilution';
import {
  doseSettings,
  doseStatus,
  doseToMlh,
  formatConcentration,
  formatPatientBolus,
  formatRate,
  mlhToDose,
  patientBolus,
  sliderValue,
  stepDose,
} from '../../src/shared/clinical-tools/infusions/dose';
import {
  INFUSION_CATEGORIES,
  INFUSION_DRUGS,
  type InfusionDrug,
} from '../../src/shared/clinical-tools/infusions/drugs';
import { searchInfusionItems } from '../../src/shared/clinical-tools/infusions/items';
import { parseDecimal } from '../../src/shared/clinical-tools/numbers';
import type { DoseStatus } from '../../src/shared/clinical-tools/tone';
import {
  createHeadlessReact,
  findAll,
  hasClass,
  isElement,
  loadFrozenModule,
  textOf,
  valueNextTo,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';

/**
 * CC-311 — Infusões contínuas contra a referência congelada do ANY
 * (tests/any-reference): os dados das 16 drogas campo a campo, a conta nos
 * dois sentidos, a cor da dose, o bolus "Este paciente", os botões − e + e a
 * trava da "minha diluição". A conta que mora dentro do `DoseCalculator.tsx`
 * é conferida rodando o próprio componente congelado (any-component-harness).
 *
 * Diferenças deliberadas, que este arquivo NÃO compara (ver
 * docs/ferramentas/revisao-clinica/infusoes.md):
 * - o rótulo da faixa sem modo sai com o número exato (o ANY arredondava);
 * - a dose na tela usa as casas do passo (0,375 em vez de "0,38");
 * - o preparo por extenso não arredonda ampola fracionada.
 */

const SEED = 20261015;

type AnyDrug = (typeof drugConfigs)[number];

const PAIRS: readonly (readonly [InfusionDrug, AnyDrug])[] = INFUSION_DRUGS.map((drug) => {
  const reference = drugConfigs.find((candidate: AnyDrug) => candidate.id === drug.id);
  if (!reference) throw new Error(`Sem referência do ANY para ${drug.id}`);
  return [drug, reference] as const;
});

/** Cor hex do ANY → status, pelo próprio `statusColors` congelado. */
function statusFromColor(color: unknown): DoseStatus | undefined {
  const entries = Object.entries(anyFormatters.statusColors) as [DoseStatus, { border: string }][];
  return entries.find(([, colors]) => colors.border === color)?.[0];
}

// ---- DoseCalculator congelado, sem React -------------------------------------------------

let currentWeight: number | null = 70;
const react = createHeadlessReact();
const DoseCalculator = loadFrozenModule('DoseCalculator.tsx', react, {
  '../../contexts/WeightContext': { useWeight: () => ({ weight: currentWeight }) },
  '../../hooks/useServerCalc': { useServerCalc: () => ({ calcDose: async () => null }) },
  '../../hooks/useCustomDilution': {
    useCustomDilution: () => ({ custom: null, save: () => undefined, clear: () => undefined }),
  },
  '../../utils/calculations': anyCalculations,
  '../../utils/formatters': anyFormatters,
  '../common/AlertCard': {
    AlertCard: (props: { title: string; children: HeadlessNode }) =>
      react.module.createElement('alertcard', { title: props.title }, props.children),
  },
}).DoseCalculator as (props: { drug: AnyDrug }) => HeadlessNode;

/** Posição de cada `useState` no DoseCalculator congelado. */
const STATE = [
  'modeId',
  'dose',
  'concentration',
  'editingMl',
  'editingDose',
  'mlValue',
  'doseValue',
  'dilStep',
  'formAmps',
  'formVol',
] as const;
type StateName = (typeof STATE)[number];

function renderAny(
  drug: AnyDrug,
  weight: number | null,
  state: Partial<Record<StateName, unknown>>,
): HeadlessNode {
  currentWeight = weight;
  return react.render(
    DoseCalculator,
    { drug },
    STATE.map((name) => state[name]),
  );
}

function lastSet(name: StateName): unknown {
  const position = STATE.indexOf(name);
  const calls = react.setCalls.filter((call) => call.position === position);
  return calls[calls.length - 1]?.value;
}

/** Caixa de resultado ("Velocidade" ou "Dose") com o campo editável dentro. */
function resultBox(tree: HeadlessNode, title: string): HeadlessElement {
  const box = findAll(
    tree,
    (element) =>
      element.children.some((child) => isElement(child) && textOf(child) === title) &&
      findAll(element, (inner) => inner.type === 'input').length > 0,
  )[0];
  if (!box) throw new Error(`caixa ${title} ausente`);
  return box;
}

function inputOf(box: HeadlessElement): HeadlessElement {
  const input = findAll(box, (element) => element.type === 'input')[0];
  if (!input) throw new Error('caixa sem campo');
  return input;
}

function button(tree: HeadlessNode, text: string): HeadlessElement {
  const found = findAll(
    tree,
    (element) => element.type === 'button' && textOf(element) === text,
  )[0];
  if (!found) throw new Error(`botão ${text} ausente`);
  return found;
}

interface Case {
  drug: InfusionDrug;
  reference: AnyDrug;
  modeId: string | null;
  weight: number;
  concentration: number;
  dose: number;
}

function randomCase(random: SeededRandom): Case {
  const [drug, reference] = random.pick(PAIRS);
  const modeId = drug.modes ? random.pick(drug.modes).id : null;
  const settings = doseSettings(drug, modeId);
  const concentrations = [
    drug.concentration,
    ...(drug.dilutions ?? []).map(({ concentration }) => concentration),
    // Uma "minha diluição" qualquer dentro da trava (0,05× a 4×).
    drug.concentration * (0.05 + random.next() * 3.95),
  ];
  const roll = random.next();
  const dose =
    roll < 0.7
      ? random.onGrid(settings.min, settings.max, settings.step)
      : roll < 0.9
        ? settings.max + random.next() * 2 * Math.max(settings.max, settings.critical)
        : random.next() * settings.min;
  return {
    drug,
    reference,
    modeId,
    weight: random.onGrid(40, 200, 0.1),
    concentration: random.pick(concentrations),
    dose,
  };
}

describe('Infusões × ANY — dados das 16 drogas (drugConfigs.ts)', () => {
  it('tem as mesmas drogas, na mesma ordem', () => {
    expect(INFUSION_DRUGS.map(({ id }) => id)).toEqual(drugConfigs.map(({ id }: AnyDrug) => id));
  });

  it.each(PAIRS.map(([drug, reference]) => [drug.id, drug, reference] as const))(
    '%s: mesmas doses, faixas, limiares, diluições, modos, bolus e ampola',
    (_id, drug, reference) => {
      const { provenance: _provenance, ...content } = drug;
      // `resultUnit` é sempre mL/h no ANY; o motor não guarda a constante.
      expect({ ...content, resultUnit: 'mL/h' }).toEqual(reference);
    },
  );

  it('tem os mesmos grupos e rótulos', () => {
    for (const category of INFUSION_CATEGORIES) {
      expect(category.label).toBe(categoryLabels[category.id]);
    }
  });
});

describe('Infusões × ANY — conta e cor da dose', () => {
  it(`doseToMlh e mlhToDose = calculations.ts em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const { drug, weight, concentration, dose } = randomCase(random);
      const args = [weight, concentration, drug.factor, drug.usesWeight] as const;
      expect(doseToMlh(dose, ...args), `caso ${index}`).toBe(
        anyCalculations.doseToMlh(dose, ...args),
      );
      const mlh = random.next() * 400;
      expect(mlhToDose(mlh, ...args), `caso ${index}`).toBe(
        anyCalculations.mlhToDose(mlh, ...args),
      );
    }
  });

  it(`mL/h, cor, faixa, controle e bolus = DoseCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 1);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const testCase = randomCase(random);
      const { drug, reference, modeId, weight, concentration, dose } = testCase;
      const settings = doseSettings(drug, modeId);
      const tree = renderAny(reference, weight, {
        modeId: modeId ?? undefined,
        dose,
        concentration,
      });

      const velocity = resultBox(tree, 'Velocidade');
      const mlh = doseToMlh(dose, weight, concentration, drug.factor, drug.usesWeight);
      const bolus = settings.bolus ? patientBolus(settings.bolus, weight) : null;
      const expected = {
        mlh: formatRate(mlh),
        status: doseStatus(dose, settings),
        rangeLabel: settings.mode ? settings.rangeLabel : null,
        slider: sliderValue(dose, settings),
        bolus: bolus ? formatPatientBolus(bolus) : null,
      };
      const slider = findAll(tree, (element) => element.props.type === 'range')[0];
      const received = {
        mlh: inputOf(velocity).props.value,
        status: statusFromColor((velocity.props.style as { borderColor?: string }).borderColor),
        rangeLabel: settings.mode ? valueNextTo(tree, 'Range terapêutico') : null,
        slider: slider?.props.value,
        bolus: valueNextTo(tree, 'Este paciente'),
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ caso: index, drug: drug.id, modeId, weight, dose, expected, received });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it(`mL/h digitado → dose = DoseCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 2);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const { drug, reference, modeId, weight, concentration } = randomCase(random);
      // Como o médico digita: uma casa, com vírgula.
      const typed = random.onGrid(0, 300, 0.1).toFixed(1).replace('.', ',');
      const tree = renderAny(reference, weight, { modeId: modeId ?? undefined, concentration });
      const onChange = inputOf(resultBox(tree, 'Velocidade')).props.onChange as (event: {
        target: { value: string };
      }) => void;
      onChange({ target: { value: typed } });
      const parsed = parseDecimal(typed);
      if (!parsed.ok) throw new Error(`não leu ${typed}`);
      expect(
        mlhToDose(parsed.value, weight, concentration, drug.factor, drug.usesWeight),
        `caso ${index}: ${drug.id} ${typed} mL/h`,
      ).toBe(lastSet('dose'));
    }
  });

  it(`botões − e + = DoseCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 3);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const { drug, reference, modeId, weight, concentration, dose } = randomCase(random);
      const settings = doseSettings(drug, modeId);
      const tree = renderAny(reference, weight, {
        modeId: modeId ?? undefined,
        dose,
        concentration,
      });
      for (const [text, direction] of [
        ['-', -1],
        ['+', 1],
      ] as const) {
        (button(tree, text).props.onClick as () => void)();
        expect(
          stepDose(dose, settings, direction),
          `caso ${index}: ${drug.id} ${dose} ${text}`,
        ).toBe(lastSet('dose'));
      }
    }
  });

  it('troca de modo começa na dose padrão do modo, como no ANY', () => {
    for (const [drug, reference] of PAIRS) {
      for (const mode of drug.modes ?? []) {
        const tree = renderAny(reference, 70, {});
        (button(tree, mode.label).props.onClick as () => void)();
        expect(lastSet('modeId')).toBe(mode.id);
        expect(lastSet('dose')).toBe(doseSettings(drug, mode.id).defaultDose);
      }
    }
  });
});

describe('Infusões × ANY — minha diluição', () => {
  const WITH_AMPOULE = PAIRS.filter(([drug]) => drug.ampoule);

  function errorText(tree: HeadlessNode): string | null {
    const found = findAll(
      tree,
      (element) => hasClass(element, 'text-warning') && hasClass(element, 'leading-relaxed'),
    )[0];
    return found ? textOf(found) : null;
  }

  function previewText(tree: HeadlessNode): string | null {
    // Os botões − e + também têm text-xl: a prévia é o div.
    const found = findAll(
      tree,
      (element) => element.type === 'div' && hasClass(element, 'text-xl'),
    )[0];
    return found ? textOf(found) : null;
  }

  it(`trava e prévia = DoseCalculator.tsx em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 4);
    const mismatches: unknown[] = [];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const [drug, reference] = random.pick(WITH_AMPOULE);
      const ampoules = random.integer(0, 40) + (random.next() < 0.2 ? 0.5 : 0);
      const volume = random.next() < 0.3 ? random.integer(0, 60) : random.integer(0, 3000);
      const ampoulesRaw = String(ampoules).replace('.', ',');
      const volumeRaw = String(volume);
      const tree = renderAny(reference, 70, {
        dilStep: 'form',
        formAmps: ampoulesRaw,
        formVol: volumeRaw,
      });
      const check = checkCustomDilution(drug, ampoulesRaw, volumeRaw);
      const anyError = errorText(tree);
      const anyPreview = previewText(tree);
      const anyDisabled = button(tree, 'Confirmar').props.disabled;

      const ourPreview =
        check.status === 'incompleta'
          ? null
          : `${formatConcentration(check.status === 'valida' ? check.dilution.concentration : check.concentration)} ${drug.concentrationUnit}`;
      const ourError = check.status === 'valida' ? null : check.message;
      // O ANY escreve o volume mínimo com fmt(…, 0): só é igual quando o volume é inteiro.
      const minimumVolume = ampoules * (drug.ampoule?.volume ?? 0);
      const compareText =
        Number.isInteger(minimumVolume) || !anyError?.startsWith('O volume final');
      const same =
        anyPreview === ourPreview &&
        Boolean(anyDisabled) === (check.status !== 'valida') &&
        (anyError === null) === (ourError === null) &&
        (!compareText || anyError === ourError);
      if (!same) {
        mismatches.push({
          caso: index,
          drug: drug.id,
          ampoulesRaw,
          volumeRaw,
          any: { anyError, anyPreview, anyDisabled },
          ours: { ourError, ourPreview, status: check.status },
        });
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('o preparo por extenso é o do ANY quando ampolas e volume são inteiros', () => {
    const random = seededRandom(SEED + 5);
    for (let index = 0; index < 200; index += 1) {
      const [drug, reference] = random.pick(WITH_AMPOULE);
      const ampoules = random.integer(1, 10);
      const volume = ampoules * (drug.ampoule?.volume ?? 1) + random.integer(0, 500);
      const tree = renderAny(reference, 70, {
        dilStep: 'form',
        formAmps: String(ampoules),
        formVol: String(volume),
      });
      const anyText = findAll(
        tree,
        (element) => hasClass(element, 'text-xs') && textOf(element).includes(' em '),
      )[0];
      expect(describePreparation(drug, ampoules, volume)).toBe(anyText && textOf(anyText));
    }
  });

  it(`formatConcentration = fmtConc em ${DIFFERENTIAL_CASES} valores`, () => {
    const random = seededRandom(SEED + 6);
    for (const value of [0, 0.4, 1, 64, 1000, 1.005, 8.333333]) {
      expect(formatConcentration(value)).toBe(anyFormatters.fmtConc(value));
    }
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const value = random.next() * 10 ** random.integer(-2, 5);
      expect(formatConcentration(value), `${value}`).toBe(anyFormatters.fmtConc(value));
    }
  });
});

describe('Infusões × ANY — busca de droga', () => {
  it(`acha ao menos o que o searchDrug do ANY acha, em ${DIFFERENTIAL_CASES} buscas`, () => {
    const random = seededRandom(SEED + 7);
    const words = drugConfigs.flatMap((drug: AnyDrug) => [drug.id, drug.name, ...drug.aliases]);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const word: string = random.pick(words).toLowerCase();
      const start = random.integer(0, Math.max(0, word.length - 2));
      const query = word.slice(start, start + random.integer(2, 6));
      const anyIds = searchDrug(query).map(({ id }: AnyDrug) => id);
      const ourIds = searchInfusionItems(query).map(({ id }) => id);
      expect(ourIds, `"${query}"`).toEqual(expect.arrayContaining(anyIds));
    }
  });
});
