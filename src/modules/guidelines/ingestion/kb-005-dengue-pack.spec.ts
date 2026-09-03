import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseGuidelineDocument } from './front-matter';

const PACK_DIR = join(process.cwd(), 'docs/guidelines/drafts/kb-005-arboviroses-dengue');

function readPack() {
  return readdirSync(PACK_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ file, parsed: parseGuidelineDocument(readFileSync(join(PACK_DIR, file), 'utf-8')) }));
}

/**
 * KB-005 — Origem: caso de dengue reportado por médico piloto que o Copiloto
 * conduziu pelo caminho de sepse. A causa raiz é ausência de conteúdo de
 * arbovirose na base: sem chunk de dengue, a busca híbrida entrega os chunks
 * de sepse (febre + hipotensão são semanticamente próximos) e a regra 1 do
 * prompt obriga toda recomendação a citar um chunk recuperado — o modelo cita
 * o único material disponível. Este pacote fecha o gap de duas formas: dois
 * arquivos de visão geral do cenário `dengue_arbovirose` e um par de subtipos
 * mutuamente exclusivos em `febre_aguda_indiferenciada`, que é o que dá ao
 * guardrail de coerência (output-validator.ts `findUnresolvedSubtypeAmbiguity`)
 * dois lados para comparar quando os dois forem recuperados juntos.
 */
describe('KB-005 curation pack — arboviroses / dengue na emergência', () => {
  it('contains 4 draft files with cenario and red_flags metadata', () => {
    const pack = readPack();

    expect(pack).toHaveLength(4);

    for (const { file, parsed } of pack) {
      expect(parsed.meta.cenario, `${file} sem cenario`).toBeTruthy();
      expect(parsed.meta.source, `${file} sem source`).toBeTruthy();
      expect(parsed.meta.sourceVersion, `${file} sem sourceVersion`).toBeTruthy();
      expect(
        parsed.meta.redFlags?.length ?? 0,
        `${file} com menos de 3 red_flags`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('exposes the dengue x sepse dichotomy as exactly 2 subtipos of the same cenario (required for the coherence guardrail to engage)', () => {
    const subtipos = new Set(
      readPack()
        .filter(({ parsed }) => parsed.meta.cenario === 'febre_aguda_indiferenciada')
        .map(({ parsed }) => parsed.meta.subtipo),
    );

    expect(subtipos).toEqual(new Set(['dengue_arbovirose', 'sepse_bacteriana']));
  });

  it('keeps the dengue overview files on a dedicated cenario without subtipo, like the KB-001 general-overview files', () => {
    const overview = readPack().filter(({ parsed }) => parsed.meta.cenario === 'dengue_arbovirose');

    expect(overview).toHaveLength(2);
    for (const { file, parsed } of overview) {
      expect(parsed.meta.subtipo, `${file} não deveria declarar subtipo`).toBeUndefined();
    }
  });

  it('carries the numeric thresholds that make the dengue path actionable instead of generic', () => {
    const bodies = readPack().map(({ parsed }) => parsed.body).join('\n');

    // Reposição volêmica do MS 6ª ed. 2024 — Grupo C e Grupo D.
    expect(bodies).toContain('10 mL/kg');
    expect(bodies).toContain('20 mL/kg em até 20 minutos');
    // Janela da fase crítica: é o achado temporal que separa dengue de sepse.
    expect(bodies).toContain('defervescência');
    // Vômitos persistentes com a definição operacional da ABRAMEDE.
    expect(bodies).toContain('três ou mais episódios em 1 hora');
  });
});
