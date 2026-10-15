import { describe, expect, it } from 'vitest';
import {
  buildBlockEvolutionNote,
  EMPTY_EVOLUTION_FORM,
  EVOLUTION_ANESTHETICS,
  EVOLUTION_BLOCK_TYPES,
} from './evolution';

describe('nota de evolução do bloqueio (CC-330)', () => {
  it('em branco, sai com "--" e os padrões do ANY', () => {
    expect(buildBlockEvolutionNote(EMPTY_EVOLUTION_FORM)).toBe(
      [
        'BLOQUEIO REGIONAL GUIADO POR ULTRASSOM',
        'Indicação: --',
        'Bloqueio: -- ',
        'Transdutor: --',
        'Agulha: --',
        'Técnica: --',
        'Anestésico: --',
        'Volume: -- mL | Dose: -- mg',
        'Epinefrina: --',
        'Avaliação pós-bloqueio:',
        '- Bloqueio sensitivo presente',
        '- Ausência de sinais de LAST',
        'Intercorrências: Nenhuma',
        'Responsável: --',
        'CRM: --',
      ].join('\n'),
    );
  });

  it('preenchida, com vírgula decimal e intercorrência descrita', () => {
    const note = buildBlockEvolutionNote({
      ...EMPTY_EVOLUTION_FORM,
      indication: 'Fratura de colo femoral D',
      blockType: 'PENG',
      side: 'D',
      transducer: 'Curvo 2-5 MHz',
      needle: 'Ecogênica 100mm',
      insertion: 'Em plano',
      anesthetic: 'Bupivacaína 0,25%',
      volumeMl: 20.5,
      doseMg: 51.25,
      epinephrine: 'Não',
      motorBlock: true,
      lastSignsAbsent: false,
      complication: 'Sim',
      complicationDescription: 'Parestesia transitória',
    });
    expect(note).toContain('Bloqueio: PENG (D)');
    expect(note).toContain('Volume: 20,5 mL | Dose: 51,25 mg');
    expect(note).toContain('- Bloqueio motor presente');
    expect(note).toContain('- ATENÇÃO: sinais de LAST');
    expect(note).toContain('Intercorrências: Parestesia transitória');
  });

  it('intercorrência sem descrição sai como "Sim"', () => {
    const note = buildBlockEvolutionNote({ ...EMPTY_EVOLUTION_FORM, complication: 'Sim' });
    expect(note).toContain('Intercorrências: Sim');
  });

  it('oferece os 14 bloqueios e as seis concentrações da calculadora', () => {
    expect(EVOLUTION_BLOCK_TYPES).toHaveLength(14);
    expect(EVOLUTION_ANESTHETICS).toEqual([
      'Lidocaína 1%',
      'Lidocaína 2%',
      'Bupivacaína 0,25%',
      'Bupivacaína 0,5%',
      'Ropivacaína 0,2%',
      'Ropivacaína 0,5%',
    ]);
  });
});
