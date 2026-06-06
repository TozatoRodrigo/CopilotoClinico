import { describe, it, expect } from 'vitest';
import { maskPII } from './pii-filter';

describe('maskPII', () => {
  it('masks formatted CPF numbers', () => {
    const result = maskPII('Paciente CPF 123.456.789-00 internado');
    expect(result.redacted).toBe('Paciente CPF [REDACTED_CPF] internado');
    expect(result.detections[0]!.type).toBe('cpf');
    expect(result.detections[0]!.original).toBe('123.456.789-00');
    expect(result.hasPII).toBe(true);
  });

  it('masks unformatted CPF numbers', () => {
    const result = maskPII('CPF do paciente: 12345678900');
    expect(result.redacted).toBe('CPF do paciente: [REDACTED_CPF]');
    expect(result.detections[0]!.original).toBe('12345678900');
  });

  it('masks email addresses', () => {
    const result = maskPII('Contato: paciente@email.com para retorno');
    expect(result.redacted).toBe('Contato: [REDACTED_EMAIL] para retorno');
    expect(result.detections[0]!.type).toBe('email');
  });

  it('masks phone numbers with country code', () => {
    const result = maskPII('Ligar para +55 11 987654321');
    expect(result.redacted).toBe('Ligar para [REDACTED_PHONE]');
    expect(result.detections[0]!.type).toBe('phone');
  });

  it('masks phone numbers without country code', () => {
    const result = maskPII('Telefone: (11) 91234-5678');
    expect(result.redacted).toBe('Telefone: [REDACTED_PHONE]');
    expect(result.detections[0]!.type).toBe('phone');
  });

  it('masks CEP postal codes', () => {
    const result = maskPII('Endereço CEP 01001-000 centro');
    expect(result.redacted).toBe('Endereço CEP [REDACTED_CEP] centro');
    expect(result.detections[0]!.type).toBe('cep');
  });

  it('masks dates in DD/MM/YYYY format', () => {
    const result = maskPII('Nascimento: 15/03/1985');
    expect(result.redacted).toBe('Nascimento: [REDACTED_DATE]');
    expect(result.detections[0]!.type).toBe('date');
  });

  it('masks RG numbers', () => {
    const result = maskPII('RG: 12.345.678-9');
    expect(result.redacted).toBe('RG: [REDACTED_RG]');
    expect(result.detections[0]!.type).toBe('rg');
  });

  it('masks multiple PII types in same text', () => {
    const result = maskPII('Paciente joao@email.com CPF 123.456.789-00 tel (11) 91234-5678');
    expect(result.redacted).toContain('[REDACTED_EMAIL]');
    expect(result.redacted).toContain('[REDACTED_CPF]');
    expect(result.redacted).toContain('[REDACTED_PHONE]');
    expect(result.detections.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves clinical text without PII unchanged', () => {
    const clinical = 'Paciente com PA 120x80 e FC 80bpm, afebril';
    const result = maskPII(clinical);
    expect(result.redacted).toBe(clinical);
    expect(result.hasPII).toBe(false);
  });

  it('preserves vital signs and clinical numbers', () => {
    const result = maskPII('PA 120x80 FC 80bpm SpO2 98% Temp 36.5');
    expect(result.redacted).toBe('PA 120x80 FC 80bpm SpO2 98% Temp 36.5');
    expect(result.hasPII).toBe(false);
  });

  it('returns hasPII false when no PII found', () => {
    const result = maskPII('Paciente estável, sem alterações');
    expect(result.hasPII).toBe(false);
    expect(result.detections).toEqual([]);
  });

  it('returns hasPII true when PII found', () => {
    const result = maskPII('Email: teste@teste.com');
    expect(result.hasPII).toBe(true);
    expect(result.detections.length).toBeGreaterThan(0);
  });
});
