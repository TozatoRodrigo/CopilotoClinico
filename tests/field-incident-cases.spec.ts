import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseGuidelineDocument } from '../src/modules/guidelines/ingestion/front-matter';
import { FIELD_INCIDENT_CASES } from './fixtures/field-incident-cases';

const DRAFTS_DIR = join(process.cwd(), 'docs/guidelines/drafts');

function packMetadata(pack: string) {
  const dir = join(DRAFTS_DIR, pack);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parseGuidelineDocument(readFileSync(join(dir, file), 'utf-8')).meta);
}

/**
 * Guarda de cobertura: todo incidente reportado em campo precisa ter um pacote
 * de curadoria que cubra o cenario (e o subtipo, quando o erro foi de
 * classificação). Sem isso, o retrieval continua entregando o cenário vizinho
 * — que é exatamente a causa raiz dos dois casos abaixo.
 */
describe('casos de incidente reportados em campo', () => {
  it.each(FIELD_INCIDENT_CASES)(
    '$id tem cobertura na base de contexto',
    ({ expectedCenario, expectedSubtipo, coveredByPack, wrongCenario }) => {
      const metas = packMetadata(coveredByPack);

      expect(metas.some((meta) => meta.cenario === expectedCenario)).toBe(true);

      if (expectedSubtipo) {
        expect(
          metas.some(
            (meta) => meta.cenario === expectedCenario && meta.subtipo === expectedSubtipo,
          ),
        ).toBe(true);
      }

      // O pacote não pode simplesmente renomear o cenário errado: o cenário
      // para onde o Copiloto foi tem que continuar existindo em outro lugar da
      // base, como diferencial, e não ser absorvido por este pacote.
      expect(metas.every((meta) => meta.cenario !== wrongCenario)).toBe(true);
    },
  );

  it('nomeia os discriminadores que a resposta precisa citar para justificar o lado escolhido', () => {
    for (const testCase of FIELD_INCIDENT_CASES) {
      expect(testCase.discriminators.length, `${testCase.id} com poucos discriminadores`).toBeGreaterThanOrEqual(3);
      expect(testCase.clinicalInput.length, `${testCase.id} com input curto demais`).toBeGreaterThan(200);
    }
  });
});
