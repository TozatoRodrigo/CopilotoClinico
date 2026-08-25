import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseGuidelineDocument } from './front-matter';

const PACK_DIR = join(process.cwd(), 'docs/guidelines/drafts/kb-004-dicotomias-plantao');

/**
 * S21-CLIN-01 — Regressão do pacote KB-004: pares de subtipo mutuamente
 * exclusivo, com conduta oposta, para cenários comuns de plantão/emergência
 * além do caso original de AVC (ver KB-003). Cada arquivo cobre exatamente
 * um lado de um par; o teste garante que todo `cenario` do pacote tem
 * exatamente 2 subtipos distintos — sem isso, o guardrail de coerência
 * diagnóstica (output-validator.ts `findUnresolvedSubtypeAmbiguity`) nunca
 * teria ambiguidade para detectar, porque a checagem exige ≥2 subtipos
 * distintos retornados para o mesmo cenario.
 */
describe('KB-004 curation pack — dicotomias cannot-miss de plantão', () => {
  it('contains 10 draft scenarios with cenario, subtipo and red_flags metadata', () => {
    const files = readdirSync(PACK_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort();

    expect(files).toHaveLength(10);

    for (const file of files) {
      const raw = readFileSync(join(PACK_DIR, file), 'utf-8');
      const parsed = parseGuidelineDocument(raw);

      expect(parsed.meta.cenario, `${file} sem cenario`).toBeTruthy();
      expect(parsed.meta.subtipo, `${file} sem subtipo`).toBeTruthy();
      expect(
        parsed.meta.redFlags?.length ?? 0,
        `${file} com menos de 3 red_flags`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('every cenario in the pack has exactly 2 distinct, mutually exclusive subtipos (required for the guardrail to engage once approved)', () => {
    const files = readdirSync(PACK_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort();

    const byCenario = new Map<string, Set<string>>();
    for (const file of files) {
      const raw = readFileSync(join(PACK_DIR, file), 'utf-8');
      const { meta } = parseGuidelineDocument(raw);
      if (!meta.cenario || !meta.subtipo) continue;
      if (!byCenario.has(meta.cenario)) byCenario.set(meta.cenario, new Set());
      byCenario.get(meta.cenario)!.add(meta.subtipo);
    }

    expect(byCenario.size).toBe(5); // hipoglicemia_hiperglicemia, anafilaxia_urticaria, choque_indiferenciado, crise_hipertensiva, ansiedade_agitacao_ps

    for (const [cenario, subtipos] of byCenario) {
      expect(
        subtipos.size,
        `cenario "${cenario}" não tem exatamente 2 subtipos: ${[...subtipos]}`,
      ).toBe(2);
    }
  });

  it('reuses cenario values already curated in KB-001 where a matching general-overview file exists, instead of fragmenting retrieval into a parallel cenario', () => {
    const files = readdirSync(PACK_DIR)
      .filter((file) => file.endsWith('.md'))
      .sort();

    const cenarios = new Set(
      files.map(
        (file) => parseGuidelineDocument(readFileSync(join(PACK_DIR, file), 'utf-8')).meta.cenario,
      ),
    );

    // Cenários que já existem como visão geral em KB-001 (ver
    // docs/guidelines/drafts/kb-001-top20-ps/{11,12,15,20}-*.md) — o pacote
    // KB-004 deve reusar exatamente esses nomes, não inventar variantes.
    expect(cenarios.has('crise_hipertensiva')).toBe(true);
    expect(cenarios.has('hipoglicemia_hiperglicemia')).toBe(true);
    expect(cenarios.has('anafilaxia_urticaria')).toBe(true);
    expect(cenarios.has('ansiedade_agitacao_ps')).toBe(true);
  });
});
