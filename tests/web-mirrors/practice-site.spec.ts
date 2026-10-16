import { describe, expect, it } from 'vitest';
import * as contract from '../../src/shared/contracts/practice-site';
import * as mirror from '../../web/src/lib/practice-site-contract';

/**
 * A imagem do web copia só `web/` (docker/Dockerfile.web), então o que o web
 * usa em runtime de src/shared/contracts/practice-site.ts vive espelhado em
 * web/src/lib/practice-site-contract.ts. As duas cópias têm de bater.
 */
describe('espelho do contrato do local de plantão no web', () => {
  it.each(Object.entries(mirror))('%s é igual ao do contrato', (name, value) => {
    expect(contract).toHaveProperty(name);
    expect(value).toEqual(contract[name as keyof typeof contract]);
  });
});
