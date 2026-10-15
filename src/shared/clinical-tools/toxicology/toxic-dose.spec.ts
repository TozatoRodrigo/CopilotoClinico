import { describe, expect, it } from 'vitest';
import { validateNumber } from '../ranges';
import {
  assessToxicDose,
  buildToxicDoseChartNote,
  findToxicDose,
  formatIngestedDose,
  formatToxicDose,
  INGESTED_AMOUNT_RANGE,
  searchToxicDoses,
  toxicDoseBandText,
  toxicDosePercentText,
  TOXIC_DOSE_WEIGHT_RANGE,
} from './toxic-dose';
import { TOXIC_DOSES, type ToxicDoseEntry } from './toxic-doses';

function entry(id: string): ToxicDoseEntry {
  const found = findToxicDose(id);
  if (!found) throw new Error(`${id} fora da tabela`);
  return found;
}

describe('tabela de doses tóxicas (CC-324)', () => {
  it('tem as 242 entradas do legado, ids únicos, todas em mg/kg e com revisão pendente', () => {
    expect(TOXIC_DOSES).toHaveLength(242);
    expect(new Set(TOXIC_DOSES.map(({ id }) => id)).size).toBe(242);
    for (const drug of TOXIC_DOSES) {
      expect(drug.unit).toBe('mg/kg');
      expect(drug.toxicDose).toBeGreaterThan(0);
      expect(drug.halfLife).not.toBe('');
      expect(drug.review).toEqual({ status: 'pendente' });
    }
  });

  it('inclui as que o v2 não tinha (amobarbital, azitromicina, bisoprolol, buprenorfina, candesartana)', () => {
    for (const id of [
      'amobarbital',
      'azitromicina',
      'bisoprolol',
      'buprenorfina',
      'candesartana',
    ]) {
      expect(findToxicDose(id), id).toBeDefined();
    }
  });

  it('mostra a dose com todas as casas da tabela', () => {
    expect(formatToxicDose(entry('olodaterol'))).toBe('0,00035 mg/kg');
    expect(formatToxicDose(entry('aas'))).toBe('100 mg/kg');
    expect(formatToxicDose(entry('acemetacina'))).toBe('8,5 mg/kg');
  });
});

describe('busca por nome e sinônimo', () => {
  it('sem acento e sem caixa, pelo nome e pelo nome comercial', () => {
    expect(searchToxicDoses('valproico').map(({ id }) => id)).toContain('acido-valproico');
    expect(searchToxicDoses('DEPAKENE').map(({ id }) => id)).toEqual(['acido-valproico']);
    expect(searchToxicDoses('rivotril').map(({ id }) => id)).toEqual(['clonazepam']);
    expect(searchToxicDoses('acetaminofeno').map(({ id }) => id)).toEqual(['paracetamol']);
  });

  it('nome que começa com a busca vem antes', () => {
    const results = searchToxicDoses('lit').map(({ id }) => id);
    expect(results[0]).toBe('litio');
    expect(results).toContain('carbonato-de-litio');
  });

  it('só busca a partir de 2 letras', () => {
    expect(searchToxicDoses('a')).toEqual([]);
    expect(searchToxicDoses(' ')).toEqual([]);
    expect(searchToxicDoses('xyzw')).toEqual([]);
  });
});

describe('dose ingerida ÷ dose tóxica', () => {
  const paracetamol = entry('paracetamol');

  it('paracetamol 75 mg/kg: 70 kg com 5.250 mg é 1,0x, acima', () => {
    const assessment = assessToxicDose(paracetamol, 70, 5250);
    expect(formatIngestedDose(assessment)).toBe('75,00 mg/kg');
    expect(assessment.band).toMatchObject({ id: 'acima', tone: 'critical' });
    expect(toxicDoseBandText(assessment)).toBe('Acima da dose tóxica (1,0x)');
    expect(toxicDosePercentText(assessment)).toBe('100% da dose tóxica');
  });

  it('50% já é "próximo" e abaixo disso é "abaixo"', () => {
    expect(assessToxicDose(paracetamol, 70, 2625).band).toMatchObject({
      id: 'proximo',
      tone: 'attention',
    });
    expect(assessToxicDose(paracetamol, 70, 2624).band).toMatchObject({
      id: 'abaixo',
      tone: 'neutral',
    });
  });

  it('faixas de entrada: peso 0,5–300 kg e quantidade 0,0001–1.000.000 mg', () => {
    expect(validateNumber('0,4', TOXIC_DOSE_WEIGHT_RANGE).ok).toBe(false);
    expect(validateNumber('300', TOXIC_DOSE_WEIGHT_RANGE).ok).toBe(true);
    expect(validateNumber('0', INGESTED_AMOUNT_RANGE).ok).toBe(false);
    expect(validateNumber('0,0001', INGESTED_AMOUNT_RANGE).ok).toBe(true);
    expect(validateNumber('1000001', INGESTED_AMOUNT_RANGE).ok).toBe(false);
  });

  it('texto para o prontuário com a dose, a faixa, a meia-vida e a revisão da entrada', () => {
    const note = buildToxicDoseChartNote(assessToxicDose(entry('nifedipina'), 60, 144));
    expect(note).toContain('Dose ingerida de Nifedipina: 2,40 mg/kg (144 mg para 60 kg).');
    expect(note).toContain(
      'Acima da dose tóxica (2,0x): 200% da dose tóxica (dose tóxica de referência 1,2 mg/kg).',
    );
    expect(note).toContain('Meia-vida: 3,5/11 hs (liberação retardada).');
    expect(note).toContain('revisão clínica pendente');
  });
});
