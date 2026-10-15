import { describe, expect, it } from 'vitest';
import { evaluateCalculator } from '../calculator';
import { NOMOGRAMA_RUMACK } from '../calculators/nomograma-rumack';
import { validateNumber } from '../ranges';
import {
  atropineAmpoulesText,
  atropineMaintenance,
  atropineRateText,
  ATROPINE_LOADING_RANGE,
  buildAtropineChartNote,
  buildNacChartNote,
  NAC_PRESCOTT_STAGES,
  NAC_TOTAL_MG_PER_KG,
  NAC_WEIGHT_RANGE,
  nacDoses,
  nacStageText,
  nacStageTitle,
  nacTotalText,
} from './antidote-doses';
import { ANTIDOTE_IDS, ANTIDOTES, getAntidote } from './antidotes';
import { assessRumackMatthew } from './rumack-matthew';
import { searchAntidotes } from './search';

describe('guia de antídotos (CC-323)', () => {
  it('tem os 15 do ANY: 11 disponíveis e 4 não disponíveis', () => {
    expect(ANTIDOTES.map(({ id }) => id)).toEqual([...ANTIDOTE_IDS]);
    expect(ANTIDOTES.filter(({ available }) => available)).toHaveLength(11);
    expect(ANTIDOTES.filter(({ available }) => !available).map(({ id }) => id)).toEqual([
      'pralidoxima',
      'glucagon',
      'fab-antidigoxina',
      'fisostigmina',
    ]);
  });

  it('todo antídoto tem indicação e ao menos uma seção com texto', () => {
    for (const antidote of ANTIDOTES) {
      expect(antidote.indication).not.toBe('');
      expect(antidote.sections.length).toBeGreaterThan(0);
      for (const section of antidote.sections) expect(section.lines.length).toBeGreaterThan(0);
    }
  });

  it('só a NAC e a atropina têm calculadora', () => {
    expect(ANTIDOTES.filter(({ calculator }) => calculator).map(({ id }) => id)).toEqual([
      'nac',
      'atropina',
    ]);
  });

  it('busca por nome, indicação e termo, sem acento', () => {
    expect(searchAntidotes('').length).toBe(15);
    expect(searchAntidotes('acetilcisteina').map(({ id }) => id)).toEqual(['nac']);
    expect(searchAntidotes('PARACETAMOL').map(({ id }) => id)).toEqual(['nac']);
    expect(searchAntidotes('organofosforado').map(({ id }) => id)).toEqual([
      'atropina',
      'pralidoxima',
    ]);
    expect(searchAntidotes('calcio').map(({ id }) => id)).toEqual(['gluconato']);
    expect(searchAntidotes('xyz')).toEqual([]);
  });

  it('getAntidote acha pelo id', () => {
    expect(getAntidote('naloxona').name).toBe('Naloxona');
  });
});

describe('NAC — protocolo IV de 21 h (Prescott)', () => {
  it('três etapas que somam 300 mg/kg em 21 h', () => {
    expect(NAC_PRESCOTT_STAGES.reduce((sum, { mgPerKg }) => sum + mgPerKg, 0)).toBe(
      NAC_TOTAL_MG_PER_KG,
    );
    expect(NAC_PRESCOTT_STAGES.reduce((sum, { hours }) => sum + hours, 0)).toBe(21);
  });

  it('70 kg: 10,5 g, 3,5 g e 7,0 g; total 21,0 g', () => {
    const doses = nacDoses(70);
    expect(doses.stages.map(nacStageText)).toEqual([
      '10,5 g (10500 mg) em 200 mL SF',
      '3,5 g (3500 mg) em 500 mL SF',
      '7,0 g (7000 mg) em 1000 mL SF',
    ]);
    expect(nacTotalText(doses)).toBe('Dose total: 21,0 g em 21 horas');
    expect(doses.stages.map(nacStageTitle)).toEqual([
      '1ª etapa (1 hora)',
      '2ª etapa (4 horas)',
      '3ª etapa (16 horas)',
    ]);
  });

  it('mg sem resto de ponto flutuante (o ANY mostrava 3504.9999999999995)', () => {
    expect(nacStageText(nacDoses(70.1).stages[1]!)).toBe('3,5 g (3505 mg) em 500 mL SF');
  });

  it('aceita de 20 a 250 kg, como o ANY', () => {
    expect(validateNumber('19,9', NAC_WEIGHT_RANGE).ok).toBe(false);
    expect(validateNumber('20', NAC_WEIGHT_RANGE).ok).toBe(true);
    expect(validateNumber('250', NAC_WEIGHT_RANGE).ok).toBe(true);
    expect(validateNumber('250,1', NAC_WEIGHT_RANGE).ok).toBe(false);
  });

  it('o nomograma do card da NAC é a calculadora, com a conta do motor', () => {
    for (let tenths = 40; tenths <= 240; tenths += 5) {
      const hours = tenths / 10;
      const evaluation = evaluateCalculator(NOMOGRAMA_RUMACK, {
        inputs: { hours: String(hours).replace('.', ','), level: '60' },
      });
      if (evaluation.status !== 'complete') throw new Error('nomograma sem resultado');
      const { line, aboveLine } = assessRumackMatthew(hours, 60);
      expect(evaluation.value).toBe(line);
      expect(evaluation.band.id).toBe(aboveLine ? 'acima' : 'abaixo');
    }
  });

  it('texto para o prontuário com as três etapas', () => {
    const note = buildNacChartNote(nacDoses(70));
    expect(note).toContain('N-acetilcisteína IV (Prescott, 21 h) para 70 kg:');
    expect(note).toContain('- 1ª etapa (1 hora): 10,5 g (10500 mg) em 200 mL SF');
    expect(note).toContain('Dose total: 21,0 g em 21 horas.');
  });
});

describe('atropina — manutenção', () => {
  it('20% da dose de ataque por hora, ampolas de 0,25 mg arredondadas para cima', () => {
    const result = atropineMaintenance(8);
    expect(result.mgPerHour).toBeCloseTo(1.6);
    expect(result.ampoulesPerHour).toBe(7);
    expect(atropineRateText(result)).toBe('1,60 mg/hora');
    expect(atropineAmpoulesText(result)).toBe('Aprox. 7 ampolas/hora (0,25 mg/amp)');
  });

  it('dose exata em ampolas não arredonda para cima', () => {
    expect(atropineMaintenance(5).ampoulesPerHour).toBe(4);
  });

  it('aceita de 0,01 a 1.000 mg', () => {
    expect(validateNumber('0', ATROPINE_LOADING_RANGE).ok).toBe(false);
    expect(validateNumber('0,01', ATROPINE_LOADING_RANGE).ok).toBe(true);
    expect(validateNumber('1000', ATROPINE_LOADING_RANGE).ok).toBe(true);
  });

  it('texto para o prontuário', () => {
    expect(buildAtropineChartNote(atropineMaintenance(8))).toContain(
      'Atropina — manutenção (20% da dose de ataque/hora): 1,60 mg/hora, Aprox. 7 ampolas/hora (0,25 mg/amp).',
    );
  });
});
