import { describe, expect, it } from 'vitest';
import {
  checkCustomDilution,
  CUSTOM_DILUTION_LIMITS,
  describePreparation,
  parseStoredCustomDilution,
} from './custom-dilution';
import { getInfusionDrug, type InfusionDrug } from './drugs';

function drug(id: string): InfusionDrug {
  const found = getInfusionDrug(id);
  if (!found) throw new Error(`droga ${id} ausente`);
  return found;
}

describe('checkCustomDilution', () => {
  const midazolam = drug('midazolam');

  it('aceita o preparo do serviço e calcula a concentração (vírgula ou ponto)', () => {
    expect(checkCustomDilution(midazolam, '5', '250')).toEqual({
      status: 'valida',
      dilution: { ampoules: 5, volume: 250, concentration: 1 },
    });
    expect(checkCustomDilution(midazolam, '2,5', '125')).toMatchObject({
      status: 'valida',
      dilution: { concentration: 1 },
    });
  });

  it('pede ampolas e volume, na ordem do ANY', () => {
    expect(checkCustomDilution(midazolam, '', '250')).toEqual({
      status: 'incompleta',
      message: 'Informe quantas ampolas.',
    });
    expect(checkCustomDilution(midazolam, '0', '250').status).toBe('incompleta');
    expect(checkCustomDilution(midazolam, '5', '')).toEqual({
      status: 'incompleta',
      message: 'Informe o volume final em mL.',
    });
    // "1.000" é ambíguo (milhar ou decimal): não vira conta.
    expect(checkCustomDilution(midazolam, '5', '1.000').status).toBe('incompleta');
  });

  it('barra volume final menor que o volume das próprias ampolas', () => {
    expect(checkCustomDilution(midazolam, '5', '40')).toEqual({
      status: 'barrada',
      message: 'O volume final não pode ser menor que o volume das ampolas (50 mL).',
      ampoules: 5,
      volume: 40,
      concentration: 6.25,
    });
  });

  it(`barra mais de ${CUSTOM_DILUTION_LIMITS.maxRatio}× e menos de ${CUSTOM_DILUTION_LIMITS.minRatio}× a concentração padrão`, () => {
    const nora = drug('noradrenalina');
    // 20 ampolas de 4 mg em 250 mL = 320 mcg/mL = 5× o padrão de 64.
    expect(checkCustomDilution(nora, '20', '250')).toMatchObject({
      status: 'barrada',
      message:
        'Resultado de 320 mcg/mL — mais de 4 vezes o padrão de 64 mcg/mL. Confira as ampolas e o volume.',
    });
    // 1 ampola em 2.000 mL = 2 mcg/mL < 3,2 (0,05 × 64).
    expect(checkCustomDilution(nora, '1', '2000')).toMatchObject({
      status: 'barrada',
      message:
        'Resultado de 2 mcg/mL — muito abaixo do padrão de 64 mcg/mL. Confira o volume final.',
    });
    // Limites exatos passam: 4× e 0,05×.
    expect(checkCustomDilution(nora, '16', '250').status).toBe('valida');
    expect(checkCustomDilution(nora, '1', '1250').status).toBe('valida');
  });

  it('aceita a diluição do fentanil (puro no padrão) que a trava simétrica barrava no ANY', () => {
    // 4 ampolas de 500 mcg em 250 mL = 8 mcg/mL = 0,16× o padrão.
    expect(checkCustomDilution(drug('fentanil'), '4', '250')).toMatchObject({
      status: 'valida',
      dilution: { concentration: 8 },
    });
  });

  it('pula a trava de volume mínimo quando a ampola não declara volume (nitroprussiato)', () => {
    expect(checkCustomDilution(drug('nitroprussiato'), '1', '100').status).toBe('valida');
  });

  it('não oferece diluição própria para o propofol (puro, não diluir)', () => {
    expect(checkCustomDilution(drug('propofol'), '1', '100').status).toBe('incompleta');
  });
});

describe('describePreparation', () => {
  it('escreve o preparo por extenso, sem arredondar ampola fracionada', () => {
    const midazolam = drug('midazolam');
    expect(describePreparation(midazolam, 5, 250)).toBe('5 ampolas de 50 mg / 10 mL em 250 mL');
    expect(describePreparation(midazolam, 1, 100)).toBe('1 ampola de 50 mg / 10 mL em 100 mL');
    expect(describePreparation(midazolam, 2.5, 125)).toBe('2,5 ampolas de 50 mg / 10 mL em 125 mL');
  });
});

describe('parseStoredCustomDilution', () => {
  const nora = drug('noradrenalina');

  it('lê o que foi salvo e recalcula a concentração pela ampola', () => {
    expect(
      parseStoredCustomDilution(
        nora,
        JSON.stringify({ ampoules: 8, volume: 250, concentration: 1 }),
      ),
    ).toEqual({ ampoules: 8, volume: 250, concentration: 128 });
  });

  it('descarta lixo, formato antigo e preparo fora da trava', () => {
    expect(parseStoredCustomDilution(nora, null)).toBeNull();
    expect(parseStoredCustomDilution(nora, '{')).toBeNull();
    expect(parseStoredCustomDilution(nora, '"texto"')).toBeNull();
    expect(parseStoredCustomDilution(nora, JSON.stringify({ concentration: 64 }))).toBeNull();
    expect(
      parseStoredCustomDilution(nora, JSON.stringify({ ampoules: 50, volume: 250 })),
    ).toBeNull();
    expect(
      parseStoredCustomDilution(drug('propofol'), JSON.stringify({ ampoules: 1, volume: 10 })),
    ).toBeNull();
  });
});
