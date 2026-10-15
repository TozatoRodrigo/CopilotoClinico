import { describe, expect, it } from 'vitest';
import { buildDengueChartNote, deriveDengue } from './derive';
import { dengueReducer, INITIAL_DENGUE_STATE, type DengueAction } from './state';

const T0 = new Date(2026, 9, 15, 14, 5).getTime();

function stateAfter(actions: readonly DengueAction[]) {
  return actions.reduce(dengueReducer, INITIAL_DENGUE_STATE);
}

describe('deriveDengue', () => {
  it('sem peso válido não há volume; com peso, há', () => {
    expect(deriveDengue(INITIAL_DENGUE_STATE, '').hydration).toBeNull();
    expect(deriveDengue(INITIAL_DENGUE_STATE, '39').hydration).toBeNull();
    expect(deriveDengue(INITIAL_DENGUE_STATE, '70').hydration?.bolus).toBe(1400);
  });

  it('classifica ao vivo e devolve o grupo atual do histórico', () => {
    const state = stateAfter([
      { type: 'toggle-risk', id: 'gestante' },
      { type: 'open-screen', screen: 'trilha-3' },
      { type: 'open-trail-group', at: T0 },
    ]);
    const view = deriveDengue(state, '');
    expect(view.classification.group).toBe('B');
    expect(view.current).toEqual({ group: 'B', origin: 'trilha', at: T0 });
  });

  it('gera a mensagem a partir da hora guardada', () => {
    const state = stateAfter([{ type: 'generate-patient-message', at: T0 }]);
    expect(deriveDengue(state, '').patientMessage).toContain('_Emitido em 15/10/2026 às 14:05_');
  });
});

describe('buildDengueChartNote', () => {
  it('leva grupo, sinais, volumes do peso, Ht, trajetória e referência', () => {
    const state = stateAfter([
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'set-ht-baseline', raw: '45' },
      { type: 'set-ht-current', raw: '54' },
      { type: 'open-screen', screen: 'grupo-b' },
      { type: 'reclassify', to: 'C', at: T0 },
    ]);
    const view = deriveDengue(state, '70');
    const note = buildDengueChartNote({ group: 'C', state, view });
    expect(note.split('\n')).toEqual([
      'Dengue: Grupo C — Internação.',
      '- Sinais de gravidade: nenhum',
      '- Sinais de alarme: Vômitos persistentes',
      '- Condições de risco: nenhum',
      '- Peso: 70 kg',
      '- Fase de expansão (2h): 700 mL/h; 1.400 mL em 2h',
      '- Variação do Ht: +20,0% (basal 45% → atual 54%) — Hemoconcentração significativa (≥20%)',
      'Sugestão: Sinais de alarme presentes — considere internação para hidratação IV e monitorização.',
      'Referência: Brasil. Ministério da Saúde. Dengue: diagnóstico e manejo clínico — adulto e criança. 6ª edição. Brasília, 2024.',
    ]);
  });

  it('mostra a trajetória e omite o motivo quando o grupo veio de reclassificação', () => {
    const state = stateAfter([
      { type: 'open-screen', screen: 'grupo-c' },
      { type: 'reclassify', to: 'B', at: T0 },
      { type: 'reclassify', to: 'A', at: T0 + 1 },
      { type: 'toggle-alarm', id: 'vomitos' },
    ]);
    const note = buildDengueChartNote({ group: 'A', state, view: deriveDengue(state, '') });
    expect(note).toContain('- Grupos no atendimento: B → A');
    expect(note).not.toContain('Sugestão:');
    expect(note).not.toContain('Peso:');
  });

  it('não leva horário nem dado de identificação', () => {
    const state = stateAfter([
      { type: 'open-screen', screen: 'trilha-3' },
      { type: 'open-trail-group', at: T0 },
    ]);
    const note = buildDengueChartNote({ group: 'A', state, view: deriveDengue(state, '70') });
    expect(note).not.toMatch(/\d{2}:\d{2}/);
    expect(note).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
