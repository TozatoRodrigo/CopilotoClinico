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

describe('CC-334 migration external_identities', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261014150000_cc334_external_identities/migration.sql'),
    'utf8',
  );

  it('grants only DML on the new table and smoke-checks it', () => {
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "external_identities" TO copiloto_app',
    );
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(sql).toContain("has_table_privilege('copiloto_app', 'external_identities', privilege)");
    expect(sql).toContain("has_table_privilege('copiloto_app', 'external_identities', 'TRUNCATE')");
  });

  it('cascades physician deletion', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE',
    );
  });
});

/**
 * CC-402 (ADR-019) — cartões revisados: nada se apaga (o cartão sai de uso por
 * `archived`), o rascunho da IA é escrito uma vez, e o que o revisor assinou
 * não muda (trigger).
 */
describe('CC-402 migration 20261014120000_cc_402_knowledge_cards', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261014120000_cc_402_knowledge_cards/migration.sql'),
    'utf8',
  );

  it('grants only insert/read on drafts and no delete on cards or versions', () => {
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE "knowledge_card_drafts" TO copiloto_app');
    expect(sql).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "knowledge_card_drafts" FROM copiloto_app',
    );
    for (const table of ['knowledge_cards', 'knowledge_card_versions']) {
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE ON TABLE "${table}" TO copiloto_app`);
      expect(sql).toContain(`REVOKE DELETE, TRUNCATE ON TABLE "${table}" FROM copiloto_app`);
    }
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*(DELETE|TRUNCATE)/i);
  });

  it('smoke-checks the privileges inside the migration', () => {
    expect(sql).toContain(
      "has_table_privilege('copiloto_app', 'knowledge_card_drafts', privilege)",
    );
    expect(sql).toContain("has_table_privilege('copiloto_app', card_table, privilege)");
  });

  it('freezes signed content and the reviewer decision with a trigger', () => {
    expect(sql).toContain('BEFORE UPDATE ON "knowledge_card_versions"');
    expect(sql).toContain('NEW.content IS DISTINCT FROM OLD.content');
    expect(sql).toContain('OLD.review_decision IS NOT NULL');
  });

  it('never cascades a signed card away', () => {
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/ON DELETE SET NULL/);
  });
});

/**
 * CC-411 (ADR-019, adendo) — revisão cruzada: o sorteio e a decisão do
 * segundo médico não mudam, o segundo médico não é o primeiro (CHECK), e nada
 * se apaga.
 */
describe('CC-411 migration 20261015120100_cc_411_card_cross_reviews', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261015120100_cc_411_card_cross_reviews/migration.sql'),
    'utf8',
  );

  it('grants insert/read/update and no delete', () => {
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "knowledge_card_cross_reviews" TO copiloto_app',
    );
    expect(sql).toContain(
      'REVOKE DELETE, TRUNCATE ON TABLE "knowledge_card_cross_reviews" FROM copiloto_app',
    );
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*(DELETE|TRUNCATE)/i);
    expect(sql).toContain(
      "has_table_privilege('copiloto_app', 'knowledge_card_cross_reviews', privilege)",
    );
  });

  it('keeps the second reviewer distinct from the first and from the author', () => {
    expect(sql).toContain('"reviewer_id" IS DISTINCT FROM "first_reviewer_id"');
    expect(sql).toContain('"reviewer_id" IS DISTINCT FROM "version_author_id"');
  });

  it('freezes the draw and the decision with a trigger', () => {
    expect(sql).toContain('BEFORE UPDATE ON "knowledge_card_cross_reviews"');
    expect(sql).toContain('NEW.sample_bucket IS DISTINCT FROM OLD.sample_bucket');
    expect(sql).toContain("OLD.status <> 'pending'");
  });

  it('never cascades a cross review away', () => {
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/ON DELETE SET NULL/);
  });
});

/**
 * CC-012 — a eliminação LGPD desvincula ai_calls do médico e apaga MFA, CRM,
 * vínculos institucionais e estado de login com a role de runtime.
 */
describe('CC-012 erasure privileges migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20261016120000_cc_012_lgpd_erasure_privileges/migration.sql',
    ),
    'utf8',
  );

  it('grants UPDATE only on the link columns of ai_calls, never on the whole table', () => {
    expect(sql).toContain(
      'GRANT UPDATE ("physician_id", "encounter_id", "request_id") ON TABLE "ai_calls" TO copiloto_app',
    );
    expect(sql).not.toMatch(/GRANT\s+UPDATE\s+ON\s+TABLE\s+"ai_calls"/i);
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(sql).toContain("has_column_privilege('copiloto_app', 'ai_calls', 'cost_usd', 'UPDATE')");
    expect(sql).toContain("has_table_privilege('copiloto_app', 'ai_calls', 'DELETE')");
  });

  it.each([
    'mfa_backup_codes',
    'crm_verification_requests',
    'physician_institutions',
    'login_security_states',
  ])('grants and smoke-checks DELETE on %s', (table) => {
    expect(sql).toMatch(new RegExp(`GRANT DELETE ON TABLE[^;]*"${table}"[^;]*TO copiloto_app`));
    expect(sql).toContain(`'${table}'`);
  });
});

/**
 * CC-406 — o índice semântico é derivado dos cartões: a API apaga linhas dele
 * (arquivar, vencer), e apagar o índice nunca apaga nada assinado.
 */
describe('CC-406 migration 20261015120000_cc_406_knowledge_card_index', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20261015120000_cc_406_knowledge_card_index/migration.sql',
    ),
    'utf8',
  );

  it('grants only DML on the derived index and smoke-checks it', () => {
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_card_index" TO copiloto_app',
    );
    expect(sql).toContain('REVOKE TRUNCATE ON TABLE "knowledge_card_index" FROM copiloto_app');
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(sql).toContain("has_table_privilege('copiloto_app', 'knowledge_card_index', privilege)");
  });

  it('cascades only from the card to its index row, never the other way', () => {
    expect(sql).toContain(
      'FOREIGN KEY ("card_id") REFERENCES "knowledge_cards"("id") ON DELETE CASCADE',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("version_id") REFERENCES "knowledge_card_versions"("id") ON DELETE CASCADE',
    );
    expect(sql).not.toMatch(/ALTER TABLE "knowledge_card(s|_versions)"/);
  });

  it('keeps the vector dimension open so a provider change is a reindex, not a migration', () => {
    expect(sql).toMatch(/"embedding" vector,/);
    expect(sql).toContain('knowledge_card_index_embedding_model_check');
  });
});
