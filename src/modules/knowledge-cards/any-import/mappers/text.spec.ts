import { describe, expect, it } from 'vitest';
import { doseFromLine, splitMax, splitRepeat, splitRoute, splitSentences } from './text';

/** CC-405 — a dose estruturada é pedaço literal da linha do ANY, nunca reescrita. */
describe('doseFromLine', () => {
  it.each([
    [
      'Naloxona — Dose inicial: 0,04 a 0,4 mg IV (iniciar com dose baixa)',
      '0,04 a 0,4 mg',
      'IV',
      null,
    ],
    ['Naloxona — Dose inicial: Se sem resposta: até 2 mg IV', 'até 2 mg', 'IV', null],
    ['Fomepizol — Manutenção: 10 mg/kg a cada 12h', '10 mg/kg', null, 'a cada 12h'],
    ['Atropina — Dose: 1-2 mg IV (adultos) = 4-8 ampolas', '1-2 mg', 'IV', null],
    ['Flumazenil — Dose: Repetir 0,3 mg após 30s se sem resposta', '0,3 mg', null, null],
    ['Gluconato: 10 mL IV (1 g) — preferir via central', '10 mL', 'IV', null],
  ])('%s', (line, amount, route, frequency) => {
    expect(doseFromLine(line)).toEqual({ amount, route, frequency });
  });

  it('linha sem dose, de limite ou de diluição não tem dose estruturada', () => {
    expect(doseFromLine('Naloxona — Indicação: depressão respiratória')).toBeNull();
    expect(doseFromLine('Flumazenil — Dose: Máximo: 3-5 mg')).toBeNull();
    expect(doseFromLine('Azul — Dose: Repetir em 1h se necessário (máx 7 mg/kg)')).toBeNull();
    expect(doseFromLine('Azul — Dose: Diluir em SF 50-100 mL')).toBeNull();
  });
});

describe('separadores de campo', () => {
  it('via, teto entre parênteses e repetição até o máximo', () => {
    expect(splitRoute('0,2 mg/kg IV')).toEqual({ amount: '0,2 mg/kg', route: 'IV' });
    expect(splitRoute('1 mg IV/IO')).toEqual({ amount: '1 mg', route: 'IV/IO' });
    expect(splitRoute('15 mg/kg')).toEqual({ amount: '15 mg/kg', route: null });
    expect(splitMax('60 UI/kg (máx 4.000 UI)')).toEqual({
      amount: '60 UI/kg',
      maxDose: '4.000 UI',
    });
    expect(splitRepeat('5/5 min até máx 20 mg')).toEqual({
      frequency: '5/5 min',
      maxDose: '20 mg',
    });
    expect(splitRepeat('3-5 min até resposta')).toEqual({
      frequency: '3-5 min até resposta',
      maxDose: null,
    });
  });

  it('texto longo quebra entre frases, sem cortar frase', () => {
    const sentence = `${'a'.repeat(300)}.`;
    const lines = splitSentences(`${sentence} B ${'b'.repeat(300)}.`);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length <= 480)).toBe(true);
  });
});
