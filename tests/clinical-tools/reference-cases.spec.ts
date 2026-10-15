import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  evaluateCalculator,
  formatResultValue,
  type CalculatorAnswers,
  type CalculatorEvaluation,
} from '../../src/shared/clinical-tools/calculator';
import { buildChartNote } from '../../src/shared/clinical-tools/chart-note';
import { getCalculator } from '../../src/shared/clinical-tools/registry';
import { assessRumackMatthew } from '../../src/shared/clinical-tools/toxicology/rumack-matthew';

/**
 * Casos de referência das calculadoras (CC-307 a CC-309): exemplos das
 * pérolas e limiares-chave escritos à mão, com o resultado que o médico
 * espera ver. Complementam o diferencial (que só garante "igual ao ANY") e
 * ancoram o que a revisão clínica (CC-310) conferir. Os casos do Dr. Gustavo
 * entram aqui quando chegarem.
 */

function evaluate(id: string, answers: CalculatorAnswers, today?: Date): CalculatorEvaluation {
  const definition = getCalculator(id);
  if (!definition) throw new Error(`${id} não está no registro`);
  return evaluateCalculator(definition, answers, today ? { today } : undefined);
}

function complete(evaluation: CalculatorEvaluation) {
  if (evaluation.status !== 'complete') {
    throw new Error(`esperava resultado, veio ${JSON.stringify(evaluation)}`);
  }
  return evaluation;
}

