import { describe, expect, it } from 'vitest';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import { getBolusDrug } from '../../src/shared/clinical-tools/pediatrics/bolus-drugs';
import { getPediatricInfusion } from '../../src/shared/clinical-tools/pediatrics/infusions';
import { PEDIATRIC_SCENARIOS } from '../../src/shared/clinical-tools/pediatrics/scenarios';
import {
  accessEquipment,
  compressionDepth,
  CPR_PARAMETERS,
  defibrillationEnergy,
  fluidVolumes,
  IOT_CHECKLIST,
  minimumSystolicPressure,
  REVERSIBLE_CAUSES,
  TRANSFUSION_COMPONENTS,
  transfusionVolumes,
  VITAL_SIGN_AGES,
  VITAL_SIGNS,
} from '../../src/shared/clinical-tools/pediatrics/support';
import {
  estimateWeightFromAge,
  estimateWeightFromLength,
  LENGTH_WEIGHT_BANDS,
} from '../../src/shared/clinical-tools/pediatrics/weight';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';
import {
  childTexts,
  fullText,
  loadHetrin,
  loadPedGuide,
  renderPedGuide,
} from './pediatria-reference';

/**
 * CC-320 — cenários, apoio da PCR (desfibrilação, profundidade, causas),
 * checklist de intubação, fluidos, transfusão e sinais vitais conferidos
 * contra o PedGuide v4 congelado, e o peso estimado pela idade e pelo
 * comprimento e os acessos e drenos contra o HETRIN Ped v1.1.7 congelado
 * (tests/any-reference). Mesmas entradas, mesmas saídas; o ponto decimal do
 * ANY vira vírgula (ADR-017).
 */

const SEED = 20261016;
const reference = loadPedGuide();
const { internals } = reference;
const hetrin = loadHetrin();

function randomWeights(count: number): number[] {
  const random = seededRandom(SEED);
  const weights = [0.5, 1, 9.9, 10, 10.1, 19.9, 20, 20.1, 29.9, 30, 30.1, 50];
  for (let index = 0; index < count; index += 1) weights.push(random.onGrid(0.5, 50, 0.1));
  return weights;
}

