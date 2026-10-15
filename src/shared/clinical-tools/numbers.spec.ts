import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatDecimal,
  formatQuantity,
  formatWeight,
  parseDecimal,
} from './numbers';

describe('parseDecimal', () => {
  it('aceita vírgula ou ponto como separador decimal', () => {
    expect(parseDecimal('72,5')).toEqual({ ok: true, value: 72.5 });
    expect(parseDecimal('72.5')).toEqual({ ok: true, value: 72.5 });
    expect(parseDecimal(' 72 ')).toEqual({ ok: true, value: 72 });
    expect(parseDecimal('0,5')).toEqual({ ok: true, value: 0.5 });
    expect(parseDecimal(',5')).toEqual({ ok: true, value: 0.5 });
    expect(parseDecimal('-3,2')).toEqual({ ok: true, value: -3.2 });
  });

  it('aceita o separador no fim enquanto o médico ainda digita', () => {
    expect(parseDecimal('72,')).toEqual({ ok: true, value: 72 });
  });

  it('distingue campo vazio de texto que não é número', () => {
    expect(parseDecimal('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseDecimal('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseDecimal('abc')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDecimal('7O')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDecimal('1 500')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDecimal('1.500,5')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDecimal('1e3')).toEqual({ ok: false, reason: 'not-a-number' });
  });

  it('recusa ponto que parece separador de milhar em vez de ler mil vezes menos', () => {
    // "1.500" é 1500 para quem digita em português; parseFloat leria 1,5.
    expect(parseDecimal('1.500')).toEqual({ ok: false, reason: 'ambiguous-separator' });
    expect(parseDecimal('150.000')).toEqual({ ok: false, reason: 'ambiguous-separator' });
    // Com zero à esquerda, ou com outro número de casas, o ponto só pode ser decimal.
    expect(parseDecimal('0.125')).toEqual({ ok: true, value: 0.125 });
    expect(parseDecimal('1.25')).toEqual({ ok: true, value: 1.25 });
    // Vírgula é sempre decimal.
    expect(parseDecimal('1,500')).toEqual({ ok: true, value: 1.5 });
  });
});

describe('formatDecimal', () => {
  it('usa vírgula e casas fixas', () => {
    expect(formatDecimal(10.5)).toBe('10,5');
    expect(formatDecimal(10.567, 2)).toBe('10,57');
    expect(formatDecimal(0)).toBe('0,0');
    expect(formatDecimal(1.22, 2)).toBe('1,22');
  });

  it('mostra "--" quando não há número', () => {
    expect(formatDecimal(null)).toBe('--');
    expect(formatDecimal(undefined)).toBe('--');
    expect(formatDecimal(Number.NaN)).toBe('--');
  });
});

describe('formatCompact', () => {
  it('tira zeros finais e usa vírgula', () => {
    expect(formatCompact(40)).toBe('40');
    expect(formatCompact(0.5)).toBe('0,5');
    expect(formatCompact(1.25)).toBe('1,25');
    expect(formatCompact(200.0)).toBe('200');
    expect(formatCompact(1.005, 2)).toBe('1');
  });
});

describe('formatQuantity e formatWeight', () => {
  it('sempre mostram a unidade', () => {
    expect(formatQuantity(6.5625, 'mL/h', 2)).toBe('6,56 mL/h');
    expect(formatWeight(70)).toBe('70,0 kg');
    expect(formatWeight(null)).toBe('-- kg');
    expect(formatWeight(0)).toBe('-- kg');
  });
});
