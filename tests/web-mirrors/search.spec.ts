import { describe, expect, it } from 'vitest';
import * as contract from '../../src/shared/contracts/search';
import * as mirror from '../../web/src/lib/search-contract';

/**
 * CC-502 — o web importa de `@contracts/search` só tipos; os valores ficam em
 * `web/src/lib/search-contract.ts`. Aqui os dois não divergem.
 */
describe('espelho do contrato da busca única no web (CC-502)', () => {
  it('tem os mesmos valores do contrato', () => {
    expect({ ...mirror }).toEqual({
      UNIFIED_SEARCH_GROUPS: contract.UNIFIED_SEARCH_GROUPS,
      UNIFIED_SEARCH_MIN_CHARS: contract.UNIFIED_SEARCH_MIN_CHARS,
      UNIFIED_SEARCH_MAX_CHARS: contract.UNIFIED_SEARCH_MAX_CHARS,
      UNIFIED_SEARCH_DEFAULT_LIMIT: contract.UNIFIED_SEARCH_DEFAULT_LIMIT,
      UNIFIED_SEARCH_MAX_LIMIT: contract.UNIFIED_SEARCH_MAX_LIMIT,
    });
  });
});
