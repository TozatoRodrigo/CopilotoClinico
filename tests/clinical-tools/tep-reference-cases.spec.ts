import { describe, expect, it } from 'vitest';
import {
  evaluateCalculator,
  formatResultValue,
  type CalculatorAnswers,
  type CalculatorDefinition,
  type CalculatorEvaluation,
} from '../../src/shared/clinical-tools/calculator';
import { TEP_CATEGORIES } from '../../src/shared/clinical-tools/tep/categories';
import { UNSTABLE } from '../../src/shared/clinical-tools/tep/content';
import {
  ageAdjustedDDimerCutoff,
  D_DIMER_AGE_ADJUSTED,
  YEARS,
  yearsDDimerCutoff,
} from '../../src/shared/clinical-tools/tep/d-dimer';
import { getTepReferenceSection } from '../../src/shared/clinical-tools/tep/reference';
import { BOVA, HESTIA, PESI, SPESI } from '../../src/shared/clinical-tools/tep/severity';
import { WELLS_TEP } from '../../src/shared/clinical-tools/tep/wells';

/**
 * CC-318 — casos de referência do TEP: limiares e doses-chave escritos à mão,
 * com o que o médico espera ver. O diferencial garante "igual ao ANY"; estes
 * ancoram o que a revisão clínica (CC-310) conferir. Os casos do Dr. Gustavo
 * entram aqui quando chegarem. Mudar uma dose ou limiar quebra este arquivo
 * de propósito: a mudança precisa ser deliberada.
 */

function complete(evaluation: CalculatorEvaluation) {
  if (evaluation.status !== 'complete') {
    throw new Error(`esperava resultado, veio ${JSON.stringify(evaluation)}`);
  }
  return evaluation;
}

function evaluate(definition: CalculatorDefinition, answers: CalculatorAnswers) {
  return complete(evaluateCalculator(definition, answers));
}

function allNo(definition: CalculatorDefinition, yes: readonly string[] = []) {
  return Object.fromEntries(
    (definition.items ?? []).map((item) => [item.id, yes.includes(item.id) ? 'sim' : 'nao']),
  );
}

/** Todo o texto de uma seção da referência, para procurar uma dose. */
function sectionText(id: Parameters<typeof getTepReferenceSection>[0]): string {
  return JSON.stringify(getTepReferenceSection(id));
}

describe('limiares do diagnóstico', () => {
  it('D-dímero ajustado: 500 µg/L abaixo dos 50 anos, idade × 10 a partir dos 50', () => {
    expect(ageAdjustedDDimerCutoff(49)).toBe(500);
    expect(ageAdjustedDDimerCutoff(50)).toBe(500);
    expect(ageAdjustedDDimerCutoff(65)).toBe(650);
    expect(ageAdjustedDDimerCutoff(80)).toBe(800);
    // Idade em anos completos, como o parseInt do ANY.
    expect(ageAdjustedDDimerCutoff(65.9)).toBe(650);
  });

  it('D-dímero de 700 aos 75 anos é negativo; igual ao ponto de corte já é positivo', () => {
    expect(
      evaluate(D_DIMER_AGE_ADJUSTED, { inputs: { age: '75', 'd-dimer': '700' } }).band,
    ).toMatchObject({ id: 'negativo', tone: 'neutral' });
    const atCutoff = evaluate(D_DIMER_AGE_ADJUSTED, { inputs: { age: '75', 'd-dimer': '750' } });
    expect(atCutoff.band).toMatchObject({ id: 'positivo', tone: 'critical' });
    expect(atCutoff.details).toEqual([
      { label: 'Ponto de corte ajustado', value: '750 µg/L FEU (idade 75 anos)' },
    ]);
  });

  it('D-dímero digitado em µg/mL (0,5) não vira resultado', () => {
    expect(
      evaluateCalculator(D_DIMER_AGE_ADJUSTED, { inputs: { age: '60', 'd-dimer': '0,5' } }),
    ).toMatchObject({ status: 'pending', errors: { 'd-dimer': { kind: 'out-of-range' } } });
  });

  it('YEARS: 1000 µg/L sem critério, 500 com pelo menos um', () => {
    expect(yearsDDimerCutoff(0)).toBe(1000);
    expect(yearsDDimerCutoff(1)).toBe(500);
    expect(yearsDDimerCutoff(3)).toBe(500);
    expect(evaluate(YEARS, { items: allNo(YEARS), inputs: { 'd-dimer': '999' } }).band.id).toBe(
      'negativo',
    );
    expect(
      evaluate(YEARS, { items: allNo(YEARS, ['hemoptysis']), inputs: { 'd-dimer': '500' } }).band
        .id,
    ).toBe('positivo');
  });

  it('Wells: 2 já é intermediário, 6 ainda é intermediário, 6,5 é alto; modificado > 4', () => {
    const two = evaluate(WELLS_TEP, { items: allNo(WELLS_TEP, ['hemoptysis', 'cancer']) });
    expect(two).toMatchObject({ value: 2, band: { id: 'intermediaria', tone: 'attention' } });
    const six = evaluate(WELLS_TEP, { items: allNo(WELLS_TEP, ['dvt-signs', 'pe-likely']) });
    expect(six.band.id).toBe('intermediaria');
    expect(six.details[0]?.value).toBe('TEP provável (> 4)');
    const sixAndHalf = evaluate(WELLS_TEP, {
      items: allNo(WELLS_TEP, ['dvt-signs', 'hr', 'hemoptysis', 'cancer']),
    });
    expect(sixAndHalf).toMatchObject({ value: 6.5, band: { id: 'alta', tone: 'critical' } });
    expect(formatResultValue(WELLS_TEP, sixAndHalf.value)).toBe('6,5 pontos');
    const four = evaluate(WELLS_TEP, { items: allNo(WELLS_TEP, ['dvt-signs', 'cancer']) });
    expect(four.details[0]?.value).toBe('TEP improvável (≤ 4)');
  });
});

