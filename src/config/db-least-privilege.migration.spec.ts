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
] as const;

describe.each(F0D_MIGRATIONS)('F0-D migration $dir', ({ dir, table }) => {
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

/**
 * CC-405 — importação do ANY: o valor novo do enum vem numa migration sozinha
 * (só pode ser usado depois de confirmado), a importação é escrita uma vez, e
 * a origem e os achados da versão ficam congelados pelo trigger.
 */
describe('CC-405 migrations', () => {
  const read = (dir: string) =>
    readFileSync(join(process.cwd(), `prisma/migrations/${dir}/migration.sql`), 'utf8');
  const enumSql = read('20261016120000_cc_405_author_kind_import');
  const sql = read('20261016120100_cc_405_any_card_import');

  it('adiciona a autoria import numa migration sem mais nada', () => {
    expect(enumSql).toContain(`ALTER TYPE "KnowledgeCardAuthorKind" ADD VALUE 'import';`);
    expect(
      enumSql
        .replace(/--.*$/gm, '')
        .trim()
        .split(';')
        .filter((part) => part.trim()),
    ).toHaveLength(1);
  });

  it('grava a importação uma vez só e nunca apaga nada assinado', () => {
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE "knowledge_card_imports" TO copiloto_app');
    expect(sql).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "knowledge_card_imports" FROM copiloto_app',
    );
    expect(sql).toContain(
      "has_table_privilege('copiloto_app', 'knowledge_card_imports', privilege)",
    );
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/GRANT[^;]*(DELETE|TRUNCATE)/i);
  });

  it('chave do item única, autoria import ligada à importação e trigger com origem e achados', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "knowledge_cards_source_key_key"');
    expect(sql).toContain(
      `("author_kind" = 'import' AND "import_id" IS NOT NULL AND "draft_id" IS NULL AND "author_physician_id" IS NULL)`,
    );
    expect(sql).toContain('NEW.import_id IS DISTINCT FROM OLD.import_id');
    expect(sql).toContain('NEW.review_flags IS DISTINCT FROM OLD.review_flags');
    expect(sql).toContain('OLD.review_decision IS NOT NULL');
  });
});
