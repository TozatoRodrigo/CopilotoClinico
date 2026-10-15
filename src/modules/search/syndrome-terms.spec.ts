import { describe, expect, it } from 'vitest';
import { matchSyndromes } from './syndrome-terms';

describe('matchSyndromes — síndrome pelo nome que o médico digita (CC-502)', () => {
  it.each([
    ['dor tor', ['dor-toracica']],
    ['Dor Torácica', ['dor-toracica']],
    ['anafilaxia', ['reacao-alergica']],
    ['sepse', ['febre-hipotensao']],
    ['convul', ['crise-convulsiva']],
    ['avc', ['deficit-neurologico-focal']],
    ['dor', ['cefaleia', 'dor-abdominal', 'dor-lombar-flanco', 'dor-toracica']],
    ['febre', ['febre', 'febre-hipotensao']],
  ])('"%s" acha %j', (query, expected) => {
    expect(matchSyndromes(query)).toEqual(expected);
  });

  it.each(['', '   ', 'leito 4', 'outra', 'xyz'])('"%s" não acha síndrome', (query) => {
    expect(matchSyndromes(query)).toEqual([]);
  });
});
