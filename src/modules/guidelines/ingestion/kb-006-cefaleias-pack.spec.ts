import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseGuidelineDocument } from './front-matter';

const PACK_DIR = join(process.cwd(), 'docs/guidelines/drafts/kb-006-cefaleias-primarias');

function readPack() {
  return readdirSync(PACK_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ file, parsed: parseGuidelineDocument(readFileSync(join(PACK_DIR, file), 'utf-8')) }));
}

/**
 * KB-006 — Origem: caso de provável cefaleia em salvas reportado por médico
 * piloto, em que o Copiloto apontou hemorragia intracerebral. A base tinha
 * apenas conteúdo de cefaleia SECUNDÁRIA (`05-cefaleia.md` do KB-001, que
 * inclusive instrui o retrieval a puxar "cefaleia em trovoada", e o pacote de
 * HSA do KB-003); nenhum chunk descrevia uma cefaleia primária, então não
 * existia evidência recuperável que sustentasse o diagnóstico correto. Este
 * pacote adiciona o lado primário e o transforma em par de subtipos do mesmo
 * cenario `cefaleia` já curado no KB-001 — sem isso o guardrail de coerência
 * (output-validator.ts `findUnresolvedSubtypeAmbiguity`) não tem os dois lados
 * para comparar.
 */
describe('KB-006 curation pack — cefaleias primárias x secundárias', () => {
  it('contains 3 draft files with cenario, subtipo and red_flags metadata', () => {
    const pack = readPack();

    expect(pack).toHaveLength(3);

    for (const { file, parsed } of pack) {
      expect(parsed.meta.cenario, `${file} sem cenario`).toBeTruthy();
      expect(parsed.meta.subtipo, `${file} sem subtipo`).toBeTruthy();
      expect(
        parsed.meta.redFlags?.length ?? 0,
        `${file} com menos de 3 red_flags`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('reuses the KB-001 cenario "cefaleia" with exactly 2 mutually exclusive subtipos', () => {
    const pack = readPack();

    expect(new Set(pack.map(({ parsed }) => parsed.meta.cenario))).toEqual(new Set(['cefaleia']));
    expect(new Set(pack.map(({ parsed }) => parsed.meta.subtipo))).toEqual(
      new Set(['primaria', 'secundaria']),
    );
  });

  it('carries the discriminators that separate cefaleia em salvas from an intracranial bleed', () => {
    const bodies = readPack().map(({ parsed }) => parsed.body).join('\n');

    // Duração autolimitada e repetição estereotipada — o padrão que a base não tinha.
    expect(bodies).toContain('15 a 180 minutos');
    // Trovoada definida por tempo até o pico, não por intensidade relatada.
    expect(bodies).toContain('MENOS DE 1 MINUTO');
    // Tratamento abortivo com eficácia demonstrada (Cohen, JAMA 2009).
    expect(bodies).toContain('12 a 15 L/min');
    // A lista de alertas que decide entre primária e secundária.
    expect(bodies).toContain('SNNOOP10');
  });
});
