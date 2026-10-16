import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CC-801 — mesmas garantias das tabelas da F0-D (ver
 * src/config/db-least-privilege.migration.spec.ts): GRANT explícito só de
 * DML para a role de runtime e CASCADE do encontro para a eliminação LGPD.
 */
const sql = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261015130000_cc_801_shift_reviews/migration.sql'),
  'utf8',
);

describe('CC-801 migration (shift_reviews)', () => {
  it.each(['shift_reviews', 'shift_review_questions'])(
    'grants only DML on %s to the runtime role',
    (table) => {
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO copiloto_app`,
      );
    },
  );

  it('never grants ALL or TRUNCATE, and smoke-checks each privilege', () => {
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(sql).toContain("has_table_privilege('copiloto_app', target, privilege)");
    expect(sql).toContain("has_table_privilege('copiloto_app', target, 'TRUNCATE')");
  });

  it('cascades encounter and analysis deletion so LGPD erasure leaves no orphans', () => {
    expect(sql).toContain(
      `FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE`,
    );
    expect(sql).toContain(
      `FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE CASCADE`,
    );
    expect(sql).toContain(
      `FOREIGN KEY ("review_id") REFERENCES "shift_reviews"("id") ON DELETE CASCADE`,
    );
  });

  it('keeps one review per physician per week', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "shift_reviews_physician_id_period_start_key" ON "shift_reviews"("physician_id", "period_start")',
    );
  });
});
