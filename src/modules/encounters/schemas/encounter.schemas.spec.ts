/**
 * Testes unitários — LGPD-001: Validação do patientRef
 *
 * Garante que o campo patientRef não aceita dados pessoais identificáveis
 * como CPF ou nome completo, conforme LGPD Art. 13 (pseudonimização).
 *
 * Referência: https://app.clickup.com/t/90132565680/86ahx6fj7
 */
import { describe, it, expect } from 'vitest';
import {
  createEncounterSchema,
  updateEncounterSchema,
  isValidPatientRef,
  PATIENT_REF_VALIDATION_ERROR,
} from './encounter.schemas';

const validContext = { hasCT: false, isSus: false, hasLab: false, hasICU: false };

function parsePatientRef(patientRef: string) {
  return createEncounterSchema.safeParse({
    patientRef,
    vertical: 'trauma',
    context: validContext,
  });
}

describe('LGPD-001 — patientRef validation', () => {
  // ──── Cenários do DoD ──────────────────────────────────────────────────

  it('rejeita CPF sem formatação (11 dígitos numéricos)', () => {
    const result = parsePatientRef('12345678901');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('identificador opaco');
    }
  });

  it('rejeita nome completo "Maria Silva"', () => {
    const result = parsePatientRef('Maria Silva');
    expect(result.success).toBe(false);
  });

  it('aceita identificador de prontuário "PRN-2024-00123"', () => {
    const result = parsePatientRef('PRN-2024-00123');
    expect(result.success).toBe(true);
  });

  it('rejeita patientRef vazio', () => {
    const result = parsePatientRef('');
    expect(result.success).toBe(false);
  });

  it('aceita hash opaco "a1b2c3d4"', () => {
    const result = parsePatientRef('a1b2c3d4');
    expect(result.success).toBe(true);
  });

  // ──── Edge cases documentados ──────────────────────────────────────────

  it('rejeita CPF com formatação "000.000.000-00"', () => {
    const result = parsePatientRef('123.456.789-01');
    expect(result.success).toBe(false);
  });

  it('aceita número de 12 dígitos (NÃO é CPF — CPF tem exatamente 11)', () => {
    // "0012345678901" tem 13 dígitos — não deve ser bloqueado como CPF
    const result = parsePatientRef('001234567890');
    expect(result.success).toBe(true);
  });

  it('rejeita nome com partícula "João da Silva"', () => {
    const result = parsePatientRef('João da Silva');
    expect(result.success).toBe(false);
  });

  it('rejeita nome com três palavras "Ana Paula Costa"', () => {
    const result = parsePatientRef('Ana Paula Costa');
    expect(result.success).toBe(false);
  });

  it('aceita UUID como identificador opaco', () => {
    const result = parsePatientRef('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('aceita número de prontuário SUS longo', () => {
    const result = parsePatientRef('SUS-700-012345678');
    expect(result.success).toBe(true);
  });

  it('rejeita patientRef com mais de 50 caracteres', () => {
    const result = parsePatientRef('a'.repeat(51));
    expect(result.success).toBe(false);
  });

  // ──── Testes da função isValidPatientRef diretamente ──────────────────

  describe('isValidPatientRef()', () => {
    it('retorna false para CPF exato', () => {
      expect(isValidPatientRef('12345678901')).toBe(false);
    });

    it('retorna false para nome completo', () => {
      expect(isValidPatientRef('Carlos Eduardo Lima')).toBe(false);
    });

    it('retorna true para identificador opaco', () => {
      expect(isValidPatientRef('HOSP-2024-XK9L')).toBe(true);
    });

    it('retorna true para string numérica com 12 dígitos', () => {
      expect(isValidPatientRef('123456789012')).toBe(true);
    });
  });

  // ──── Mensagem de erro ────────────────────────────────────────────────

  it('mensagem de erro orienta sobre identificador opaco', () => {
    const result = parsePatientRef('12345678901');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe(PATIENT_REF_VALIDATION_ERROR);
    }
  });

  // S25-QC-01 — sem patientRef, o caso nasce como consulta rápida (fora do
  // Plantão até ser identificado depois). Omitir o campo é diferente de
  // mandar string vazia: omitido é válido (undefined), vazio continua
  // rejeitado ("rejeita patientRef vazio" acima, inalterado).
  describe('S25-QC-01: patientRef opcional na criação (consulta rápida)', () => {
    it('accepts a create request with patientRef entirely omitted', () => {
      const result = createEncounterSchema.safeParse({
        vertical: 'trauma',
        context: validContext,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patientRef).toBeUndefined();
      }
    });

    it('still rejects an explicit empty string (omitting is not the same as sending "")', () => {
      const result = parsePatientRef('');
      expect(result.success).toBe(false);
    });

    it('still applies LGPD-001 validation when patientRef IS provided (optional does not mean unvalidated)', () => {
      const result = parsePatientRef('12345678901');
      expect(result.success).toBe(false);
    });

    it('accepts a valid opaque patientRef same as before', () => {
      const result = parsePatientRef('PRN-2026-00456');
      expect(result.success).toBe(true);
    });
  });
});

// UX-04 — vertical passa a ser confirmável/corrigível depois da criação do
// caso (chip editável na tela de detalhe), não mais só no momento da
// captura. Este é o campo que o PATCH /encounters/:id precisa aceitar.
describe('updateEncounterSchema — UX-04', () => {
  it('accepts a valid vertical value on its own', () => {
    const result = updateEncounterSchema.safeParse({ vertical: 'cardiac' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vertical).toBe('cardiac');
    }
  });

  it('accepts vertical alongside status and context', () => {
    const result = updateEncounterSchema.safeParse({
      status: 'in_review',
      vertical: 'neuro',
      context: { hasCT: true, isSus: false, hasLab: false, hasICU: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a vertical value outside the canonical enum', () => {
    const result = updateEncounterSchema.safeParse({ vertical: 'oncologia' });
    expect(result.success).toBe(false);
  });

  it('remains valid with no fields at all (all optional, no regression)', () => {
    const result = updateEncounterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  // S25-QC-01 — PATCH /encounters/:id é o caminho para identificar o
  // paciente depois de uma consulta rápida, promovendo-a para um caso do
  // Plantão.
  describe('S25-QC-01: patientRef via update (identificar depois)', () => {
    it('accepts patientRef on its own to identify a quick consult later', () => {
      const result = updateEncounterSchema.safeParse({ patientRef: 'PRN-2026-00456' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patientRef).toBe('PRN-2026-00456');
      }
    });

    it('applies the same LGPD-001 validation as creation — still rejects CPF', () => {
      const result = updateEncounterSchema.safeParse({ patientRef: '12345678901' });
      expect(result.success).toBe(false);
    });

    it('applies the same LGPD-001 validation as creation — still rejects a full name', () => {
      const result = updateEncounterSchema.safeParse({ patientRef: 'Maria Silva' });
      expect(result.success).toBe(false);
    });
  });
});
