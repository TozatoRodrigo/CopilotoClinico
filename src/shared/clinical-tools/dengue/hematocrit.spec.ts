import { describe, expect, it } from 'vitest';
import {
  evaluateHematocrit,
  formatHematocritVariation,
  interpretHematocritVariation,
} from './hematocrit';

describe('interpretHematocritVariation — limites do ANY', () => {
  it.each([
    [25, 'hemoconcentracao', 'critical'],
    [20, 'hemoconcentracao', 'critical'],
    [19.9, 'elevacao-moderada', 'attention'],
    [10, 'elevacao-moderada', 'attention'],
    [9.9, 'elevacao-discreta', 'neutral'],
    [0.1, 'elevacao-discreta', 'neutral'],
    [0, 'estavel', 'neutral'],
    [-10, 'estavel', 'neutral'],
    [-10.1, 'queda', 'attention'],
  ])('%s%% → %s', (variation, id, tone) => {
    expect(interpretHematocritVariation(variation)).toMatchObject({ id, tone });
  });
});

describe('evaluateHematocrit', () => {
  it('Ht basal 40% → atual 48% é hemoconcentração (exemplo do ANY)', () => {
    const result = evaluateHematocrit({ baseline: '40', current: '48' });
    expect(result).toMatchObject({
      status: 'complete',
      display: '+20,0%',
      band: { id: 'hemoconcentracao' },
    });
  });

  it('aceita vírgula decimal', () => {
    expect(evaluateHematocrit({ baseline: '45', current: '52,5' })).toMatchObject({
      status: 'complete',
      display: '+16,7%',
    });
  });

  it('não calcula com campo vazio e aponta o campo fora da faixa', () => {
    expect(evaluateHematocrit({ baseline: '', current: '' })).toEqual({
      status: 'pending',
      errors: {},
    });
    const result = evaluateHematocrit({ baseline: '5', current: '45' });
    expect(result.status).toBe('pending');
    expect(result.status === 'pending' && result.errors.baseline?.kind).toBe('out-of-range');
  });

  it('mostra sinal só na alta e vírgula', () => {
    expect(formatHematocritVariation(-12.345)).toBe('-12,3%');
    expect(formatHematocritVariation(0)).toBe('+0,0%');
  });
});
