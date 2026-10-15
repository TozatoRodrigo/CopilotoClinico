import { describe, expect, it } from 'vitest';
import { PS_SYNDROMES } from '@contracts/clinical';
import { PS_SYNDROME_SEARCH_TERMS } from '../../../../src/modules/search/syndrome-terms';
import { ptBR } from '../messages/pt-BR';

/**
 * CC-502 — a busca de casos e cartões no servidor acha a síndrome pelo
 * rótulo que a tela mostra: se o rótulo mudar aqui, o termo de busca muda lá.
 */
describe('termos de busca das síndromes (CC-502)', () => {
  it('o primeiro termo de cada síndrome é o rótulo da tela', () => {
    for (const syndrome of PS_SYNDROMES.filter((value) => value !== 'outro')) {
      expect(PS_SYNDROME_SEARCH_TERMS[syndrome][0]).toBe(ptBR.understanding.syndromes[syndrome]);
    }
  });
});
