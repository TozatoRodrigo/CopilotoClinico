import { describe, expect, it } from 'vitest';
import { evaluateCalculator } from './calculator';
import { CHADSVASC } from './calculators/chadsvasc';
import { SHOCK_INDEX } from './calculators/shock-index';
import { buildChartNote } from './chart-note';

describe('buildChartNote', () => {
  it('monta o texto do escore com resultado, respostas, sugestão e referência', () => {
    const result = evaluateCalculator(CHADSVASC, {
      items: {
        chf: 'nao',
        htn: 'sim',
        dm: 'nao',
        stroke: 'sim',
        vascular: 'nao',
        idade: '65-74',
        sex: 'nao',
      },
    });
    if (result.status !== 'complete') throw new Error('esperava resultado completo');

    expect(buildChartNote(CHADSVASC, result)).toBe(
      [
        'CHA2DS2-VASc: 4 pontos — Alto risco.',
        '- ICC / disfunção ventricular (C): Não',
        '- Hipertensão (H): Sim (+1)',
        '- Diabetes mellitus (D): Não',
        '- AVC / AIT / tromboembolismo prévio (S2): Sim (+2)',
        '- Doença vascular (IAM prévio, DAP, placa aórtica) (V): Não',
        '- Idade (A / A2): 65–74 anos (+1)',
        '- Sexo feminino (Sc): Não',
        'Sugestão: Risco anual de AVC ≥ 4%. Anticoagulação oral fortemente recomendada.',
        `Referência: ${CHADSVASC.reference.citation}`,
      ].join('\n'),
    );
  });

  it('mostra o valor da fórmula com vírgula e os campos com unidade', () => {
    const result = evaluateCalculator(SHOCK_INDEX, { inputs: { hr: '110', sbp: '90' } });
    if (result.status !== 'complete') throw new Error('esperava resultado completo');

    const note = buildChartNote(SHOCK_INDEX, result);
    expect(note.split('\n').slice(0, 3)).toEqual([
      'Índice de choque: 1,22 — Choque provável.',
      '- Frequência cardíaca: 110 bpm',
      '- Pressão arterial sistólica: 90 mmHg',
    ]);
  });
});
