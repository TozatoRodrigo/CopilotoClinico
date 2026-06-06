import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260605030000_aud_002_db_least_privilege/migration.sql'),
  'utf8',
);

describe('AUD-002 database least-privilege migration', () => {
  it('creates a non-login app role without administrative privileges', () => {
    expect(migrationSql).toContain('CREATE ROLE copiloto_app');
    expect(migrationSql).toContain('NOLOGIN');
    expect(migrationSql).toContain('NOSUPERUSER');
    expect(migrationSql).toContain('NOCREATEDB');
    expect(migrationSql).toContain('NOCREATEROLE');
    expect(migrationSql).toContain('NOREPLICATION');
  });

  it('keeps audit_log append-only for the app role', () => {
    expect(migrationSql).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM copiloto_app',
    );
    expect(migrationSql).toContain('GRANT SELECT, INSERT ON audit_log TO copiloto_app');
    expect(migrationSql).toContain("has_table_privilege('copiloto_app', 'audit_log', 'TRUNCATE')");
    expect(migrationSql).toContain("has_table_privilege('copiloto_app', 'audit_log', 'DELETE')");
  });

  it('does not grant the app role write access to Prisma migration history', () => {
    expect(migrationSql).toContain('REVOKE ALL ON TABLE _prisma_migrations FROM copiloto_app');
  });
});
