import { describe, expect, it } from 'vitest';
import { PEDIATRIC_SCENARIOS, getPediatricScenario } from './scenarios';
import {
  accessEquipment,
  compressionDepth,
  defibrillationEnergy,
  fluidVolumes,
  MASSIVE_TRANSFUSION,
  minimumSystolicPressure,
  TRANSFUSION_COMPONENTS,
  transfusionVolumes,
} from './support';

/** Casos de referência com os números do PedGuide v4 e do HETRIN (CC-320). */
describe('apoio da emergência pediátrica (CC-320)', () => {
  it('desfibrilação 2 → 4 J/kg e cardioversão 0,5–1 → 2 J/kg', () => {
    expect(defibrillationEnergy(12)).toEqual({
      first: 24,
      second: 48,
      cardioversion: [6, 12],
      refractory: 24,
    });
  });

  it('profundidade da compressão muda aos 10 e aos 30 kg', () => {
    expect(compressionDepth(9.9)).toBe('1/3 AP (~4cm)');
    expect(compressionDepth(10)).toBe('1/3 AP (~5cm)');
    expect(compressionDepth(30)).toBe('5-6 cm');
  });

  it('fluidos: 20 mL/kg, Holliday-Segar e volemia de 80 mL/kg', () => {
    expect(fluidVolumes(15)).toEqual({
      bolusMl: 300,
      maintenanceMlPerHour: 50,
      bloodVolumeMl: 1200,
    });
  });

  it('transfusão por hemocomponente e o protocolo maciço em forma de sugestão', () => {
    const [redCells] = TRANSFUSION_COMPONENTS;
    if (!redCells) throw new Error('sem concentrado de hemácias');
    expect(transfusionVolumes(20, redCells)).toEqual([200, 300]);
    expect(MASSIVE_TRANSFUSION.trigger).toMatch(/^Considere/);
  });

  it('PAS mínima: 70 + 2 × idade, piso de 90 mmHg acima de 10 anos', () => {
    expect(minimumSystolicPressure(0)).toBe(70);
    expect(minimumSystolicPressure(4)).toBe(78);
    expect(minimumSystolicPressure(10)).toBe(90);
    expect(minimumSystolicPressure(12)).toBe(90);
  });

  it('acessos e drenos pedem a idade e mudam pelo peso e pela idade', () => {
    expect(accessEquipment(12, null)).toBeNull();
    expect(accessEquipment(2.5, 0.1)).toMatchObject({ centralVenousCatheter: '3 Fr/24G' });
    expect(accessEquipment(20, 6)).toEqual({
      centralVenousCatheter: '5 Fr/18G',
      chestDrain: '20-28',
      needleDecompression: '16',
      arterialLine: '22',
      urinaryCatheter: '10-12',
    });
  });
});

describe('linguagem (ADR-017)', () => {
  it('cenários e apoio sugerem em vez de mandar', () => {
    const imperative =
      /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;
    const texts = [
      ...PEDIATRIC_SCENARIOS.flatMap(({ title, description }) => [title, description]),
      MASSIVE_TRANSFUSION.trigger,
      MASSIVE_TRANSFUSION.ratio,
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(imperative);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });
});

describe('cenários (CC-320)', () => {
  it('são sete, com id de URL único e sinônimos', () => {
    expect(PEDIATRIC_SCENARIOS).toHaveLength(7);
    const ids = PEDIATRIC_SCENARIOS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(7);
    expect(getPediatricScenario('anafilaxia')?.drugs).toEqual([
      'epinefrina-im',
      'hidrocortisona',
      'difenidramina',
    ]);
    expect(getPediatricScenario('iot-isr')?.checklist).toBe(true);
    expect(getPediatricScenario('choque')?.fluids).toBe(true);
    expect(getPediatricScenario('nao-existe')).toBeUndefined();
  });
});
