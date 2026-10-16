import { describe, it, expect } from 'vitest';
import { restoreStructuredFields } from './structured-fields';

const generated = {
  orientacoes: '- Retornar se febre',
  medicamentos: [{ medicamento: 'Dipirona', dosagem: '1 g' }],
  incerteza: true,
  avisoRevisao: null,
};

describe('restoreStructuredFields', () => {
  it('restaura lista e booleano achatados em texto e diz quais campos voltaram', () => {
    const result = restoreStructuredFields(generated, {
      ...generated,
      medicamentos: '[object Object]',
      incerteza: '',
    });

    expect(result.physicianEdits).toEqual(generated);
    expect(result.restoredFields).toEqual(['medicamentos', 'incerteza']);
  });

  it('restaura campo estruturado que a edição omitiu', () => {
    const { incerteza: _omitted, ...withoutFlag } = generated;

    const result = restoreStructuredFields(generated, withoutFlag);

    expect(result.physicianEdits.incerteza).toBe(true);
    expect(result.restoredFields).toEqual(['incerteza']);
  });

  it('não toca em campos de texto nem em campos que só existem na edição', () => {
    const edits = {
      ...generated,
      orientacoes: 'Texto do médico',
      avisoRevisao: '',
      medicamentos_raw: 'Dipirona — 500 mg',
    };

    const result = restoreStructuredFields(generated, edits);

    expect(result.physicianEdits).toBe(edits);
    expect(result.restoredFields).toEqual([]);
  });

  it('aceita estrutura alterada que mantém o tipo', () => {
    const edits = { ...generated, medicamentos: [], incerteza: false };

    expect(restoreStructuredFields(generated, edits).physicianEdits).toBe(edits);
  });

  it.each([
    ['conteúdo ausente', undefined],
    ['conteúdo nulo', null],
    ['conteúdo em lista', ['x']],
  ])('não restaura nada quando o %s', (_label, content) => {
    const edits = { medicamentos: '[object Object]' };

    expect(restoreStructuredFields(content, edits)).toEqual({
      physicianEdits: edits,
      restoredFields: [],
    });
  });
});
