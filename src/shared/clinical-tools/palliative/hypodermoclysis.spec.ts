import { describe, expect, it } from 'vitest';
import {
  COMPATIBILITY_DRUGS,
  COMPATIBILITY_MATRIX,
  compatibilityDisagreements,
  compatibilityGaps,
  searchSubcutaneousMedications,
  SUBCUTANEOUS_MEDICATIONS,
} from './hypodermoclysis';

describe('medicações por via subcutânea', () => {
  it('tem as 19 drogas do ANY, sem nome repetido', () => {
    const names = SUBCUTANEOUS_MEDICATIONS.map(({ name }) => name);
    expect(names).toHaveLength(19);
    expect(new Set(names).size).toBe(19);
  });

  it('busca pelo nome sem acento e sem caixa; vazia devolve tudo', () => {
    expect(searchSubcutaneousMedications('  ')).toBe(SUBCUTANEOUS_MEDICATIONS);
    expect(searchSubcutaneousMedications('ESCOPOLÂMINA').map(({ name }) => name)).toEqual([
      'Escopolamina',
    ]);
    expect(searchSubcutaneousMedications('cef').map(({ name }) => name)).toEqual([
      'Cefepime',
      'Ceftriaxona',
    ]);
    expect(searchSubcutaneousMedications('oxicodona')).toEqual([]);
  });
});

describe('matriz de compatibilidade', () => {
  it('é 15 × 15, com uma linha por droga', () => {
    expect(COMPATIBILITY_DRUGS).toHaveLength(15);
    for (const { id } of COMPATIBILITY_DRUGS) {
      expect(COMPATIBILITY_MATRIX[id], id).toHaveLength(15);
    }
  });

  it('marca "sem dado" só a coluna DEX, que o ANY deixa vazia em todas as linhas', () => {
    expect(compatibilityGaps()).toHaveLength(15);
    expect(new Set(compatibilityGaps().map(({ column }) => column))).toEqual(
      new Set(['dexametasona']),
    );
  });

  it('a linha da dexametasona é incompatível com todas as outras colunas', () => {
    expect(COMPATIBILITY_MATRIX.dexametasona.slice(0, 14).every((cell) => cell === 'I')).toBe(true);
  });

  it('lista os pares em que linha × coluna e coluna × linha discordam', () => {
    const disagreements = compatibilityDisagreements();
    expect(disagreements).toHaveLength(37);
    // Ex.: Cefepime × Morfina diz I, Morfina × Cefepime diz C.
    expect(disagreements).toContainEqual({ a: 'cefepime', b: 'morfina', aWithB: 'I', bWithA: 'C' });
    // Nenhum par com célula sem dado entra na conta.
    expect(disagreements.some(({ b }) => b === 'dexametasona')).toBe(false);
  });
});
