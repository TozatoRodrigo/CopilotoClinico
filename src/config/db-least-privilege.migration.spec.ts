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

/**
 * F0-D — tabelas novas recebem GRANT explícito para a role de runtime em vez
 * de depender só dos DEFAULT PRIVILEGES da AUD-002, que só valem quando a
 * migration roda com a mesma role que os declarou.
 */
const F0D_MIGRATIONS = [
  { dir: '20261010120000_f0d_recommendation_decisions', table: 'recommendation_decisions' },
  { dir: '20261010120100_f0d_copilot_feedback', table: 'copilot_feedback' },
  // CC-707 — mesma regra para os pedidos de mentoria.
  { dir: '20261014120000_cc_707_mentoring_requests', table: 'mentoring_requests' },
] as const;

describe.each(F0D_MIGRATIONS)('Table migration $dir', ({ dir, table }) => {
  const sql = readFileSync(join(process.cwd(), `prisma/migrations/${dir}/migration.sql`), 'utf8');

  it('grants only DML on the new table to the runtime role', () => {
    expect(sql).toContain(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO copiloto_app`,
    );
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
  });

  it('smoke-checks each privilege separately and refuses TRUNCATE', () => {
    expect(sql).toContain(`has_table_privilege('copiloto_app', '${table}', privilege)`);
    expect(sql).toContain(`has_table_privilege('copiloto_app', '${table}', 'TRUNCATE')`);
  });

  it('cascades encounter deletion so LGPD erasure leaves no orphans', () => {
    expect(sql).toContain(
      `FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE`,
    );
  });
});
