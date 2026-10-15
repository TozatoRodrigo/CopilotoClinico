import { describe, expect, it } from 'vitest';
import {
  computeWeightBasedDose,
  formatQuantity,
  parseDecimal,
  readWeightKg,
  type WeightReading,
} from './weight-dose';

const kg = (value: number): WeightReading => ({ status: 'found', kg: value });

describe('readWeightKg (CC-501)', () => {
  it('lê o peso escrito na pergunta, com vírgula ou ponto', () => {
    expect(readWeightKg('adrenalina IM na anafilaxia em criança de 20 kg')).toEqual(kg(20));
    expect(readWeightKg('lactente de 7,5kg com bronquiolite')).toEqual(kg(7.5));
    expect(readWeightKg('pesando 3.2 quilos')).toEqual(kg(3.2));
  });

  it('não confunde a unidade da dose com o peso', () => {
    expect(readWeightKg('dose de 0,01 mg/kg de adrenalina')).toEqual({ status: 'none' });
  });

  it('dois pesos diferentes ou "1.500" não viram conta', () => {
    expect(readWeightKg('criança de 20 kg, ou 25 kg?')).toEqual({ status: 'ambiguous' });
    expect(readWeightKg('recém-nascido de 1.500 kg')).toEqual({ status: 'ambiguous' });
  });

  it('o mesmo peso repetido é um peso só', () => {
    expect(readWeightKg('20 kg ... confirmo 20 kg')).toEqual(kg(20));
  });

  it('fora de 0,5–200 kg não calcula', () => {
    expect(readWeightKg('paciente de 250 kg')).toEqual({ status: 'out_of_range' });
    expect(readWeightKg('0,2 kg')).toEqual({ status: 'out_of_range' });
  });
});

describe('parseDecimal / formatQuantity', () => {
  it('aceita vírgula e ponto e recusa o milhar ambíguo', () => {
    expect(parseDecimal('0,01')).toBe(0.01);
    expect(parseDecimal('2.5')).toBe(2.5);
    expect(parseDecimal('1.500')).toBeNull();
    expect(parseDecimal('1–2')).toBeNull();
  });

  it('escreve como no prontuário: vírgula, sem milhar, até três casas', () => {
    expect(formatQuantity(0.2)).toBe('0,2');
    expect(formatQuantity(0.15 * 23)).toBe('3,45');
    expect(formatQuantity(1234.5)).toBe('1234,5');
    expect(formatQuantity(0.075)).toBe('0,075');
  });
});

describe('computeWeightBasedDose (CC-501)', () => {
  const adrenaline = { amount: '0,01 mg/kg', maxDose: '0,5 mg' };

  it('multiplica a dose por kg do cartão pelo peso da pergunta', () => {
    expect(computeWeightBasedDose(adrenaline, kg(20))).toEqual({
      status: 'computed',
      weightKg: 20,
      perKg: '0,01 mg/kg',
      total: '0,2 mg',
      cappedAtMaxDose: false,
    });
  });

  it('limita ao teto do cartão', () => {
    expect(computeWeightBasedDose(adrenaline, kg(70))).toMatchObject({
      status: 'computed',
      total: '0,5 mg',
      cappedAtMaxDose: true,
    });
  });

  it('dose sem "por kg" não depende do peso', () => {
    expect(computeWeightBasedDose({ amount: '2 g', maxDose: '4 g/dia' }, kg(70))).toEqual({
      status: 'not_weight_based',
    });
  });

  it('dose por kg sem peso na pergunta pede o peso', () => {
    expect(computeWeightBasedDose(adrenaline, { status: 'none' })).toEqual({
      status: 'needs_weight',
    });
  });

  it('dose por kg por tempo não calcula', () => {
    expect(computeWeightBasedDose({ amount: '0,1 mcg/kg/min', maxDose: null }, kg(70))).toEqual({
      status: 'not_computed',
      reason: 'rate_or_daily',
    });
    expect(computeWeightBasedDose({ amount: '100 mg/kg/dia', maxDose: null }, kg(20))).toEqual({
      status: 'not_computed',
      reason: 'rate_or_daily',
    });
  });

  it('faixa ou texto livre na dose não calcula', () => {
    expect(computeWeightBasedDose({ amount: '0,01 a 0,02 mg/kg', maxDose: null }, kg(20))).toEqual({
      status: 'not_computed',
      reason: 'unparsed_amount',
    });
  });

  it('teto em outra unidade ou por dia não limita: não calcula', () => {
    expect(computeWeightBasedDose({ amount: '15 mg/kg', maxDose: '1 g' }, kg(20))).toEqual({
      status: 'not_computed',
      reason: 'max_dose_not_comparable',
    });
    expect(computeWeightBasedDose({ amount: '15 mg/kg', maxDose: '4 g/dia' }, kg(20))).toEqual({
      status: 'not_computed',
      reason: 'max_dose_not_comparable',
    });
  });

  it('aceita "por kg", "por dose" no teto e µg como mcg', () => {
    expect(
      computeWeightBasedDose({ amount: '1 mcg por kg', maxDose: '50 µg por dose' }, kg(70)),
    ).toMatchObject({ status: 'computed', total: '50 mcg', cappedAtMaxDose: true });
    expect(computeWeightBasedDose({ amount: '20 mL/kg', maxDose: null }, kg(12.5))).toMatchObject({
      status: 'computed',
      total: '250 mL',
    });
  });

  it('peso ambíguo ou fora da faixa não calcula', () => {
    expect(computeWeightBasedDose(adrenaline, { status: 'ambiguous' })).toEqual({
      status: 'not_computed',
      reason: 'ambiguous_weight',
    });
    expect(computeWeightBasedDose(adrenaline, { status: 'out_of_range' })).toEqual({
      status: 'not_computed',
      reason: 'weight_out_of_range',
    });
  });
});
