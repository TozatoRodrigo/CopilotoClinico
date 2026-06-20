/**
 * Testes unitários — S20-CLIN-01: red flags explícitas no analyze
 *
 * Antes deste change, os chips de red flags (Imunossuprimido, Gestante, etc.)
 * eram cosméticos: colhidos na UI mas nunca enviados ao backend. O ZodValidationPipe
 * faria strip deles mesmo se fossem enviados.
 *
 * Referência: https://app.clickup.com/t/86aj45q3z
 */
import { describe, it, expect } from 'vitest';
import { analyzeSchema } from './copilot.schemas';

const validBase = {
  caseText: 'Paciente com síndrome gripal há 3 dias.',
  context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
};

describe('S20-CLIN-01 — analyzeSchema.redFlags', () => {
  it('aceita payload sem redFlags e retorna undefined (retrocompatível)', () => {
    const result = analyzeSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      // .optional() sem .default() — redFlags fica undefined quando não vem.
      expect(result.data.redFlags).toBeUndefined();
    }
  });

  it('aceita payload com redFlags populadas', () => {
    const result = analyzeSchema.safeParse({
      ...validBase,
      redFlags: {
        immunosuppressed: true,
        pregnant: false,
        anticoagulant: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.redFlags).toEqual({
        immunosuppressed: true,
        pregnant: false,
        anticoagulant: true,
      });
    }
  });

  it('preserva todas as chaves canônicas definidas no front (RED_FLAG_CHIPS)', () => {
    const result = analyzeSchema.safeParse({
      ...validBase,
      redFlags: {
        immunosuppressed: true,
        pregnant: true,
        anticoagulant: true,
        pediatric: true,
        elderly65: true,
        allergy: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.redFlags ?? {}).sort()).toEqual(
        ['allergy', 'anticoagulant', 'elderly65', 'immunosuppressed', 'pediatric', 'pregnant'].sort(),
      );
    }
  });

  it('tolera chaves desconhecidas (extensibilidade sem quebrar cliente)', () => {
    const result = analyzeSchema.safeParse({
      ...validBase,
      redFlags: {
        immunosuppressed: true,
        customFutureFlag: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.redFlags?.customFutureFlag).toBe(true);
    }
  });

  it('rejeita valores não-booleanos em redFlags', () => {
    const result = analyzeSchema.safeParse({
      ...validBase,
      redFlags: { immunosuppressed: 'sim' as unknown as boolean },
    });
    expect(result.success).toBe(false);
  });

  it('rejeita redFlags como array em vez de record', () => {
    const result = analyzeSchema.safeParse({
      ...validBase,
      redFlags: ['immunosuppressed'],
    });
    expect(result.success).toBe(false);
  });

  it('não altera o comportamento de context e demoCase (sem regressão)', () => {
    const result = analyzeSchema.safeParse({
      caseText: 'Caso válido.',
      context: { hasCT: true, isSus: true, hasLab: true, hasICU: true },
      demoCase: 'flu-norte',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toEqual({
        hasCT: true,
        isSus: true,
        hasLab: true,
        hasICU: true,
      });
      expect(result.data.demoCase).toBe('flu-norte');
    }
  });
});
