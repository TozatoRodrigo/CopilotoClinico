import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261015180000_cc_905_legal_documents/migration.sql'),
  'utf8',
);

describe('CC-905 legal documents migration', () => {
  it('keeps published versions immutable for the runtime role', () => {
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE "legal_documents" TO copiloto_app');
    expect(sql).toContain(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "legal_documents" FROM copiloto_app',
    );
    expect(sql).toContain("has_table_privilege('copiloto_app', 'legal_documents', 'UPDATE')");
  });

  it('lets the API insert, read and erase acceptances, never update them', () => {
    expect(sql).toContain(
      'GRANT SELECT, INSERT, DELETE ON TABLE "legal_acceptances" TO copiloto_app',
    );
    expect(sql).toContain('REVOKE UPDATE, TRUNCATE ON TABLE "legal_acceptances" FROM copiloto_app');
    expect(sql).not.toMatch(/GRANT\s+ALL/i);
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
  });

  it('stores only the link and the date in an acceptance', () => {
    const table = /CREATE TABLE "legal_acceptances" \(([\s\S]*?)\);/.exec(sql)?.[1] ?? '';
    const columns = [...table.matchAll(/^\s+"(\w+)"/gm)].map((match) => match[1]);
    expect(columns).toEqual(['id', 'physician_id', 'document_id', 'accepted_at']);
  });

  it('accepts each version once and never drops an accepted version', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "legal_acceptances_physician_id_document_id_key" ON "legal_acceptances"("physician_id", "document_id")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version")',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE',
    );
  });
});
