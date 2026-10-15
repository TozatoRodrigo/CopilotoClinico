import { describe, expect, it } from 'vitest';
import { computeBolus, describeCap, describeFloor, hollidaySegarMlPerHour } from './bolus';
import { BOLUS_DRUGS, BOLUS_GROUPS, getBolusDrug, PREPARATIONS } from './bolus-drugs';
import {
  awaitsCanonicalSource,
  CANONICAL_SOURCE_NOTICE,
  PEDIATRIC_DOSES_PROVENANCE,
} from './provenance';

function drug(id: string) {
  const found = getBolusDrug(id);
  if (!found) throw new Error(`droga ${id} não existe`);
  return found;
}

function dose(id: string, kg: number, ageYears: number | null = null) {
  return computeBolus(drug(id), { kg, ageYears });
}

describe('conteúdo das drogas em bolus (CC-319)', () => {
  it('tem as 65 drogas do PedGuide v4 nos nove grupos, sem id repetido', () => {
    expect(BOLUS_GROUPS.map(({ id, drugs }) => [id, drugs.length])).toEqual([
      ['pcr', 11],
      ['iot', 8],
      ['emergencia', 10],
      ['anticonvulsivantes', 5],
      ['neuro', 2],
      ['dor-sedacao', 5],
      ['respiratorio', 7],
      ['toxicologia', 15],
      ['anti-histaminicos', 2],
    ]);
    const ids = BOLUS_DRUGS.map(({ id }) => id);
    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
  });

  it('marca as cinco drogas "não rotineiro" do ANY', () => {
    expect(BOLUS_DRUGS.filter((candidate) => candidate.notRoutine).map(({ id }) => id)).toEqual([
      'bicarbonato',
      'calcio',
      'cloreto-calcio',
      'hidrocortisona',
      'difenidramina',
    ]);
  });

  it('só referencia preparos que existem', () => {
    for (const candidate of BOLUS_DRUGS) {
      if (candidate.preparation) expect(PREPARATIONS[candidate.preparation]).toBeDefined();
    }
  });

  it('não manda: nenhuma instrução começa com verbo de ordem nem pede "imediatamente"', () => {
    const imperative =
      /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;
    const texts = BOLUS_DRUGS.map(({ instruction }) => instruction).concat(
      BOLUS_GROUPS.flatMap(({ notice }) => (notice ? [notice] : [])),
    );
    for (const text of texts) {
      expect(text, text).not.toMatch(imperative);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });
});

describe('fonte única pendente (CC-321)', () => {
  it('as doses vêm do PedGuide v4 com revisão pendente', () => {
    expect(PEDIATRIC_DOSES_PROVENANCE.source).toContain('PedGuide');
    expect(PEDIATRIC_DOSES_PROVENANCE.review).toEqual({ status: 'pendente' });
    expect(awaitsCanonicalSource(PEDIATRIC_DOSES_PROVENANCE)).toBe(true);
    expect(CANONICAL_SOURCE_NOTICE).toBe('Doses aguardando assinatura da fonte única (CC-321).');
  });

  it('o aviso some quando a fonte é assinada, sem mexer na tela', () => {
    expect(
      awaitsCanonicalSource({
        ...PEDIATRIC_DOSES_PROVENANCE,
        review: {
          status: 'revisado',
          reviewer: 'Revisor',
          crm: '0000-GO',
          reviewedAt: '2026-12-01',
        },
      }),
    ).toBe(false);
  });
});

/**
 * Casos de referência com os números do PedGuide v4. Entram na assinatura da
 * fonte única (CC-321): se o Gustavo mudar uma dose, o caso muda junto.
 */
describe('casos de referência', () => {
  it('epinefrina IV/IO: 0,01 mg/kg da solução 0,1 mg/mL, teto 1 mg', () => {
    expect(dose('epinefrina-iv', 10)).toMatchObject({
      dose: '0,10',
      unit: 'mg',
      volume: '1,0',
      note: 'da solução 0,1 mg/mL',
      capped: false,
    });
    expect(dose('epinefrina-iv', 50)).toMatchObject({ dose: '0,50', volume: '5,0' });
    expect(describeCap(drug('epinefrina-iv'))).toBe('1 mg');
  });

  it('midazolam de indução: 0,3 mg/kg com teto de 10 mg', () => {
    expect(dose('midazolam', 20)).toMatchObject({ dose: '6,0', volume: '1,20', capped: false });
    expect(dose('midazolam', 40)).toMatchObject({ dose: '10,0', volume: '2,00', capped: true });
  });

  it('rocurônio: 1,2 mg/kg com teto de 100 mg', () => {
    expect(dose('rocuronio', 20)).toMatchObject({ dose: '24', volume: '2,4' });
    expect(dose('rocuronio', 50)).toMatchObject({ dose: '60', capped: false });
  });

  it('adrenalina IM: 0,01 mg/kg sem diluir, teto 0,5 mg', () => {
    expect(dose('epinefrina-im', 25)).toMatchObject({ dose: '0,25', volume: '0,25' });
    expect(dose('epinefrina-im', 50)).toMatchObject({ dose: '0,50', capped: false });
  });

  it('glicose 10%: 0,5 g/kg em 5 mL/kg, sem teto', () => {
    expect(dose('glicose-g10', 10)).toMatchObject({ dose: '5,0', unit: 'g', volume: '50' });
    expect(dose('glicose-g25', 10)).toMatchObject({ dose: '5,0', volume: '20' });
    expect(describeCap(drug('glicose-g10'))).toBeNull();
  });

  it('adenosina: primeira e segunda dose com tetos próprios', () => {
    expect(dose('adenosina', 7)).toMatchObject({ dose: '0,7 / 1,4', volume: '0,23 / 0,47' });
    expect(dose('adenosina', 50)).toMatchObject({ dose: '5,0 / 10,0', capped: false });
    expect(describeCap(drug('adenosina'))).toBe('6 mg 1ª dose · 12 mg 2ª dose');
  });

  it('atropina em organofosforado: faixa com piso de 0,1 mg e sem teto', () => {
    expect(dose('atropina-tox', 2)).toMatchObject({ dose: '0,10 - 0,10', floored: true });
    expect(dose('atropina-tox', 20)).toMatchObject({ dose: '0,40 - 1,00', floored: false });
    expect(describeCap(drug('atropina-tox'))).toBeNull();
    expect(describeFloor(drug('atropina-tox'))).toBe('0,1 mg');
  });

  it('NaCl 3%: a dose em mEq sai do volume de 3 mL/kg', () => {
    expect(dose('nacl', 10)).toMatchObject({ dose: '15,4', unit: 'mEq', volume: '30' });
  });

  it('ipratrópio em nebulização muda de degrau aos 20 kg', () => {
    expect(dose('ipratropio-gotas', 19.9)).toMatchObject({
      dose: '0,25',
      volume: '1',
      note: 'menos de 20 kg — em nebulização',
    });
    expect(dose('ipratropio-gotas', 20)).toMatchObject({ dose: '0,50', volume: '2' });
  });

  it('emulsão lipídica: bolus com teto de 100 mL e infusão de 0,25 mL/kg/min em mL/h', () => {
    expect(dose('emulsao-lipidica', 10)).toMatchObject({ dose: '15,0', unit: 'mL', volume: '150' });
    expect(dose('emulsao-lipidica', 50)).toMatchObject({ dose: '75,0', capped: false });
  });

  it('glicose de suporte na intoxicação: Holliday-Segar até 90 mL/h', () => {
    expect(hollidaySegarMlPerHour(10)).toBe(40);
    expect(hollidaySegarMlPerHour(20)).toBe(60);
    expect(hollidaySegarMlPerHour(30)).toBe(70);
    expect(hollidaySegarMlPerHour(60)).toBe(100);
    // Até 50 kg o teto de 90 mL/h nunca corta: aos 50 kg a manutenção dá 90.
    expect(dose('glicose10-tox', 50)).toMatchObject({ dose: '90', unit: 'mL/h', capped: false });
    expect(describeCap(drug('glicose10-tox'))).toBe('90 mL/h');
  });

  it('N-acetilcisteína: volume de soro calculado da dose', () => {
    expect(dose('nac-fase1', 10)).toMatchObject({ dose: '1500', note: 'diluir em 50 mL de SF' });
    expect(dose('nac-fase2', 10.1)).toMatchObject({ dose: '505', note: 'diluir em 51 mL de SF' });
  });

  it('salbutamol é dose fixa, sem volume', () => {
    expect(dose('salbutamol-resp', 3)).toMatchObject({
      dose: '4 - 10',
      unit: 'jatos',
      volume: null,
    });
  });

  it('anti-histamínico pede a idade e não recomenda abaixo de 2 anos', () => {
    expect(dose('loratadina', 12)).toEqual({ status: 'falta-idade' });
    expect(dose('loratadina', 12, 1.5)).toEqual({
      status: 'nao-recomendado',
      message: 'Geralmente não recomendado abaixo de 2 anos',
    });
    expect(dose('loratadina', 25, 4)).toMatchObject({ dose: '5', note: 'VO 1x/dia' });
    expect(dose('loratadina', 31, 7)).toMatchObject({ dose: '10' });
    expect(dose('loratadina', 25, 7)).toMatchObject({ dose: '5' });
    expect(dose('cetirizina', 15, 3)).toMatchObject({ dose: '2,5 - 5' });
    expect(dose('cetirizina', 15, 6)).toMatchObject({ dose: '10' });
  });
});
