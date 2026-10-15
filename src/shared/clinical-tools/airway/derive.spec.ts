import { describe, expect, it } from 'vitest';
import { deriveAirway } from './derive';
import { formatDose } from './drugs';
import { airwayReducer, INITIAL_AIRWAY_STATE, type AirwayAction, type AirwayState } from './state';

function apply(state: AirwayState, ...actions: AirwayAction[]): AirwayState {
  return actions.reduce(airwayReducer, state);
}

function doseOf(view: ReturnType<typeof deriveAirway>, id: string) {
  return view.drugs.find(({ drug }) => drug.id === id);
}

describe('deriveAirway', () => {
  it('CC-315, critério 1: peso e instabilidade → doses do ANY com a redução sugerida', () => {
    const unstable = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'set-heart-rate', raw: '125' },
      { type: 'set-systolic', raw: '85' },
    );
    const view = deriveAirway(unstable, '80');

    expect(view.hemodynamicInstability).toBe(true);
    expect(view.doseReduction).toBe(true);
    const etomidate = doseOf(view, 'etomidato');
    // Dose cheia igual à do ANY (80 × 0,3 = 24 mg) e a faixa com 30–50% a menos.
    expect(etomidate?.dose).toEqual({ dose: 24, volumeMl: 12 });
    expect(etomidate?.reduced).toEqual({
      from: { dose: 12, volumeMl: 6 },
      to: { dose: 16.8, volumeMl: 8.4 },
    });
    // BNM e fentanil não entram na redução (o aviso do ANY fala do indutor).
    expect(doseOf(view, 'rocuronio')?.reduced).toBeNull();
    expect(doseOf(view, 'fentanil')?.reduced).toBeNull();
  });

  it('idoso recebe a redução mesmo estável; adulto estável não', () => {
    const elderly = apply(INITIAL_AIRWAY_STATE, { type: 'set-population', population: 'idoso' });
    expect(deriveAirway(elderly, '70').doseReduction).toBe(true);
    expect(deriveAirway(INITIAL_AIRWAY_STATE, '70').doseReduction).toBe(false);
    expect(doseOf(deriveAirway(INITIAL_AIRWAY_STATE, '70'), 'propofol')?.reduced).toBeNull();
  });

  it('obeso e gestante não mudam a dose (como no ANY; ver a revisão clínica)', () => {
    for (const population of ['obeso', 'gestante'] as const) {
      const view = deriveAirway(
        apply(INITIAL_AIRWAY_STATE, { type: 'set-population', population }),
        '120',
      );
      expect(view.doseReduction).toBe(false);
      const succinylcholine = doseOf(view, 'succinilcolina');
      expect(
        succinylcholine &&
          succinylcholine.dose &&
          formatDose(succinylcholine.drug, succinylcholine.dose.dose),
      ).toBe('180 mg');
    }
  });

  it('sem peso válido não há dose; fora de 40–200 kg é erro', () => {
    expect(deriveAirway(INITIAL_AIRWAY_STATE, '').drugs.every(({ dose }) => dose === null)).toBe(
      true,
    );
    const tooLight = deriveAirway(INITIAL_AIRWAY_STATE, '35');
    expect(tooLight.weight).toMatchObject({ ok: false, error: { kind: 'out-of-range' } });
    expect(tooLight.drugs.every(({ dose }) => dose === null)).toBe(true);
  });

  it('CC-315, critério 3: índice > 1,0 deixa o H marcado com aviso visível', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'set-heart-rate', raw: '110' },
      { type: 'set-systolic', raw: '90' },
    );
    const view = deriveAirway(state, '');
    expect(state.crash).toContain('H');
    expect(view.shockIndex).toMatchObject({ value: 1.22, tone: 'critical' });
    expect(view.hAutoNotice).toEqual({
      tone: 'attention',
      title: 'H (hipotensão) marcado automaticamente',
      lines: ['Índice de choque 1,22, acima de 1,0.'],
    });
  });

  it('o aviso do H mostra o índice atual se ele foi corrigido, e some se o médico desmarca o H', () => {
    const marked = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'set-heart-rate', raw: '110' },
      { type: 'set-systolic', raw: '90' },
      { type: 'set-heart-rate', raw: '80' },
    );
    expect(deriveAirway(marked, '').hAutoNotice?.lines).toEqual([
      'O índice de choque passou de 1,0 quando foi digitado; o atual é 0,89.',
    ]);
    const unmarked = airwayReducer(marked, { type: 'toggle-crash', letter: 'H' });
    expect(deriveAirway(unmarked, '').hAutoNotice).toBeNull();
  });

  it('dados completos pedem peso válido e sexo; tubo pelo sexo e DEG pelo peso', () => {
    const female = apply(INITIAL_AIRWAY_STATE, { type: 'set-sex', sex: 'F' });
    expect(deriveAirway(female, '').patientDataComplete).toBe(false);
    const view = deriveAirway(female, '58,5');
    expect(view).toMatchObject({
      patientDataComplete: true,
      tube: '8,0 ou 7,5 mm',
      supraglotticDevice: 'Máscara laríngea: tamanho 4',
    });
  });

  it('LEMON ou ROMAN com 2 itens: via aérea difícil', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'toggle-lemon', id: 'M' },
      { type: 'toggle-roman', id: 'A' },
    );
    expect(deriveAirway(state, '').difficultAnatomy).toBe(false);
    expect(
      deriveAirway(airwayReducer(state, { type: 'toggle-lemon', id: 'N' }), '').difficultAnatomy,
    ).toBe(true);
  });

  it('Cormack III ou IV: visualização limitada', () => {
    expect(
      deriveAirway(airwayReducer(INITIAL_AIRWAY_STATE, { type: 'set-cormack', grade: 'II' }), '')
        .limitedView,
    ).toBe(false);
    expect(
      deriveAirway(airwayReducer(INITIAL_AIRWAY_STATE, { type: 'set-cormack', grade: 'III' }), '')
        .limitedView,
    ).toBe(true);
  });
});
