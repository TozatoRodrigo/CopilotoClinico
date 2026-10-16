import { describe, expect, it } from 'vitest';
import * as contract from '../../src/shared/contracts/beta';
import * as mirror from '../../web/src/lib/beta-contract';

/**
 * A imagem do web copia só `web/` (docker/Dockerfile.web), então o que o web
 * usa em runtime de src/shared/contracts/beta.ts vive espelhado em
 * web/src/lib/beta-contract.ts. As duas cópias têm de bater.
 */
describe('espelho do contrato do beta no web', () => {
  const values = Object.entries(mirror).filter(([, value]) => typeof value !== 'function');

  it.each(values)('%s é igual ao do contrato', (name, value) => {
    expect(contract).toHaveProperty(name);
    expect(value).toEqual(contract[name as keyof typeof contract]);
  });

  it.each(['k3mq-9xpt', ' K3MQ 9XPT ', 'K3MQ9XPT', 'k3mq', 'K3MQ-9XPT-22', '', 'ção-123'])(
    'normaliza e formata %j como o contrato',
    (input) => {
      expect(mirror.normalizeInviteCode(input)).toBe(contract.normalizeInviteCode(input));
      expect(mirror.formatInviteCode(input)).toBe(contract.formatInviteCode(input));
    },
  );
});
