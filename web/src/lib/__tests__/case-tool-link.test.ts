import { describe, expect, it } from 'vitest';
import {
  MAX_CASE_ATTACHMENTS,
  TOOL_RESULT_QUESTION_ID,
  attachToCase,
  attachmentAnswer,
  clearPendingCaseLink,
  isAttachedToCase,
  newCaseToken,
  openToolFromCase,
  parseCaseToolLink,
  prefilledFieldCount,
  readCaseAttachments,
  readCaseLink,
  readPendingCaseLink,
  removeCaseAttachments,
} from '../case-tool-link';
import {
  ADULT_WEIGHT_KEY,
  CASE_PENDING_TTL_MS,
  TOOL_SESSION_TTL_MS,
  readToolSession,
  writeToolSession,
} from '../tool-session';
import type { CaseToolFacts, CaseToolSuggestion } from '../types';

const ENCOUNTER = 'enc-332';
const NOW = Date.UTC(2026, 9, 15, 10, 0);

const FACTS: CaseToolFacts = {
  ageYears: 67,
  sex: 'F',
  weightKg: 73,
  systolicBp: 82,
  diastolicBp: 47,
  heartRate: 131,
  respiratoryRate: 33,
  spo2: 89,
  temperature: 38.9,
  glucose: 212,
};

const PERC: CaseToolSuggestion = {
  ruleId: 'teste-perc',
  target: { kind: 'calculator', calculatorId: 'perc-rule' },
  name: 'PERC Rule',
  reason: 'Suspeita de TEP',
};

const SHOCK: CaseToolSuggestion = {
  ruleId: 'sepse-hipotensao-choque-septico',
  target: { kind: 'tool', toolId: 'choque-septico' },
  name: 'Choque séptico',
  reason: 'Sepse com hipotensão',
};

const open = (suggestion: CaseToolSuggestion, facts: CaseToolFacts = FACTS, now = NOW) =>
  openToolFromCase(
    { encounterId: ENCOUNTER, interactionId: 'interaction-1', suggestion, facts },
    now,
  );

const tokenOf = (href: string) => new URL(href, 'http://copiloto.local').searchParams.get('caso')!;

const anyValue = (value: unknown) => value;
const readAnswers = (id: string) => readToolSession(`calculadora:${id}`, anyValue, NOW);

describe('ida do plano para a ferramenta (CC-332)', () => {
  it('o token é opaco: 16 letras, sem dígito', () => {
    for (let i = 0; i < 20; i++) expect(newCaseToken()).toMatch(/^[a-z]{16}$/);
  });

  it('nenhum dado clínico vai no endereço: só a ferramenta e o token', () => {
    for (const suggestion of [PERC, SHOCK]) {
      const href = open(suggestion);
      const url = new URL(href, 'http://copiloto.local');
      expect([...url.searchParams.keys()]).toEqual(['caso']);
      expect(url.searchParams.get('caso')).toMatch(/^[a-z]{16}$/);
      for (const value of Object.values(FACTS)) {
        if (value === null) continue;
        expect(href, `${href} contém ${value}`).not.toContain(String(value));
        expect(href).not.toContain(String(value).replace('.', ','));
      }
    }
    expect(open(PERC)).toMatch(/^\/ferramentas\/calculadoras\/perc-rule\?caso=[a-z]{16}$/);
    expect(open(SHOCK)).toMatch(/^\/ferramentas\/choque-septico\?caso=[a-z]{16}$/);
  });

  it('o dado do caso vai pela sessão da aba, atrás do token', () => {
    const token = tokenOf(open(PERC));

    expect(readCaseLink(token, NOW)).toEqual({
      token,
      encounterId: ENCOUNTER,
      interactionId: 'interaction-1',
      target: PERC.target,
      name: 'PERC Rule',
      facts: FACTS,
    });
    expect(readPendingCaseLink(NOW)?.token).toBe(token);
  });

  it('o aviso de "acabei de abrir" vive 2 minutos; o elo, 30', () => {
    const token = tokenOf(open(PERC));

    expect(readPendingCaseLink(NOW + CASE_PENDING_TTL_MS + 1)).toBeNull();
    expect(readCaseLink(token, NOW + TOOL_SESSION_TTL_MS - 1)).not.toBeNull();
    expect(readCaseLink(token, NOW + TOOL_SESSION_TTL_MS + 1)).toBeNull();
    clearPendingCaseLink();
    expect(readPendingCaseLink(NOW)).toBeNull();
  });

  it('a calculadora sugerida recomeça com o que o caso responde', () => {
    writeToolSession('calculadora:perc-rule', { items: { hemoptysis: 'sim' }, inputs: {} }, NOW);

    open(PERC);

    expect(readAnswers('perc-rule')).toEqual({
      items: { age: 'sim', hr: 'sim', spo2: 'sim' },
      inputs: {},
    });
  });

  it('o peso adulto passa a ser o do caso; sem peso no caso, o anterior sai', () => {
    writeToolSession(ADULT_WEIGHT_KEY, '90', NOW);
    open(SHOCK);
    expect(readToolSession(ADULT_WEIGHT_KEY, anyValue, NOW)).toBe('73');

    open(SHOCK, { ...FACTS, weightKg: null });
    expect(readToolSession(ADULT_WEIGHT_KEY, anyValue, NOW)).toBeNull();
  });

  it('criança não mexe no peso adulto', () => {
    writeToolSession(ADULT_WEIGHT_KEY, '90', NOW);
    open(
      { ...SHOCK, target: { kind: 'tool', toolId: 'pediatria' }, name: 'Emergência pediátrica' },
      { ...FACTS, ageYears: 4, weightKg: 16 },
    );
    expect(readToolSession(ADULT_WEIGHT_KEY, anyValue, NOW)).toBe('90');
  });

  it('diz quantos campos a ferramenta abre preenchidos', () => {
    expect(prefilledFieldCount(PERC.target, FACTS)).toBe(3);
    expect(prefilledFieldCount(SHOCK.target, FACTS)).toBe(1);
    expect(prefilledFieldCount(SHOCK.target, { ...FACTS, weightKg: null })).toBe(0);
    expect(
      prefilledFieldCount(
        { kind: 'tool', toolId: 'pediatria' },
        { ...FACTS, ageYears: 4, weightKg: 16 },
      ),
    ).toBe(2);
  });

  it('elo editado à mão vira nulo', () => {
    const token = tokenOf(open(PERC));
    const link = readCaseLink(token, NOW);
    expect(parseCaseToolLink({ ...link, token: '123' })).toBeNull();
    expect(parseCaseToolLink({ ...link, facts: { ...FACTS, heartRate: '131' } })).toBeNull();
    expect(parseCaseToolLink({ ...link, target: { kind: 'tool', toolId: '../x' } })).toBeNull();
    expect(readCaseLink('nao-e-token')).toBeNull();
  });
});

