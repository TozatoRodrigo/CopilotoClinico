import { describe, expect, it } from 'vitest';
import { assertSafeDatabase, formatDatabaseTarget, UnsafeDatabaseError } from './db-safety';

const local =
  'postgresql://copiloto_app_user:segredo@localhost:5432/copiloto_clinico?schema=public';

describe('assertSafeDatabase', () => {
  it('aceita localhost e os nomes do docker-compose de desenvolvimento', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      'postgres',
      'copiloto-postgres',
      'copiloto-demo-postgres',
    ]) {
      expect(
        assertSafeDatabase(local.replace('localhost', host), { allowRemote: false }).host,
      ).toBe(host);
    }
  });

  it('recusa banco remoto', () => {
    const remote = local.replace('localhost', 'db.exemplo.com.br');
    expect(() => assertSafeDatabase(remote, { allowRemote: false })).toThrow(UnsafeDatabaseError);
  });

  it('recusa o nome do banco do compose de PRODUÇÃO', () => {
    const production = local.replace('localhost', 'copiloto-db');
    expect(() => assertSafeDatabase(production, { allowRemote: false })).toThrow(
      /não é um banco local/,
    );
  });

  it('aceita banco remoto só com --allow-remote-db', () => {
    const remote = local.replace('localhost', 'db.exemplo.com.br');
    expect(assertSafeDatabase(remote, { allowRemote: true }).host).toBe('db.exemplo.com.br');
  });

  it('recusa DATABASE_URL ausente ou inválida', () => {
    expect(() => assertSafeDatabase(undefined, { allowRemote: true })).toThrow(/não definida/);
    expect(() => assertSafeDatabase('não é url', { allowRemote: true })).toThrow(/não é uma URL/);
  });

  it('descreve o banco sem a senha', () => {
    const described = formatDatabaseTarget(assertSafeDatabase(local, { allowRemote: false }));
    expect(described).toBe('copiloto_app_user@localhost:5432/copiloto_clinico');
    expect(described).not.toContain('segredo');
  });
});
