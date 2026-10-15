import { describe, expect, it } from 'vitest';
import { lactateMmolToMgDl, lactateToMmol } from '../../src/shared/clinical-tools/shock/lactate';
import { classifyPerfusion } from '../../src/shared/clinical-tools/shock/perfusion-quadrant';
import {
  computeVneri,
  evaluateVneri,
  vneriZone,
} from '../../src/shared/clinical-tools/shock/vneri';

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

// Origem: calculations.test.ts › calcVNERi (CC-317). No ANY, dose, FC ou PAD
// zero devolviam null; no motor o zero está fora da faixa do campo e o VNERi
// fica pendente (não vira número).
describe('calcVNERi → computeVneri / evaluateVneri', () => {
  it('calcula VNERi corretamente', () => {
    // PAD=60, doseNE=0.3, FC=100 -> 60/(0.3*100) = 2.0
    expect(computeVneri(60, 0.3, 100)).toBe(2);
  });

  it('não calcula com dose zero', () => {
    expect(evaluateVneri({ pad: '60', doseNE: '0', fc: '100' }).status).toBe('pending');
  });

  it('não calcula com FC zero', () => {
    expect(evaluateVneri({ pad: '60', doseNE: '0,3', fc: '0' }).status).toBe('pending');
  });

  it('não calcula com PAD zero', () => {
    expect(evaluateVneri({ pad: '0', doseNE: '0,3', fc: '100' }).status).toBe('pending');
  });
});

// Origem: calculations.test.ts › getVNERiZone (CC-317). A cor virou tom
// (ADR-017) e "Tonus" ganhou acento.
describe('getVNERiZone → vneriZone', () => {
  it('classifica hiporresponsividade grave (< 2.6)', () => {
    const zone = vneriZone(1.5);
    expect(zone.label).toBe('Hiporresponsividade grave');
    expect(zone.tone).toBe('critical');
  });

  it('classifica resposta parcial (2.6-6.7)', () => {
    expect(vneriZone(4.0).label).toBe('Resposta parcial');
  });

  it('classifica resposta adequada (6.7-10.8)', () => {
    const zone = vneriZone(8.0);
    expect(zone.label).toBe('Resposta adequada');
    expect(zone.tone).toBe('neutral');
  });

  it('classifica tônus preservado (>= 10.8)', () => {
    expect(vneriZone(12.0).label).toBe('Tônus preservado');
  });
});

// Origem: calculations.test.ts › getQuadrant (CC-317). Os ids viraram
// português e a ordem dos argumentos é (SvcO2, gap).
describe('getQuadrant → classifyPerfusion', () => {
  it('identifica baixo débito (SvcO2 < 70, gap CO2 > 6)', () => {
    expect(classifyPerfusion(60, 8).id).toBe('baixo-debito');
  });

  it('identifica disóxia anêmica (SvcO2 < 70, gap CO2 <= 6)', () => {
    expect(classifyPerfusion(60, 4).id).toBe('disoxia-anemica');
  });

  it('identifica microcirculação inadequada (SvcO2 >= 70, gap CO2 > 6)', () => {
    expect(classifyPerfusion(75, 8).id).toBe('microcirculacao-inadequada');
  });

  it('identifica hipóxia citopática (SvcO2 >= 70, gap CO2 <= 6)', () => {
    expect(classifyPerfusion(75, 4).id).toBe('hipoxia-citopatica');
  });
});
