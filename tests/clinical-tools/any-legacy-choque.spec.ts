import { describe, expect, it } from 'vitest';
import { lactateMmolToMgDl, lactateToMmol } from '../../src/shared/clinical-tools/shock/lactate';

/**
 * Testes do branch antigo do ANY (claude/update-test-database-M10pD, revisão
 * 649d2ae, arquivo v2/src/utils/calculations.test.ts) que cobrem o choque,
 * com os nomes novos do motor. Cada `describe` cita a função de origem.
 */

// Origem: calculations.test.ts › lactatoConvert (CC-316)
describe('lactatoConvert → lactateMmolToMgDl / lactateToMmol', () => {
  it('converte mmol/L para mg/dL', () => {
    expect(lactateMmolToMgDl(2)).toBe(18);
  });

  it('converte mg/dL para mmol/L', () => {
    expect(lactateToMmol(18, 'mg/dL')).toBe(2);
  });
});
