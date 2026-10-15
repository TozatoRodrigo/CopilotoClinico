import { describe, expect, it } from 'vitest';
import { airwayReducer, INITIAL_AIRWAY_STATE, type AirwayAction, type AirwayState } from './state';
import { buildAirwayChartNote, buildAirwaySummary } from './summary';

function apply(state: AirwayState, ...actions: AirwayAction[]): AirwayState {
  return actions.reduce(airwayReducer, state);
}

const COMPLETE_CASE = apply(
  INITIAL_AIRWAY_STATE,
  { type: 'toggle-indication', id: 'oxigenacao' },
  { type: 'toggle-crash', letter: 'S' },
  { type: 'set-heart-rate', raw: '120' },
  { type: 'set-systolic', raw: '90' },
  { type: 'set-vad-assessment', value: 'avaliar' },
  { type: 'toggle-lemon', id: 'M' },
  { type: 'set-height', raw: '172' },
  { type: 'set-sex', sex: 'M' },
  { type: 'toggle-drug', drug: 'fentanil' },
  { type: 'toggle-drug', drug: 'etomidato' },
  { type: 'toggle-drug', drug: 'rocuronio' },
  { type: 'set-drug-rate', drug: 'fentanil', rate: 1 },
  { type: 'set-cormack', grade: 'II' },
  { type: 'set-depth', raw: '23' },
  { type: 'set-cuff', raw: '25' },
  { type: 'record-intubation', success: true },
  { type: 'toggle-check', id: 'confirmacao-capnografia' },
  { type: 'toggle-check', id: 'pocus-traqueal' },
);

describe('resumo do roteiro de via aérea', () => {
  it('monta o texto para o prontuário de um caso completo, sem data nem identificação', () => {
    expect(buildAirwayChartNote(COMPLETE_CASE, '82,5')).toBe(
      [
        'Intubação orotraqueal — roteiro de via aérea',
        'Indicação: Falha de ventilação/oxigenação',
        'Avaliação de VAD: CRASH: 2/5 (SH) | LEMON: 1/5 | ROMAN: 0/5 | Índice de choque: 1,33',
        'Paciente: Peso: 82,5 kg | Altura: 172 cm | Sexo: Masculino | População: Adulto',
        'Medicações:',
        '- Fentanil 83 mcg (1 mcg/kg)',
        '- Etomidato 24,8 mg (0,3 mg/kg); redução sugerida de 30–50%: 12,4 a 17,3 mg',
        '- Rocurônio 124 mg (1,5 mg/kg)',
        'Procedimento: Tubo: 8,5 ou 8,0 mm | Cormack-Lehane: II | Profundidade: 23 cm | Cuff: 25 cmH2O',
        'Desfecho: Intubação com sucesso (plano A)',
        'Confirmação: capnografia, POCUS traqueal',
      ].join('\n'),
    );
  });

  it('registra resgate e plano C pelo que foi respondido', () => {
    const rescued = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'record-intubation', success: false },
      { type: 'plan-b-failed' },
      { type: 'crico-established' },
    );
    const outcome = buildAirwaySummary(rescued, '').find(({ id }) => id === 'desfecho');
    expect(outcome?.lines).toEqual([
      'Falha na intubação; via aérea estabelecida com cricotireoidostomia (plano C)',
    ]);

    const pending = apply(INITIAL_AIRWAY_STATE, { type: 'record-intubation', success: false });
    expect(buildAirwaySummary(pending, '').find(({ id }) => id === 'desfecho')?.lines).toEqual([
      'Falha na intubação; plano B (dispositivo extraglótico) sem desfecho registrado',
    ]);
  });

  it('sem peso, lista a medicação sem dose; sem avaliação anatômica, diz que não foi feita', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'toggle-drug', drug: 'cetamina' },
      { type: 'set-vad-assessment', value: 'sem-avaliar' },
    );
    const sections = new Map(buildAirwaySummary(state, '').map(({ id, lines }) => [id, lines]));
    expect(sections.get('medicacoes')).toEqual(['Cetamina 1,5 mg/kg (peso não informado)']);
    expect(sections.get('avaliacao')).toEqual(['CRASH: 0/5 | Avaliação anatômica: não realizada']);
    expect(sections.get('paciente')).toEqual(['Peso: -- | Sexo: -- | População: Adulto']);
    expect(sections.get('indicacao')).toEqual(['--']);
  });

  it('ignora profundidade e cuff fora da faixa', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'set-depth', raw: '230' },
      { type: 'set-cuff', raw: '2,5' },
    );
    const procedure = buildAirwaySummary(state, '').find(({ id }) => id === 'procedimento');
    expect(procedure?.lines).toEqual(['Tubo: --']);
  });
});
