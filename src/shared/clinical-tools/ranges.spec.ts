import { describe, expect, it } from 'vitest';
import { describeRange, validateNumber, validateWeight, WEIGHT_RANGES } from './ranges';

describe('validateWeight', () => {
  it('adulto aceita de 40 a 200 kg, limites incluídos', () => {
    expect(validateWeight('40', 'adulto')).toEqual({ ok: true, value: 40 });
    expect(validateWeight('200', 'adulto')).toEqual({ ok: true, value: 200 });
    expect(validateWeight('72,5', 'adulto')).toEqual({ ok: true, value: 72.5 });
  });

  it('adulto fora da faixa é erro, com a faixa na mensagem', () => {
    for (const raw of ['39,9', '200,1', '0', '-70']) {
      const result = validateWeight(raw, 'adulto');
      expect(result.ok, raw).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('out-of-range');
        expect(result.error.message).toBe('Fora da faixa aceita: 40 a 200 kg.');
      }
    }
  });

  it('pediátrico aceita de 0,5 a 50 kg', () => {
    expect(validateWeight('0,5', 'pediatrico')).toEqual({ ok: true, value: 0.5 });
    expect(validateWeight('50', 'pediatrico')).toEqual({ ok: true, value: 50 });
    const below = validateWeight('0,4', 'pediatrico');
    const above = validateWeight('50,1', 'pediatrico');
    expect(below.ok).toBe(false);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error.message).toBe('Fora da faixa aceita: 0,5 a 50 kg.');
  });

  it('expõe as faixas do ANY', () => {
    expect(WEIGHT_RANGES.adulto).toMatchObject({ min: 40, max: 200, unit: 'kg' });
    expect(WEIGHT_RANGES.pediatrico).toMatchObject({ min: 0.5, max: 50, unit: 'kg' });
  });
});

describe('validateNumber', () => {
  const range = { min: 30, max: 250, unit: 'bpm' };

  it('separa vazio, texto inválido, milhar ambíguo e fora da faixa', () => {
    const cases = [
      ['', 'empty'],
      ['abc', 'not-a-number'],
      ['1.500', 'ambiguous-separator'],
      ['251', 'out-of-range'],
    ] as const;
    for (const [raw, kind] of cases) {
      const result = validateNumber(raw, range);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) {
        expect(result.error.kind, raw).toBe(kind);
        expect(result.error.message.length, raw).toBeGreaterThan(0);
      }
    }
  });

  it('descreve a faixa com vírgula e unidade', () => {
    expect(describeRange(range)).toBe('30 a 250 bpm');
    expect(describeRange({ min: 0.5, max: 2.25, unit: 'mg/kg' })).toBe('0,5 a 2,25 mg/kg');
  });
});