describe('limiares da gravidade', () => {
  it('sPESI: 0 é baixo risco (B); 1 já é risco elevado (C ou mais)', () => {
    expect(evaluate(SPESI, { items: allNo(SPESI) }).band).toMatchObject({
      id: 'baixo-risco',
      tone: 'neutral',
    });
    expect(evaluate(SPESI, { items: allNo(SPESI, ['age']) }).band).toMatchObject({
      id: 'risco-elevado',
      tone: 'critical',
    });
  });

  it('PESI: a idade entra inteira; classes por 65, 85, 105 e 125', () => {
    const pesi = (age: string, yes: string[] = []) =>
      evaluate(PESI, { inputs: { age }, items: allNo(PESI, yes) });
    expect(pesi('65')).toMatchObject({ value: 65, band: { id: 'classe-i' } });
    expect(pesi('66', ['male'])).toMatchObject({ value: 76, band: { id: 'classe-ii' } });
    expect(pesi('56', ['cancer'])).toMatchObject({ value: 86, band: { id: 'classe-iii' } });
    expect(pesi('75', ['sbp', 'hr'])).toMatchObject({ value: 125, band: { id: 'classe-iv' } });
    expect(pesi('70', ['mental-status'])).toMatchObject({
      value: 130,
      band: { id: 'classe-v', tone: 'critical' },
    });
  });

  it('Bova: 2 é estágio I, 3 é estágio II, 5 é estágio III', () => {
    expect(evaluate(BOVA, { items: allNo(BOVA, ['troponin']) }).band.id).toBe('estagio-i');
    expect(evaluate(BOVA, { items: allNo(BOVA, ['troponin', 'hr']) }).band.id).toBe('estagio-ii');
    expect(evaluate(BOVA, { items: allNo(BOVA, ['troponin', 'sbp', 'hr']) }).band.id).toBe(
      'estagio-iii',
    );
  });

  it('Hestia: um critério basta para não ser ambulatorial', () => {
    expect(evaluate(HESTIA, { items: allNo(HESTIA) }).band.id).toBe('negativo');
    expect(evaluate(HESTIA, { items: allNo(HESTIA, ['pregnant']) }).band.id).toBe('positivo');
  });
});

describe('doses-chave', () => {
  it('alteplase: 100 mg em 2 h (10 mg em bolus + 90 mg); 50 mg em 2 h no alto risco; 50 mg em bolus na PCR', () => {
    const t = UNSTABLE.thrombolysis;
    expect(t.standardDose.blocks[0]).toMatchObject({ name: 'Alteplase 100 mg IV em 2 h' });
    expect(t.standardDose.blocks[0]?.text).toContain('10 mg em bolus + 90 mg em 2 h');
    expect(t.standardDose.blocks[0]?.text).toContain('Se PCR: 50 mg em bolus');
    expect(t.reducedDose.blocks[0]).toMatchObject({ name: 'Alteplase 50 mg IV em 2 h' });
    expect(sectionText('trombolise')).toContain('100 mg IV em 2 horas (dose padrão)');
    expect(sectionText('trombolise')).toContain('50 mg IV em 2 horas');
  });

  it('HNF: bolus 80 UI/kg + 18 UI/kg/h, ajuste por TTPa a cada 6 h', () => {
    expect(UNSTABLE.anticoagulation.heparin.text).toContain(
      'Bolus 80 UI/kg IV + infusão 18 UI/kg/h',
    );
    expect(sectionText('anticoagulacao')).toContain(
      'Bolus 80 UI/kg IV + infusão contínua 18 UI/kg/h',
    );
    expect(sectionText('anticoagulacao')).toContain('Ajustar por TTPa a cada 6 h.');
  });

  it('DOAC e HBPM: rivaroxabana 15 mg 2×/dia por 21 dias; apixabana 10 mg 2×/dia por 7 dias; enoxaparina 1 mg/kg 12/12 h', () => {
    const text = sectionText('anticoagulacao');
    expect(text).toContain('15 mg VO 2×/dia por 21 dias → 20 mg 1×/dia');
    expect(text).toContain('10 mg VO 2×/dia por 7 dias → 5 mg 2×/dia');
    expect(text).toContain('1 mg/kg SC 12/12 h');
  });

  it('suporte: norepinefrina 1ª escolha (segundo agente acima de 15 mcg/min), dobutamina até 10 mcg/kg/min, bolus de 250 mL', () => {
    const [norepinephrine, volume, dobutamine] = UNSTABLE.support.blocks;
    expect(norepinephrine?.text).toContain('Acima de 15 mcg/min, considere segundo agente');
    expect(volume?.text).toContain('Considere 250 mL em bolus e reavalie');
    expect(dobutamine?.text).toContain('até 10 mcg/kg/min');
  });

  it('filtro de veia cava: só com contraindicação absoluta à anticoagulação; retirar idealmente < 54 dias', () => {
    const text = sectionText('filtro-vci');
    expect(text).toContain('contraindicação absoluta a anticoagulação');
    expect(text).toContain('idealmente < 54 dias');
  });

  it('categorias com HNF na anticoagulação ligam ao protocolo de heparina', () => {
    for (const category of Object.values(TEP_CATEGORIES)) {
      expect(category.heparin, category.id).toBe(/HNF/.test(category.anticoagulation));
    }
  });
});