/** Código de produção (sem testes) de um diretório, para conferir que uma conta não foi duplicada. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.(spec|test)\.tsx?$/.test(entry) ? [path] : [];
  });
}

function shown(id: string, value: number): string | null {
  const definition = getCalculator(id);
  if (!definition) throw new Error(`${id} não está no registro`);
  return formatResultValue(definition, value);
}

describe('lote A (CC-307)', () => {
  it('HEART: 3 é baixo risco e 4 já é moderado', () => {
    const base = { history: 'moderada', ecg: 'normal', age: '45-64', troponin: 'normal' };
    expect(complete(evaluate('heart-score', { items: { ...base, risk: '1-2' } }))).toMatchObject({
      value: 3,
      band: { label: 'Baixo risco', tone: 'neutral' },
    });
    expect(complete(evaluate('heart-score', { items: { ...base, risk: 'gte3' } }))).toMatchObject({
      value: 4,
      band: { label: 'Risco moderado', tone: 'attention' },
    });
  });

  it('GRACE: 70 anos, FC 100, PAS 110, Cr 1,3, Killip II = 163 pontos, alto risco', () => {
    const result = complete(
      evaluate('grace-score', {
        inputs: { age: '70', hr: '100', sbp: '110', creatinine: '1,3' },
        items: { killip: 'ii', arrest: 'nao', stdev: 'nao', troponin: 'nao' },
      }),
    );
    expect(result).toMatchObject({ value: 163, band: { label: 'Alto risco' } });
    expect(shown('grace-score', 163)).toBe('163 pontos');
  });

  it('GRACE e APACHE II levam o aviso de versão para o prontuário', () => {
    for (const id of ['grace-score', 'apache-ii']) {
      const definition = getCalculator(id);
      expect(definition?.versionNotice?.text, id).toBeTruthy();
    }
    const definition = getCalculator('apache-ii');
    const result = complete(
      evaluate('apache-ii', {
        items: Object.fromEntries(
          (definition?.items ?? []).map((item) => [item.id, item.options[0]?.id ?? '']),
        ),
      }),
    );
    expect(result).toMatchObject({ value: 0, band: { label: 'APACHE II 0–4' } });
    if (!definition) throw new Error('apache-ii ausente');
    expect(buildChartNote(definition, result)).toContain('Versão simplificada:');
  });

  it('GCS: E3V4M6 = 13, leve, com os componentes no detalhe', () => {
    const result = complete(evaluate('gcs', { items: { eye: 'e3', verbal: 'v4', motor: 'm6' } }));
    expect(result).toMatchObject({
      value: 13,
      band: { label: 'Leve (GCS 13–15)' },
      details: [{ label: 'Componentes', value: 'E3V4M6' }],
    });
  });

  it('CAM-ICU: positivo só com F1 e F2 e (F3 ou F4)', () => {
    const answer = (f1: string, f2: string, f3: string, f4: string) =>
      complete(evaluate('cam-icu', { items: { f1, f2, f3, f4 } })).band.id;
    expect(answer('sim', 'sim', 'nao', 'sim')).toBe('positivo');
    expect(answer('sim', 'sim', 'sim', 'nao')).toBe('positivo');
    expect(answer('sim', 'nao', 'sim', 'sim')).toBe('negativo');
    expect(answer('nao', 'sim', 'sim', 'sim')).toBe('negativo');
    expect(shown('cam-icu', 4)).toBeNull();
  });

  it('NIHSS: tudo normal é 0, sem déficit', () => {
    const definition = getCalculator('nihss');
    const result = complete(
      evaluate('nihss', {
        items: Object.fromEntries((definition?.items ?? []).map((item) => [item.id, '0'])),
      }),
    );
    expect(result).toMatchObject({ value: 0, band: { label: 'Sem déficit' } });
  });

  it('Torpedo D cheio (340 L a 200 bar) em 5 L/min dura ~68 min', () => {
    const result = complete(
      evaluate('tempo-o2', { inputs: { volume: '340', pressure: '200', flow: '5' } }),
    );
    expect(result).toMatchObject({ value: 68, band: { label: 'Autonomia de 1 h ou mais' } });
    expect(shown('tempo-o2', 68)).toBe('1 h 8 min');
    expect(shown('tempo-o2', 45)).toBe('45 min');
    expect(shown('tempo-o2', 120)).toBe('2 h');
  });

  it('Light: proteína LP/soro 0,58 basta para exsudato', () => {
    const result = complete(
      evaluate('criterios-light', {
        // O limite do LDH vem preenchido na tela (250 U/L), como no ANY.
        inputs: {
          prot_lp: '3,5',
          prot_serum: '6',
          ldh_lp: '100',
          ldh_serum: '250',
          ldh_upper: '250',
        },
      }),
    );
    expect(result).toMatchObject({
      value: 1,
      band: { label: 'Exsudato' },
      details: [
        { label: 'Proteína LP/soro', value: '0,58' },
        { label: 'LDH LP/soro', value: '0,40' },
      ],
    });
  });
});

describe('lote B (CC-308)', () => {
  it('Parkland: 70 kg com 40% de SCQ = 11.200 mL, metade nas primeiras 8 h', () => {
    expect(complete(evaluate('parkland', { inputs: { weight: '70', scq: '40' } }))).toMatchObject({
      value: 11200,
      details: [
        { label: 'Primeiras 8 h (desde a queimadura)', value: '5600 mL (700 mL/h)' },
        { label: 'Próximas 16 h', value: '5600 mL (350 mL/h)' },
      ],
    });
  });

  it('Rumack-Matthew: a calculadora usa a mesma função do motor que o roteiro vai usar', () => {
    for (let tenths = 40; tenths <= 240; tenths += 5) {
      const hours = tenths / 10;
      const result = complete(
        evaluate('nomograma-rumack', {
          inputs: { hours: String(hours).replace('.', ','), level: '100' },
        }),
      );
      const { line, aboveLine } = assessRumackMatthew(hours, 100);
      expect(result.value, `${hours} h`).toBe(line);
      expect(result.band.id).toBe(aboveLine ? 'acima' : 'abaixo');
    }
  });

  it('Rumack-Matthew: a conta da linha mora num lugar só', () => {
    // CC-308: "uma implementação só". Outra cópia da constante da meia-vida
    // fora do motor de toxicologia quer dizer conta duplicada.
    const offenders = [
      ...codeFiles(join(process.cwd(), 'src')),
      ...codeFiles(join(process.cwd(), 'web/src')),
    ]
      .filter((file) => !file.endsWith(join('toxicology', 'rumack-matthew.ts')))
      .filter((file) => /0\.173\b/.test(readFileSync(file, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('delta gap: com HCO3 normal não calcula e explica', () => {
    expect(evaluate('delta-gap', { inputs: { ag: '20', hco3: '24' } })).toMatchObject({
      status: 'pending',
      errors: { hco3: { kind: 'inconsistent' } },
    });
    expect(complete(evaluate('delta-gap', { inputs: { ag: '22', hco3: '14' } }))).toMatchObject({
      value: 1,
      band: { label: 'Acidose AG elevado pura' },
      details: [{ label: 'Delta gap', value: '0,0' }],
    });
  });

  it('anion gap: sem albumina, corrige com 4,0, como no ANY', () => {
    const result = complete(
      evaluate('anion-gap', { inputs: { na: '140', cl: '100', hco3: '20' } }),
    );
    expect(result).toMatchObject({
      value: 20,
      band: { label: 'Elevado' },
      details: [{ label: 'AG bruto', value: '20,0 mEq/L' }],
    });
    expect(result.answers.at(-1)).toEqual({
      label: 'Albumina (opcional, para correção)',
      answer: '4 g/dL (padrão)',
    });
  });

  it('potássio 3,2: hipocalemia moderada, déficit ~267 mEq', () => {
    const result = complete(evaluate('correcao-potassio', { inputs: { k: '3,2' } }));
    expect(result).toMatchObject({ value: 267, band: { label: 'Hipocalemia moderada' } });
    expect(shown('correcao-potassio', 267)).toBe('~267 mEq');
  });

  it('QTc: QT 400 ms com FC 90 dá Bazett 490 (prolongado) e Fridericia no detalhe', () => {
    expect(complete(evaluate('qtc-corrigido', { inputs: { qt: '400', hr: '90' } }))).toMatchObject({
      value: 490,
      band: { label: 'Prolongado' },
      details: [{ label: 'QTc de Fridericia', value: '458 ms' }],
    });
  });

  it('Cockcroft-Gault e CKD-EPI: o sexo é parâmetro e precisa ser escolhido', () => {
    expect(
      evaluate('cockcroft-gault', { inputs: { age: '40', weight: '72', creatinine: '1' } }),
    ).toMatchObject({ status: 'pending', missing: ['Sexo'] });
    expect(
      complete(
        evaluate('cockcroft-gault', {
          inputs: { age: '40', weight: '72', creatinine: '1' },
          items: { sex: 'masculino' },
        }),
      ),
    ).toMatchObject({ value: 100, band: { label: 'Normal' } });
    expect(
      complete(
        evaluate('ckd-epi', {
          inputs: { age: '50', creatinine: '0,8' },
          items: { sex: 'feminino' },
        }),
      ),
    ).toMatchObject({ value: 89.7, band: { label: 'G2' } });
  });
});
