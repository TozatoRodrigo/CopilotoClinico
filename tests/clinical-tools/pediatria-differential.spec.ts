import { describe, expect, it } from 'vitest';
import {
  computeBolus,
  type BolusDrug,
  type BolusResult,
} from '../../src/shared/clinical-tools/pediatrics/bolus';
import {
  BOLUS_DRUGS,
  BOLUS_GROUPS,
  PREPARATIONS,
} from '../../src/shared/clinical-tools/pediatrics/bolus-drugs';
import {
  airwayEquipment,
  BROSELOW_COLORS,
  broselowColorForWeight,
  describeBroselowAge,
} from '../../src/shared/clinical-tools/pediatrics/broselow';
import {
  doseDecimals,
  doseFromRate,
  formatConcentration,
  formatRate,
  infusionRate,
  PEDIATRIC_INFUSIONS,
  weightBand,
  type PediatricInfusion,
  type WeightBand,
} from '../../src/shared/clinical-tools/pediatrics/infusions';
import {
  resolvePediatricPatient,
  type PediatricInputs,
} from '../../src/shared/clinical-tools/pediatrics/weight';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import { findAll } from './any-component-harness';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';
import {
  allBolusDrugs,
  fullText,
  loadPedGuide,
  rateInputValue,
  renderPedGuide,
  valueUnder,
  type AnyBolusDrug,
  type AnyBolusResult,
  type AnyInfusion,
  type PedGuideState,
} from './pediatria-reference';

/**
 * CC-319 — as doses em bolus, as infusões e a fita de Broselow do motor dão o
 * mesmo resultado do PedGuide v4 congelado (tests/any-reference/PedGuide.tsx):
 * mesmas entradas, mesmos textos de dose e volume, em 1.000 pesos aleatórios
 * com semente fixa por droga e nas bordas (0,5 kg, 50 kg, onde o teto começa).
 *
 * Única adaptação: o PedGuide mostra ponto decimal em 14 drogas (usa
 * `toFixed` sem trocar o separador); o Copiloto mostra vírgula sempre
 * (ADR-017). A comparação troca o ponto decimal do ANY por vírgula.
 */

const SEED = 20261015;
const reference = loadPedGuide();
const { internals } = reference;
const ANY_DRUGS = allBolusDrugs(internals);
const ANY_BY_ID = new Map(ANY_DRUGS.map((drug) => [drug.id, drug]));

/** Ponto decimal do ANY vira vírgula ("0.10" → "0,10"). */
function comma(text: string): string {
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}

function anyShape(result: AnyBolusResult): AnyBolusResult {
  return {
    mg: comma(result.mg),
    ml: comma(result.ml),
    unit: result.unit,
    ...(result.mlLabel === undefined ? {} : { mlLabel: result.mlLabel }),
  };
}

function oursShape(result: BolusResult): AnyBolusResult | 'falta-idade' {
  switch (result.status) {
    case 'falta-idade':
      return 'falta-idade';
    case 'nao-recomendado':
      return { mg: '--', ml: '--', unit: '', mlLabel: result.message };
    case 'pronto':
      return {
        mg: result.dose,
        ml: result.volume ?? '--',
        unit: result.unit,
        ...(result.note === null ? {} : { mlLabel: result.note }),
      };
  }
}

/** O DrugCard do ANY só chama `calc` com idade quando a droga pede idade. */
function anyCalc(
  drug: AnyBolusDrug,
  kg: number,
  ageYears: number | null,
): AnyBolusResult | 'falta-idade' {
  if (drug.needsAge && ageYears === null) return 'falta-idade';
  return anyShape(drug.calc(kg, ageYears, ageYears !== null ? ageYears * 12 : null));
}

interface Mismatch {
  id: string;
  kg: number;
  ageYears: number | null;
  expected: unknown;
  received: unknown;
}

