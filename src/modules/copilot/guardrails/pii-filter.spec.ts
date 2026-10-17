import { afterEach, describe, it, expect, vi } from 'vitest';
import { countDetectionsByType, maskPII } from './pii-filter';

const withContext = (text: string) => maskPII(text, { contextRules: true });

describe('maskPII', () => {
  it('masks formatted CPF numbers', () => {
    const result = maskPII('Paciente CPF 529.982.247-25 internado');
    expect(result.redacted).toBe('Paciente CPF [REDACTED_CPF] internado');
    expect(result.detections[0]!.type).toBe('cpf');
    expect(result.detections[0]!.original).toBe('529.982.247-25');
    expect(result.hasPII).toBe(true);
  });

  it('masks unformatted CPF numbers', () => {
    const result = maskPII('CPF do paciente: 52998224725');
    expect(result.redacted).toBe('CPF do paciente: [REDACTED_CPF]');
    expect(result.detections[0]!.original).toBe('52998224725');
  });

  it('does not mask invalid CPF-like clinical numbers', () => {
    const result = maskPII('Paciente com protocolo 111.111.111-11 e PA 120x80');
    expect(result.redacted).toBe('Paciente com protocolo 111.111.111-11 e PA 120x80');
    expect(result.hasPII).toBe(false);
  });

  it('masks CNS and Cartao SUS identifiers', () => {
    const result = maskPII('Cartao SUS 898001160497536 vinculado ao paciente');
    expect(result.redacted).toBe('Cartao SUS [REDACTED_CNS] vinculado ao paciente');
    expect(result.detections[0]!.type).toBe('cns');
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

  it('preserves clinical event dates without birth-date context', () => {
    const result = maskPII('Dor iniciou em 15/03/2024, retorno em 20/03/2024');
    expect(result.redacted).toBe('Dor iniciou em 15/03/2024, retorno em 20/03/2024');
    expect(result.hasPII).toBe(false);
  });

  it('masks RG numbers', () => {
    const result = maskPII('RG: 12.345.678-9');
    expect(result.redacted).toBe('RG: [REDACTED_RG]');
    expect(result.detections[0]!.type).toBe('rg');
  });

  it('masks multiple PII types in same text', () => {
    const result = maskPII('Paciente joao@email.com CPF 529.982.247-25 tel (11) 91234-5678');
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

// CC-201 — o número só sai com o rótulo antes; número solto é dado clínico.
describe('maskPII — record numbers by context (CC-201)', () => {
  it.each([
    ['prontuário 4587213', 'prontuário [REDACTED_RECORD]'],
    ['RH: 0012345', 'RH: [REDACTED_RECORD]'],
    ['registro HC 1234567', 'registro HC [REDACTED_RECORD]'],
    ['matrícula 98765', 'matrícula [REDACTED_RECORD]'],
  ])('masks the number in %j (acceptance criterion 1)', (text, expected) => {
    const result = withContext(text);
    expect(result.redacted).toBe(expected);
    expect(result.detections.map(({ type }) => type)).toEqual(['record']);
  });

  it.each([
    ['pront. nº 4.567', 'pront. nº [REDACTED_RECORD]'],
    ['Prontuário: nº 0045872-3.', 'Prontuário: nº [REDACTED_RECORD].'],
    ['PRONTUARIO 4587213', 'PRONTUARIO [REDACTED_RECORD]'],
    ['registro hospitalar 998877', 'registro hospitalar [REDACTED_RECORD]'],
    ['Registro 4471029.', 'Registro [REDACTED_RECORD].'],
    ['Reg. 6612345', 'Reg. [REDACTED_RECORD]'],
    ['BE 2024/123', 'BE [REDACTED_RECORD]'],
    ['Nº de atendimento 20241234', 'Nº de atendimento [REDACTED_RECORD]'],
    ['número do prontuário: 123456', 'número do prontuário: [REDACTED_RECORD]'],
    ['atendimento nº 556677', 'atendimento nº [REDACTED_RECORD]'],
    ['Boletim nº 88123', 'Boletim nº [REDACTED_RECORD]'],
    ['AIH 3524100012345', 'AIH [REDACTED_RECORD]'],
    ['FAA 302211', 'FAA [REDACTED_RECORD]'],
    ['ID do paciente 4400123', 'ID do paciente [REDACTED_RECORD]'],
  ])('masks the number in %j', (text, expected) => {
    expect(withContext(text).redacted).toBe(expected);
  });

  it('labels as record a number that would otherwise look like a phone or CEP', () => {
    const result = withContext('Prontuário 12345678, leito 4');
    expect(result.redacted).toBe('Prontuário [REDACTED_RECORD], leito 4');
    expect(result.detections[0]!.type).toBe('record');
  });

  it.each(['leito 12', 'PA 120x80', 'plaquetas 150000'])(
    'leaves %j untouched (acceptance criterion 2)',
    (text) => {
      const result = withContext(text);
      expect(result.redacted).toBe(text);
      expect(result.hasPII).toBe(false);
    },
  );

  it.each([
    'Gasometria: pH 7,31, BE -5,2, HCO3 18',
    'BE +3 e lactato 2,1',
    'BE 10.25',
    'BE −13, SatO2 99%',
    'Tipagem O Rh negativo',
    'Glasgow 15, Apgar 8/9, NIHSS 6',
    'Leucócitos 12.400, Hb 11,2, plaquetas 98.000',
    'Registro de diurese 1500 ml em 24 h',
    'registro 1500 ml de diurese',
    'último registro 15/03/2024 sem alterações',
    'prontuário eletrônico consultado',
    'conforme prontuário de 2019, já operou',
    'atendimento 2023 na mesma unidade',
    'atendimento às 14h30 no pronto-socorro 24 horas',
    'retorno em 7 dias, dipirona 1 g 6/6 h',
  ])('does not mask clinical numbers in %j', (text) => {
    const result = withContext(text);
    expect(result.redacted).toBe(text);
    expect(result.hasPII).toBe(false);
  });
});

// CC-206 — nome depois de tratamento e apelido curto; nunca "dona de casa"
// nem epônimo (CC-202).
describe('maskPII — honorifics and nicknames (CC-206)', () => {
  it.each([
    ['Seu Zé, 70 anos', 'Seu [NOME], 70 anos'],
    ['Dona Cida trouxe os exames', 'Dona [NOME] trouxe os exames'],
    ['Tião, 54 anos, queda de moto', '[NOME], 54 anos, queda de moto'],
    ['Sr. João refere dor', 'Sr. [NOME] refere dor'],
    ['Sra. Maria, 59 anos', 'Sra. [NOME], 59 anos'],
    ['Dra. Ana, 45 anos, médica', 'Dra. [NOME], 45 anos, médica'],
  ])('masks the name in %j (acceptance criterion 1)', (text, expected) => {
    const result = withContext(text);
    expect(result.redacted).toBe(expected);
    expect(result.detections.every(({ type }) => type === 'name')).toBe(true);
  });

  it.each([
    ['Sr. João da Silva, 72 anos', 'Sr. [NOME], 72 anos'],
    ['Sra. Maria das Dores refere', 'Sra. [NOME] refere'],
    ['Avaliado pelo Dr. Paulo Henrique Lima.', 'Avaliado pelo Dr. [NOME].'],
    ['a senhora Raimunda Nonato', 'a senhora [NOME]'],
    ['o doutor Carlos', 'o doutor [NOME]'],
    ['trazida pela dona Antônia', 'trazida pela dona [NOME]'],
    ['Srta Bia', 'Srta [NOME]'],
    ['Seu Toninho Ferreira, 63 anos', 'Seu [NOME], 63 anos'],
    ['e o marido, Chico, ajudou', 'e o marido, [NOME], ajudou'],
    ['a filha do seu Zé', 'a filha do seu [NOME]'],
  ])('masks the whole name in %j', (text, expected) => {
    expect(withContext(text).redacted).toBe(expected);
  });

  it.each([
    'dona de casa, 45 anos',
    'Dona de casa, 45 anos',
    'trazido pelo seu filho',
    'Seu filho trouxe os exames',
    'seu médico pediu USG',
    'Seu ECG mostrou supra de ST',
    'Seu Holter mostrou FA paroxística',
    'Seu Doppler de carótidas veio normal',
    'Zélia, 40 anos',
    'Bianca refere dor',
  ])('leaves %j untouched', (text) => {
    expect(withContext(text).redacted).toBe(text);
  });

  it('keeps a protected clinical term that follows the name (CC-202)', () => {
    expect(withContext('Dona Maria Glasgow 15').redacted).toBe('Dona [NOME] Glasgow 15');
  });

  it('masks an eponym used as surname but keeps the same eponym used clinically', () => {
    expect(withContext('Sr. Francisco das Chagas, portador de doença de Chagas').redacted).toBe(
      'Sr. [NOME], portador de doença de Chagas',
    );
    expect(withContext('Sr. Weber, 58 anos; Weber lateralizado à direita').redacted).toBe(
      'Sr. [NOME], 58 anos; Weber lateralizado à direita',
    );
  });
});

describe('maskPII — DEID_CONTEXT_RULES flag', () => {
  const text = 'Prontuário 4587213. Seu Zé, 70 anos.';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies the context rules by default', () => {
    vi.stubEnv('DEID_CONTEXT_RULES', undefined);
    expect(maskPII(text).redacted).toBe('Prontuário [REDACTED_RECORD]. Seu [NOME], 70 anos.');
  });

  it('falls back to the previous regex when turned off', () => {
    vi.stubEnv('DEID_CONTEXT_RULES', 'off');
    const result = maskPII(text);
    expect(result.redacted).toBe(text);
    expect(result.hasPII).toBe(false);
  });

  it('keeps the rules on with an unrecognized value', () => {
    vi.stubEnv('DEID_CONTEXT_RULES', 'desligado');
    expect(maskPII(text).hasPII).toBe(true);
  });

  it('lets an explicit option override the flag', () => {
    vi.stubEnv('DEID_CONTEXT_RULES', 'off');
    expect(maskPII(text, { contextRules: true }).hasPII).toBe(true);
  });
});

describe('countDetectionsByType', () => {
  it('counts detections per type, without the masked text', () => {
    const { detections } = withContext(
      'Prontuário 4587213, Seu Zé e Dona Cida, CPF 529.982.247-25',
    );
    expect(countDetectionsByType(detections)).toEqual({ record: 1, name: 2, cpf: 1 });
  });
});
