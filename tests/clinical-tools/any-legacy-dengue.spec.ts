import { describe, expect, it } from 'vitest';
import { dengueHydration } from '../../src/shared/clinical-tools/dengue/hydration';

/**
 * CC-325 — testes de dengue do branch antigo do ANY
 * (claude/update-test-database-M10pD, revisão 649d2ae), com os nomes novos:
 * `calcDengueHydration` → `dengueHydration`, `voTotal` → `oralTotal`,
 * `ivHora` → `ivHourly`, `alb05`/`alb1` → `albuminLow`/`albuminHigh`.
 */

// Origem: v2/src/utils/calculations.test.ts › calcDengueHydration
describe('calcDengueHydration → dengueHydration (calculations.test.ts)', () => {
  it('calcula volumes para 70kg', () => {
    const result = dengueHydration(70);
    expect(result.oralTotal).toBe(4200); // 70*60
    expect(result.ivHourly).toBe(700); // 70*10
    expect(result.bolus).toBe(1400); // 70*20
  });

  it('calcula albumina corretamente', () => {
    const result = dengueHydration(70);
    // 0.5 g/kg: (70*0.5)/0.2 = 175 mL
    expect(result.albuminLow).toBe(175);
    // 1 g/kg: (70*1)/0.2 = 350 mL
    expect(result.albuminHigh).toBe(350);
  });
});