function compareDrug(drug: BolusDrug, kg: number, ageYears: number | null): Mismatch | null {
  const anyDrug = ANY_BY_ID.get(drug.id);
  if (!anyDrug) throw new Error(`Sem referência do ANY para ${drug.id}`);
  const expected = anyCalc(anyDrug, kg, ageYears);
  const received = oursShape(computeBolus(drug, { kg, ageYears }));
  return JSON.stringify(expected) === JSON.stringify(received)
    ? null
    : { id: drug.id, kg, ageYears, expected, received };
}

describe('drogas em bolus × PedGuide v4', () => {
  it('são as 65 do ANY, nos mesmos grupos e na mesma ordem', () => {
    const groups: [string, AnyBolusDrug[]][] = [
      ['pcr', internals.PCR_DRUGS],
      ['iot', internals.IOT_DRUGS],
      ['emergencia', internals.EMERGENCY_DRUGS],
      ['anticonvulsivantes', internals.CONVULSION_DRUGS],
      ['neuro', internals.NEURO_DRUGS],
      ['dor-sedacao', internals.PAIN_DRUGS],
      ['respiratorio', internals.RESP_DRUGS],
      ['toxicologia', internals.TOX_DRUGS],
      ['anti-histaminicos', internals.AGE_DRUGS],
    ];
    expect(ANY_DRUGS).toHaveLength(65);
    expect(BOLUS_DRUGS).toHaveLength(65);
    for (const [id, anyDrugs] of groups) {
      const group = BOLUS_GROUPS.find((candidate) => candidate.id === id);
      expect(
        group?.drugs.map((drug) => drug.id),
        id,
      ).toEqual(anyDrugs.map((drug) => drug.id));
    }
  });

  it.each(BOLUS_DRUGS.map((drug) => [drug.id, drug] as const))(
    '%s copia nome, apresentação, dose/kg, instrução e selos',
    (_id, drug) => {
      const anyDrug = ANY_BY_ID.get(drug.id);
      expect(anyDrug).toBeDefined();
      expect({
        name: drug.name,
        presentation: drug.presentation,
        doseBadge: drug.doseLabel,
        calcAt: drug.calculatedAt,
        instruction: drug.instruction,
        naoRotineiro: drug.notRoutine ?? false,
        highlight: drug.highlight ?? false,
        prepKey: drug.preparation,
        needsAge: drug.dose.kind === 'por-idade',
      }).toEqual({
        name: anyDrug?.name,
        presentation: anyDrug?.presentation,
        doseBadge: anyDrug?.doseBadge,
        calcAt: anyDrug?.calcAt,
        instruction: anyDrug?.instruction,
        naoRotineiro: anyDrug?.naoRotineiro ?? false,
        highlight: anyDrug?.highlight ?? false,
        prepKey: anyDrug?.prepKey,
        needsAge: anyDrug?.needsAge ?? false,
      });
    },
  );

  it('copia os preparos ("Como preparar")', () => {
    expect(PREPARATIONS).toEqual(internals.PREPARATIONS);
  });

  it.each(
    BOLUS_DRUGS.filter((drug) => drug.dose.kind !== 'por-idade').map(
      (drug) => [drug.id, drug] as const,
    ),
  )('%s: mesma dose e volume em 1.000 pesos aleatórios e nas bordas', (_id, drug) => {
    const random = seededRandom(SEED);
    const weights = [0.5, 1, 2.9, 3, 9.9, 10, 10.1, 19.9, 20, 20.1, 29.9, 30, 30.1, 40, 49.9, 50];
    // Bordas do teto: o peso em que a dose por kg encosta no teto, e vizinhos.
    if (drug.dose.kind === 'por-kg') {
      for (const leg of drug.dose.legs) {
        if (leg.cap !== undefined) {
          const edge = leg.cap / leg.perKg;
          if (edge <= 50) weights.push(edge, Math.max(0.5, edge - 0.1), Math.min(50, edge + 0.1));
        }
      }
    }
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      weights.push(random.onGrid(0.5, 50, 0.1));
    }
    const mismatches = weights.flatMap((kg) => compareDrug(drug, kg, null) ?? []);
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it.each(
    BOLUS_DRUGS.filter((drug) => drug.dose.kind === 'por-idade').map(
      (drug) => [drug.id, drug] as const,
    ),
  )('%s: mesma dose em todas as combinações de idade e peso', (_id, drug) => {
    const mismatches: Mismatch[] = [];
    // Idade de 0 a 18 anos em passos de 0,1 (inclui 2 e 6 anos, as bordas) e
    // a idade de cada cor de Broselow; pesos de 0,5 a 50 kg em passos de 0,5.
    const ages = [null, ...Array.from({ length: 181 }, (_, i) => Number((i * 0.1).toFixed(1)))];
    for (const color of internals.BROSELOW_DATA) ages.push(color.idadeMeses / 12);
    for (const ageYears of ages) {
      for (let step = 1; step <= 100; step += 1) {
        const mismatch = compareDrug(drug, step * 0.5, ageYears);
        if (mismatch) mismatches.push(mismatch);
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});

describe('fita de Broselow × PedGuide v4', () => {
  it('tem as 9 cores com peso, idade, comprimento e material iguais', () => {
    expect(
      BROSELOW_COLORS.map((color) => ({
        key: color.key,
        name: color.name,
        peso: color.weightKg,
        idadeMeses: color.ageMonths,
        altura: color.heightCm,
        tubo: color.tubeMm,
        fixacao: color.fixationCm,
        lamina: color.blade,
        lma: String(color.laryngealMask),
        bougie: color.bougie,
        sondaAsp: color.suctionCatheter,
        min: color.lengthCm.min,
        max: color.lengthCm.max,
      })),
    ).toEqual(
      internals.BROSELOW_DATA.map((entry) => ({
        key: entry.key,
        name: entry.name,
        peso: entry.peso,
        idadeMeses: entry.idadeMeses,
        altura: entry.altura,
        tubo: entry.tubo,
        fixacao: entry.fixacao,
        lamina: entry['lâmina'],
        lma: entry.lma,
        bougie: entry.bougie,
        sondaAsp: entry.sondaAsp,
        min: entry.min,
        max: entry.max,
      })),
    );
  });

  it('descreve a idade de cada faixa como o ANY', () => {
    for (const color of BROSELOW_COLORS) {
      expect(describeBroselowAge(color.ageMonths)).toBe(
        comma(internals.formatIdade(color.ageMonths)),
      );
    }
  });

  it('acha a mesma cor pelo peso em 1.000 pesos aleatórios e em toda a grade de 0,5 kg', () => {
    const random = seededRandom(SEED);
    const weights = Array.from({ length: 100 }, (_, i) => (i + 1) * 0.5);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1)
      weights.push(random.onGrid(0.5, 50, 0.1));
    const mismatches = weights.filter(
      (kg) => broselowColorForWeight(kg).key !== internals.getColorFromWeight(kg).key,
    );
    expect(mismatches).toEqual([]);
  });

  it('mostra o mesmo material de via aérea na tela de PCR e no checklist, por peso e por cor', () => {
    const cases: { label: string; state: PedGuideState; inputs: PediatricInputs }[] = [];
    for (const entry of internals.BROSELOW_DATA) {
      const color = BROSELOW_COLORS.find(({ key }) => key === entry.key);
      cases.push({
        label: entry.name,
        state: { selectedBroselow: entry },
        inputs: { weight: '', broselow: color?.key ?? null, length: '', age: '' },
      });
    }
    const random = seededRandom(SEED);
    for (let index = 0; index < 200; index += 1) {
      const kg = String(random.onGrid(0.5, 50, 0.1));
      cases.push({
        label: `${kg} kg`,
        state: { pesoRaw: kg },
        inputs: { weight: kg, broselow: null, length: '', age: '' },
      });
    }
    for (const { label, state, inputs } of cases) {
      const patient = resolvePediatricPatient(inputs);
      if (patient.weight.status !== 'pronto') throw new Error(`${label}: peso não resolvido`);
      const ours = airwayEquipment(patient.weight.color);

      const pcr = renderPedGuide(reference, { ...state, view: 'pcr' });
      expect(
        {
          tube: comma(valueUnder(pcr, 'Tubo Traqueal') ?? ''),
          fixation: valueUnder(pcr, 'Fixação'),
          blade: valueUnder(pcr, 'Lâmina'),
          laryngealMask: comma(valueUnder(pcr, 'Máscara Laríngea') ?? ''),
          suctionCatheter: valueUnder(pcr, 'Sonda Aspiração'),
          bougie: valueUnder(pcr, 'Bougie'),
        },
        label,
      ).toEqual({
        tube: ours.tube,
        fixation: ours.fixation,
        blade: ours.blade,
        laryngealMask: ours.laryngealMask,
        suctionCatheter: ours.suctionCatheter,
        bougie: ours.bougie,
      });

      const checklist = comma(
        fullText(renderPedGuide(reference, { ...state, view: 'calculadoras' })),
      );
      for (const value of Object.values(ours.checklist)) {
        expect(checklist, `${label}: ${value}`).toContain(value);
      }
    }
  });

  it('marca como estimado o peso que vem da cor e avisa neonato abaixo de 3 kg', () => {
    const gray = internals.BROSELOW_DATA[0];
    const byColor = fullText(renderPedGuide(reference, { selectedBroselow: gray, view: 'home' }));
    expect(byColor).toContain('ESTIMADO');
    expect(
      resolvePediatricPatient({ weight: '', broselow: 'gray', length: '', age: '' }).weight,
    ).toMatchObject({
      estimated: true,
      source: 'broselow',
    });

    for (const kg of [0.5, 1, 2.9, 3, 3.1, 10]) {
      const text = fullText(renderPedGuide(reference, { pesoRaw: String(kg), view: 'home' }));
      const patient = resolvePediatricPatient({
        weight: String(kg),
        broselow: null,
        length: '',
        age: '',
      });
      const neonatal = patient.weight.status === 'pronto' && patient.weight.neonatal;
      expect(text.includes('Neonato'), `${kg} kg`).toBe(neonatal);
    }
  });

  it('não calcula com peso fora de 0,5 a 50 kg', () => {
    for (const raw of ['0.4', '50.1', '60', '0']) {
      const text = fullText(renderPedGuide(reference, { pesoRaw: raw, view: 'pcr' }));
      expect(text, raw).toContain('Informe o peso para calcular');
      expect(
        resolvePediatricPatient({ weight: raw, broselow: null, length: '', age: '' }).weight.status,
        raw,
      ).toBe('invalido');
    }
  });
});

const ANY_BAND: Record<'small' | 'medium' | 'large', WeightBand> = {
  small: 'ate-15',
  medium: '15-a-40',
  large: 'acima-40',
};

function anyInfusion(id: string): AnyInfusion {
  const infusion = internals.INFUSION_DATA[id];
  if (!infusion) throw new Error(`Sem referência do ANY para a infusão ${id}`);
  return infusion;
}

describe('infusões contínuas × PedGuide v4', () => {
  it('são as 16 do ANY, na mesma ordem, com faixa, passo, apresentação e diluições iguais', () => {
    const anyList = Object.values(internals.INFUSION_DATA);
    expect(PEDIATRIC_INFUSIONS.map(({ id }) => id)).toEqual(anyList.map(({ id }) => id));
    for (const infusion of PEDIATRIC_INFUSIONS) {
      const anyInf = anyInfusion(infusion.id);
      expect(
        {
          name: infusion.name,
          category: infusion.category,
          unit: infusion.unit,
          range: [infusion.range.min, infusion.range.max],
          step: infusion.step,
          defaultVal: infusion.defaultDose,
          presentation: infusion.presentation,
          warning: infusion.warning,
        },
        infusion.id,
      ).toEqual({
        name: anyInf.name,
        category: anyInf.category,
        unit: anyInf.unit,
        range: anyInf.range,
        step: anyInf.step,
        defaultVal: anyInf.defaultVal,
        presentation: anyInf.presentation,
        warning: anyInf.warning,
      });
      for (const [anyBand, band] of Object.entries(ANY_BAND)) {
        const anyDilution = anyInf.dilutions[anyBand as keyof AnyInfusion['dilutions']];
        const ours = infusion.dilutions[band];
        expect(
          {
            drug: ours.drugMl,
            diluent: ours.diluentMl,
            conc: ours.concentration,
            vol: ours.finalVolumeMl,
          },
          `${infusion.id} ${band}`,
        ).toEqual({
          drug: anyDilution.drug,
          diluent: anyDilution.diluent,
          conc: anyDilution.conc,
          vol: anyDilution.vol,
        });
        expect(formatConcentration(ours.concentration, infusion.unit)).toBe(
          comma(internals.formatConc(anyDilution.conc, anyInf.unit)),
        );
      }
    }
  });

  it('põe o peso na mesma faixa de diluição', () => {
    const random = seededRandom(SEED);
    const weights = [0.5, 14.9, 15, 15.1, 39.9, 40, 40.1, 50];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1)
      weights.push(random.onGrid(0.5, 50, 0.1));
    for (const kg of weights) {
      expect(weightBand(kg), `${kg} kg`).toBe(ANY_BAND[internals.getWeightCategory(kg)]);
    }
  });

  it.each(PEDIATRIC_INFUSIONS.map((infusion) => [infusion.id, infusion] as const))(
    '%s: mesma vazão, mesma vazão na tela e mesma conta inversa em 1.000 casos',
    (_id, infusion: PediatricInfusion) => {
      const anyInf = anyInfusion(infusion.id);
      const random = seededRandom(SEED);
      const mismatches: unknown[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const kg = random.onGrid(0.5, 50, 0.1);
        const dose = random.onGrid(infusion.range.min, infusion.range.max, infusion.step);
        const rate = infusionRate(infusion, dose, kg);
        const anyRate = internals.calcInfusionRate(anyInf, dose, kg);
        if (rate !== anyRate) mismatches.push({ kg, dose, rate, anyRate });

        // A vazão como o InfusionCard do ANY mostra, com a dose escolhida.
        const card = reference.react.render(
          internals.InfusionCard,
          { inf: anyInf, peso: kg, highlighted: false },
          [dose],
        );
        const shown = rateInputValue(card);
        if (formatRate(rate) !== shown)
          mismatches.push({ kg, dose, shown, ours: formatRate(rate) });

        const mlPerHour = random.onGrid(0.1, 100, 0.1);
        const back = doseFromRate(infusion, mlPerHour, kg);
        const anyBack = internals.calcDoseFromRate(anyInf, mlPerHour, kg);
        if (back !== anyBack) mismatches.push({ kg, mlPerHour, back, anyBack });
      }
      expect(mismatches.slice(0, 3)).toEqual([]);
    },
  );

  it('mostra a dose inicial com as mesmas casas do ANY', () => {
    for (const infusion of PEDIATRIC_INFUSIONS) {
      const anyInf = anyInfusion(infusion.id);
      const card = reference.react.render(internals.InfusionCard, {
        inf: anyInf,
        peso: 10,
        highlighted: false,
      });
      const doseInput = findAll(
        card,
        (element) => element.type === 'input' && element.props.type === 'number',
      )[0];
      expect(formatDecimal(infusion.defaultDose, doseDecimals(infusion)), infusion.id).toBe(
        comma(String(doseInput?.props.value)),
      );
    }
  });
});
