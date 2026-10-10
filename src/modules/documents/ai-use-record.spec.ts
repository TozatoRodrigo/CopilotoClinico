import { describe, it, expect } from 'vitest';
import { AI_USE_RECORD_TEXT, aiUseRecordOf, withAiUseRecord } from './ai-use-record';

describe('F0-D — registro de uso de IA (Res. CFM 2.454/2026)', () => {
  it('cita a resolução, o copiloto como IA e a confirmação pelo médico', () => {
    expect(AI_USE_RECORD_TEXT).toContain('Res. CFM 2.454/2026');
    expect(AI_USE_RECORD_TEXT).toContain('inteligência artificial');
    expect(AI_USE_RECORD_TEXT).toContain('revisado e confirmado pelo médico responsável');
  });

  it.each(['soap', 'sbar', 'alta'] as const)('entra no conteúdo do %s', (type) => {
    expect(withAiUseRecord(type, { plan: 'x' })).toEqual({
      plan: 'x',
      aiUseRecord: AI_USE_RECORD_TEXT,
    });
  });

  // Decisão jurídica pendente — ver comentário em ai-use-record.ts.
  it.each(['prescricao', 'atestado'] as const)('ainda não entra no conteúdo da %s', (type) => {
    expect(withAiUseRecord(type, { paciente: 'x' })).toEqual({ paciente: 'x' });
  });

  describe('aiUseRecordOf', () => {
    it('lê o registro gravado no conteúdo', () => {
      expect(aiUseRecordOf({ aiUseRecord: 'texto da época' })).toBe('texto da época');
    });

    it.each([
      ['documento anterior à mudança', { plan: 'x' }],
      ['registro vazio', { aiUseRecord: '  ' }],
      ['registro não textual', { aiUseRecord: 42 }],
      ['conteúdo nulo', null],
      ['conteúdo em lista', ['x']],
    ])('devolve null para %s', (_label, content) => {
      expect(aiUseRecordOf(content)).toBeNull();
    });
  });
});