describe('cenários × PedGuide v4', () => {
  it('são os 7 do ANY, na mesma ordem, com as mesmas drogas, infusões e blocos', () => {
    const anyEntries = Object.entries(internals.SCENARIO_CONFIGS);
    expect(PEDIATRIC_SCENARIOS.map(({ anyKey }) => anyKey)).toEqual(anyEntries.map(([key]) => key));
    for (const scenario of PEDIATRIC_SCENARIOS) {
      const config = internals.SCENARIO_CONFIGS[scenario.anyKey];
      expect(
        {
          title: scenario.title,
          desc: scenario.description,
          highlight: scenario.drugs,
          infusionHighlight: scenario.infusions,
          checklist: scenario.checklist ?? false,
          fluids: scenario.fluids ?? false,
        },
        scenario.id,
      ).toEqual({
        title: config?.title,
        desc: config?.desc,
        highlight: config?.highlight,
        infusionHighlight: config?.infusionHighlight,
        checklist: config?.checklist ?? false,
        fluids: config?.fluids ?? false,
      });
    }
  });

  it('todo id de cenário aponta para droga e infusão que existem no motor', () => {
    for (const scenario of PEDIATRIC_SCENARIOS) {
      for (const id of scenario.drugs) expect(getBolusDrug(id), id).toBeDefined();
      for (const id of scenario.infusions) expect(getPediatricInfusion(id), id).toBeDefined();
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('a tela do cenário do ANY mostra as mesmas drogas e infusões', () => {
    for (const scenario of PEDIATRIC_SCENARIOS) {
      const text = fullText(
        renderPedGuide(reference, { pesoRaw: '12', view: 'cenario', scenarioKey: scenario.anyKey }),
      );
      for (const id of scenario.drugs) expect(text, scenario.id).toContain(getBolusDrug(id)?.name);
      for (const id of scenario.infusions) {
        expect(text, scenario.id).toContain(getPediatricInfusion(id)?.name);
      }
      expect(text.includes('Checklist de intubação'), scenario.id).toBe(
        scenario.checklist ?? false,
      );
      expect(text.includes('Fluidos e volumes'), scenario.id).toBe(scenario.fluids ?? false);
    }
  });
});

describe('PCR pediátrica × PedGuide v4', () => {
  it('tem os mesmos parâmetros de RCP, causas reversíveis e checklist de intubação', () => {
    const pcr = renderPedGuide(reference, { pesoRaw: '12', view: 'pcr' });
    expect(childTexts(pcr, 'FREQUÊNCIA').slice(1)).toEqual([CPR_PARAMETERS[0]?.value]);
    expect(childTexts(pcr, 'C:V — 2 SOCORRISTAS').slice(1)).toEqual([
      CPR_PARAMETERS[1]?.value,
      CPR_PARAMETERS[1]?.note,
    ]);
    expect(childTexts(pcr, 'COM TOT').slice(1)).toEqual([
      CPR_PARAMETERS[2]?.value,
      CPR_PARAMETERS[2]?.note,
    ]);
    expect(REVERSIBLE_CAUSES.h).toEqual(internals.CAUSES_6H);
    expect(REVERSIBLE_CAUSES.t).toEqual(internals.CAUSES_6T);
    expect(IOT_CHECKLIST.map(({ text }) => text)).toEqual(
      internals.IOT_CHECKLIST_ITEMS.map(({ text }) => text),
    );
    const anyKeys: Record<string, string> = {
      lâmina: 'blade',
      tubo: 'tube',
      bougie: 'bougie',
      lma: 'laryngealMask',
    };
    expect(IOT_CHECKLIST.map(({ equipment }) => equipment ?? null)).toEqual(
      internals.IOT_CHECKLIST_ITEMS.map(({ valueKey }) => (valueKey ? anyKeys[valueKey] : null)),
    );
  });

  it('dá a mesma profundidade, desfibrilação e cardioversão em 1.000 pesos', () => {
    const mismatches: unknown[] = [];
    for (const kg of randomWeights(DIFFERENTIAL_CASES)) {
      const pcr = renderPedGuide(reference, { pesoRaw: String(kg), view: 'pcr' });
      const energy = defibrillationEnergy(kg);
      const expected = {
        depth: childTexts(pcr, 'PROFUNDIDADE')[1],
        first: childTexts(pcr, '1ª Desfibrilação (2 J/kg)')[1],
        second: childTexts(pcr, '2ª Desfibrilação (4 J/kg)')[1],
        cardioversion: childTexts(pcr, 'Cardioversão (0,5-1 J/kg)')[1],
        refractory: childTexts(pcr, 'Cardioversão (0,5-1 J/kg)')[3],
      };
      const received = {
        depth: compressionDepth(kg),
        first: String(energy.first),
        second: String(energy.second),
        cardioversion: energy.cardioversion.join('-'),
        refractory: `refratária: 2 J/kg (${energy.refractory} J)`,
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ kg, expected, received });
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});

describe('fluidos, transfusão e sinais vitais × PedGuide v4', () => {
  it('dá os mesmos volumes em 1.000 pesos', () => {
    const mismatches: unknown[] = [];
    for (const kg of randomWeights(DIFFERENTIAL_CASES)) {
      const tree = renderPedGuide(reference, { pesoRaw: String(kg), view: 'calculadoras' });
      const fluids = fluidVolumes(kg);
      const expected = {
        bolus: childTexts(tree, 'Bolus Cristaloide')[1],
        maintenance: childTexts(tree, 'Manutenção/hora')[1],
        bloodVolume: childTexts(tree, 'Volemia Estimada')[1],
        transfusion: TRANSFUSION_COMPONENTS.map(({ name }) => childTexts(tree, name).slice(1)),
      };
      const received = {
        bolus: formatDecimal(fluids.bolusMl, 0),
        maintenance: formatDecimal(fluids.maintenanceMlPerHour, 0),
        bloodVolume: formatDecimal(fluids.bloodVolumeMl, 0),
        transfusion: TRANSFUSION_COMPONENTS.map((component) => {
          const [low, high] = transfusionVolumes(kg, component);
          return [component.dose, `${formatDecimal(low, 0)}-${formatDecimal(high, 0)} mL`];
        }),
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ kg, expected, received });
      }
      if (!fullText(tree).includes(`Volemia estimada (80 mL/kg): ${received.bloodVolume} mL`)) {
        mismatches.push({ kg, massiveTransfusion: received.bloodVolume });
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it('tem a mesma tabela de sinais vitais e a mesma PAS mínima em toda idade de 0 a 18 anos', () => {
    expect([...VITAL_SIGN_AGES]).toEqual(internals.VITAL_COLS);
    expect(VITAL_SIGNS).toEqual(internals.VITAL_ROWS);
    for (let step = 0; step <= 1800; step += 1) {
      const age = step / 100;
      expect(minimumSystolicPressure(age), `${age} anos`).toBe(internals.pasMinima(age));
    }
  });
});

describe('peso estimado e acessos × HETRIN Ped v1.1.7', () => {
  it('tem as mesmas 29 faixas de comprimento', () => {
    expect(LENGTH_WEIGHT_BANDS).toEqual(hetrin.ALTURA_PESO);
  });

  it('dá o mesmo peso por comprimento de 40 a 160 cm, de 0,1 em 0,1 cm', () => {
    for (let step = 400; step <= 1600; step += 1) {
      const cm = step / 10;
      // O campo do HETRIN arredonda o cm antes de procurar a faixa.
      expect(estimateWeightFromLength(cm), `${cm} cm`).toBe(hetrin.pesoPorAltura(Math.round(cm)));
    }
  });

  it('dá o mesmo peso por idade de 0 a 18 anos, de 0,01 em 0,01, e em 1.000 idades aleatórias', () => {
    const random = seededRandom(SEED);
    const ages = Array.from({ length: 1801 }, (_, step) => step / 100);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) ages.push(random.next() * 18);
    for (const age of ages) {
      expect(estimateWeightFromAge(age), `${age} anos`).toBe(hetrin.estimatePesoByAge(age));
    }
  });

  it('dá os mesmos acessos e drenos em todas as combinações de peso e idade', () => {
    const mismatches: unknown[] = [];
    const ages: (number | null)[] = [null];
    for (let step = 0; step <= 36; step += 1) ages.push(step / 2);
    for (let step = 1; step <= 100; step += 1) {
      const kg = step / 2;
      for (const age of ages) {
        const expected = hetrin.extraEquipment(kg, age);
        const ours = accessEquipment(kg, age);
        const received = ours && {
          cvc: ours.centralVenousCatheter,
          dreno: ours.chestDrain,
          jelcoTorax: ours.needleDecompression,
          jelcoPa: ours.arterialLine,
          svd: ours.urinaryCatheter,
        };
        if (JSON.stringify(expected) !== JSON.stringify(received)) {
          mismatches.push({ kg, age, expected, received });
        }
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});
