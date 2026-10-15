import { describe, expect, it } from 'vitest';
import { getInfusionDrug, type InfusionDrug } from '@clinical-tools/infusions/drugs';
import {
  EMPTY_HEPARIN_STATE,
  EMPTY_INSULIN_STATE,
  initialDrugState,
  parseInfusionScreenState,
  parseOpenItem,
  resolveDilution,
} from '../_components/infusion-state';

function drug(id: string): InfusionDrug {
  const found = getInfusionDrug(id);
  if (!found) throw new Error(`droga ${id} ausente`);
  return found;
}

describe('initialDrugState', () => {
  it('começa no primeiro modo, na dose padrão e na diluição padrão', () => {
    expect(initialDrugState(drug('midazolam'), null)).toEqual({
      modeId: 'sedacao',
      dose: 0.1,
      dilution: { kind: 'lista', concentration: 1 },
    });
  });

  it('usa a diluição salva quando há uma', () => {
    expect(
      initialDrugState(drug('midazolam'), { ampoules: 4, volume: 100, concentration: 2 }).dilution,
    ).toEqual({ kind: 'minha' });
  });
});

describe('resolveDilution', () => {
  const nora = drug('noradrenalina');

  it('mostra o preparo padrão e, na alternativa, só o rótulo dela', () => {
    expect(resolveDilution(nora, { kind: 'lista', concentration: 64 }, null)).toMatchObject({
      kind: 'padrao',
      concentration: 64,
      description: nora.presentation,
    });
    expect(resolveDilution(nora, { kind: 'lista', concentration: 128 }, null)).toEqual({
      kind: 'alternativa',
      concentration: 128,
      description: 'Dobrada (128 mcg/mL)',
    });
  });

  it('volta ao padrão quando a escolha deixou de valer', () => {
    expect(resolveDilution(nora, { kind: 'lista', concentration: 999 }, null).kind).toBe('padrao');
    expect(resolveDilution(nora, { kind: 'minha' }, null).kind).toBe('padrao');
    expect(resolveDilution(nora, { kind: 'desta-vez', ampoules: 100, volume: 10 }, null).kind).toBe(
      'padrao',
    );
  });

  it('descreve a minha diluição e a "só desta vez" por extenso', () => {
    expect(
      resolveDilution(nora, { kind: 'minha' }, { ampoules: 8, volume: 250, concentration: 128 }),
    ).toEqual({
      kind: 'minha',
      concentration: 128,
      description: '8 ampolas de 4 mg / 4 mL em 250 mL',
    });
    expect(resolveDilution(nora, { kind: 'desta-vez', ampoules: 2, volume: 250 }, null)).toEqual({
      kind: 'desta-vez',
      concentration: 32,
      description: '2 ampolas de 4 mg / 4 mL em 250 mL',
    });
  });
});

describe('parseInfusionScreenState', () => {
  it('lê o estado salvo', () => {
    const state = {
      drugs: {
        midazolam: { modeId: 'status', dose: 0.5, dilution: { kind: 'minha' } },
        vasopressina: { modeId: null, dose: 0.03, dilution: { kind: 'lista', concentration: 0.4 } },
      },
      heparin: { phase: 'ajuste', indication: 'tep', ratio: '1,3', currentDose: '' },
      insulin: { phase: 'inicio', initial: '250', current: '', previous: '', currentInfusion: '' },
    };
    expect(parseInfusionScreenState(state)).toEqual(state);
  });

  it('volta os protocolos ao início quando o salvo é estranho', () => {
    expect(
      parseInfusionScreenState({
        drugs: {},
        heparin: { phase: 'x', indication: 'y', ratio: 'z'.repeat(50) },
        insulin: 'texto',
      }),
    ).toEqual({ drugs: {}, heparin: EMPTY_HEPARIN_STATE, insulin: EMPTY_INSULIN_STATE });
  });

  it('descarta item desconhecido, modo inválido, dose fora da faixa e diluição estranha', () => {
    expect(
      parseInfusionScreenState({
        drugs: {
          xpto: { modeId: null, dose: 1, dilution: { kind: 'minha' } },
          midazolam: { modeId: 'outro', dose: 0.1, dilution: { kind: 'minha' } },
          noradrenalina: { modeId: null, dose: 100, dilution: { kind: 'minha' } },
          dobutamina: { modeId: null, dose: 5, dilution: { kind: 'qualquer' } },
        },
      }),
    ).toMatchObject({ drugs: {} });
    expect(parseInfusionScreenState('texto')).toBeNull();
  });
});

describe('parseOpenItem', () => {
  it('aceita só item conhecido', () => {
    expect(parseOpenItem('noradrenalina')).toBe('noradrenalina');
    expect(parseOpenItem('xpto')).toBeNull();
    expect(parseOpenItem(3)).toBeNull();
  });
});
