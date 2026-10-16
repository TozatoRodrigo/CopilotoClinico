import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CC-702 — a migration do beta dá à role de runtime só o DML que a API usa
 * (ver db-least-privilege.migration.spec.ts) e deixa no banco a última
 * barreira contra uso de convite além do limite.
 */
const sql = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261015120000_cc702_beta_convites/migration.sql'),
  'utf8',
);

describe('CC-702 migration (convites do beta)', () => {
  it('never lets an invite be used beyond its limit, even outside the service', () => {
    expect(sql).toContain('CHECK ("uses_count" >= 0 AND "uses_count" <= "max_uses")');
    expect(sql).toContain('CHECK ("max_uses" >= 1)');
    expect(sql).toContain('CREATE UNIQUE INDEX "beta_invites_code_key"');
  });

  it('grants only the DML each table needs, and never TRUNCATE', () => {
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE "beta_invites" TO copiloto_app');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "beta_participants" TO copiloto_app',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "beta_waitlist_entries" TO copiloto_app',
    );
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(sql).toContain("has_table_privilege('copiloto_app', 'beta_invites', 'DELETE')");
    expect(sql).toContain(
      "has_table_privilege('copiloto_app', 'beta_waitlist_entries', 'TRUNCATE')",
    );
  });

  it('cascades physician deletion and keeps invites that were used', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("invite_id") REFERENCES "beta_invites"("id") ON DELETE RESTRICT',
    );
    // Apagar a entrada da lista de espera (pedido LGPD) não apaga o convite.
    expect(sql).toContain(
      'FOREIGN KEY ("waitlist_entry_id") REFERENCES "beta_waitlist_entries"("id") ON DELETE SET NULL',
    );
  });
});
