import { describe, expect, it } from 'vitest';
import type { CalculatorEvaluation } from '../../src/shared/clinical-tools/calculator';
import { evaluateHacor, HACOR } from '../../src/shared/clinical-tools/ventilation/hacor';
import { hacorAnswersFor } from './hacor-options';

/**
 * CC-327 — testes do HACOR do branch antigo do ANY
 * (claude/update-test-database-M10pD, revisão 649d2ae,
 * v2/src/utils/calculations.test.ts › calcHACOR), na conta única do motor.
 *
 * O `calcHACOR` antigo recebia valores medidos; aqui o valor vira a opção que
 * o médico tocaria (hacorAnswersFor). Uma adaptação deliberada: no branch
 * antigo os pesos eram outros (Glasgow ≤ 10 valia 15, P/F tinha 5 faixas e a
 * FR era só "≥ 30: +1") e o máximo dava 26. O v4 corrigiu para os pesos de
 * Duan 2017 (0 a 25), que são os portados — o caso do máximo usa as opções
 * de maior peso do v4.
 */

function score(evaluation: CalculatorEvaluation): number {
  if (evaluation.status !== 'complete') throw new Error('HACOR incompleto');
  return evaluation.value;
}

describe('calcHACOR → HACOR (calculations.test.ts)', () => {
  it('calcula score zero para valores normais', () => {
    // FC < 120, pH ≥ 7,35, GCS 15, P/F > 200, FR ≤ 30
    expect(
      score(
        evaluateHacor(
          hacorAnswersFor({ tachycardia: false, ph: 7.4, gcs: 15, pf: 250, respiratoryRate: 25 }),
        ),
      ),
    ).toBe(0);
  });

  it('calcula score maximo (25 no v4; 26 com os pesos antigos)', () => {
    // FC ≥ 120 (+1), pH < 7,25 (+4), GCS ≤ 10 (+10), P/F ≤ 100 (+6), FR ≥ 46 (+4)
    expect(
      score(
        evaluateHacor(
          hacorAnswersFor({ tachycardia: true, ph: 7.2, gcs: 8, pf: 100, respiratoryRate: 50 }),
        ),
      ),
    ).toBe(25);
    const maximum = HACOR.items.reduce(
      (sum, item) => sum + Math.max(...item.options.map(({ points }) => points)),
      0,
    );
    expect(maximum).toBe(25);
  });

  it('soma componentes intermediarios', () => {
    // FC ≥ 120 (+1), pH 7,30-7,34 (+2), GCS 13-14 (+2), P/F 176-200 (+2), FR ≤ 30 (+0) = 7
    expect(
      score(
        evaluateHacor(
          hacorAnswersFor({ tachycardia: true, ph: 7.32, gcs: 14, pf: 180, respiratoryRate: 28 }),
        ),
      ),
    ).toBe(7);
  });
});