describe('resultado anexado ao caso', () => {
  it('guarda por caso, sem repetir o mesmo texto', () => {
    attachToCase(ENCOUNTER, { toolName: 'NIHSS', text: 'NIHSS: 9 — AVC moderado.' }, NOW);
    attachToCase(ENCOUNTER, { toolName: 'NIHSS', text: 'NIHSS: 9 — AVC moderado.' }, NOW);
    attachToCase('outro-caso', { toolName: 'HEART', text: 'HEART: 3' }, NOW);

    expect(readCaseAttachments(ENCOUNTER, NOW).map(({ text }) => text)).toEqual([
      'NIHSS: 9 — AVC moderado.',
    ]);
    expect(isAttachedToCase(ENCOUNTER, 'NIHSS: 9 — AVC moderado.', NOW)).toBe(true);
    expect(isAttachedToCase(ENCOUNTER, 'HEART: 3', NOW)).toBe(false);
  });

  it(`guarda no máximo ${MAX_CASE_ATTACHMENTS}; sai o mais antigo`, () => {
    for (let i = 1; i <= MAX_CASE_ATTACHMENTS + 1; i++) {
      attachToCase(ENCOUNTER, { toolName: 'Escore', text: `Escore: ${i}` }, NOW);
    }
    const texts = readCaseAttachments(ENCOUNTER, NOW).map(({ text }) => text);
    expect(texts).toHaveLength(MAX_CASE_ATTACHMENTS);
    expect(texts[0]).toBe('Escore: 2');
  });

  it('sai do caso pelo id', () => {
    const [first] = attachToCase(ENCOUNTER, { toolName: 'NIHSS', text: 'NIHSS: 9' }, NOW);
    attachToCase(ENCOUNTER, { toolName: 'HEART', text: 'HEART: 3' }, NOW);

    expect(removeCaseAttachments(ENCOUNTER, [first!.id], NOW).map(({ text }) => text)).toEqual([
      'HEART: 3',
    ]);
  });

  it('entra na reanálise como resposta reservada, com o nome da ferramenta', () => {
    const [nihss] = attachToCase(ENCOUNTER, { toolName: 'NIHSS', text: 'NIHSS: 9' }, NOW);
    expect(attachmentAnswer(nihss!)).toEqual({
      questionId: TOOL_RESULT_QUESTION_ID,
      answer: 'NIHSS: 9',
    });

    const [, shock] = attachToCase(
      ENCOUNTER,
      { toolName: 'Choque séptico', text: 'Perfil: TEC alterado.' },
      NOW,
    );
    expect(attachmentAnswer(shock!).answer).toBe('Choque séptico\nPerfil: TEC alterado.');
  });
});
