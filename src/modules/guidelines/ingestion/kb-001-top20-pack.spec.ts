import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseGuidelineDocument } from './front-matter';

const PACK_DIR = join(process.cwd(), 'docs/guidelines/drafts/kb-001-top20-ps');

describe('KB-001 top-20 curation pack', () => {
  it('contains 20 draft scenarios with cenario and red_flags metadata', () => {
    const files = readdirSync(PACK_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort();

    expect(files).toHaveLength(20);

    const cenarios = new Set<string>();

    for (const file of files) {
      const raw = readFileSync(join(PACK_DIR, file), 'utf-8');
      const parsed = parseGuidelineDocument(raw);

      expect(parsed.meta.cenario).toBeTruthy();
      expect(parsed.meta.redFlags?.length ?? 0).toBeGreaterThanOrEqual(3);

      cenarios.add(parsed.meta.cenario!);
    }

    expect(cenarios.size).toBe(20);
  });

  it('includes the canonical gripe >48h retrieval language in the influenza draft', () => {
    const raw = readFileSync(join(PACK_DIR, '01-sindrome-gripal-ivas.md'), 'utf-8');
    const parsed = parseGuidelineDocument(raw);
    const normalized = parsed.body.toLowerCase();

    expect(parsed.meta.cenario).toBe('sindrome_gripal_ivas');
    expect(normalized).toContain('mais de 48 horas');
    expect(normalized).toContain('oseltamivir');
    expect(normalized).toContain('imunossuprim');
  });
});
