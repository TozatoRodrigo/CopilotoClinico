import { describe, expect, it } from 'vitest';
import { deriveDengue } from '../../src/shared/clinical-tools/dengue/derive';
import {
  ALARM_SIGN_IDS,
  DENGUE_SCREENS,
  GRAVITY_SIGN_IDS,
  RISK_CONDITION_IDS,
} from '../../src/shared/clinical-tools/dengue/content';
import {
  buildPatientMessage,
  whatsappShareUrl,
  type PatientMessageInput,
} from '../../src/shared/clinical-tools/dengue/patient-message';
import {
  dengueReducer,
  INITIAL_DENGUE_STATE,
  type DengueState,
} from '../../src/shared/clinical-tools/dengue/state';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-325 — a mensagem de alta vai do celular do médico para o do paciente
 * pelo WhatsApp, então não pode levar dado identificável (LGPD). O que este
 * arquivo garante:
 *
 * 1. a entrada do gerador só aceita a hora de emissão (checado pelo
 *    `pnpm typecheck`: as linhas com `@ts-expect-error` falham se o tipo
 *    passar a aceitar nome, idade ou endereço);
 * 2. em 1.000 estados aleatórios do roteiro (sinais, grupos, Ht, peso), a
 *    mensagem só muda na linha "Emitido em": nada do caso entra nela;
 * 3. o texto não tem padrão de dado pessoal (CPF, telefone, e-mail, idade,
 *    peso, endereço, nome).
 */

const ISSUED_AT = new Date(2026, 9, 15, 14, 5);

/** Linha de emissão: a única parte variável da mensagem. */
const ISSUED_LINE = /^_Emitido em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}_$/;

describe('mensagem de alta — entrada', () => {
  it('aceita só a hora de emissão', () => {
    const input: PatientMessageInput = { issuedAt: ISSUED_AT };
    expect(Object.keys(input)).toEqual(['issuedAt']);

    // @ts-expect-error — nome do paciente não é entrada da mensagem.
    buildPatientMessage({ issuedAt: ISSUED_AT, name: 'Maria' });
    // @ts-expect-error — idade não é entrada da mensagem.
    buildPatientMessage({ issuedAt: ISSUED_AT, age: 34 });
    // @ts-expect-error — endereço não é entrada da mensagem.
    buildPatientMessage({ issuedAt: ISSUED_AT, address: 'Rua A, 10' });
    // @ts-expect-error — peso não é entrada da mensagem.
    buildPatientMessage({ issuedAt: ISSUED_AT, weightKg: 70 });
  });
});

function randomState(random: ReturnType<typeof seededRandom>, at: number): DengueState {
  let state: DengueState = { ...INITIAL_DENGUE_STATE, screen: random.pick(DENGUE_SCREENS) };
  for (const id of ALARM_SIGN_IDS) {
    if (random.next() < 0.3) state = dengueReducer(state, { type: 'toggle-alarm', id });
  }
  for (const id of GRAVITY_SIGN_IDS) {
    if (random.next() < 0.2) state = dengueReducer(state, { type: 'toggle-gravity', id });
  }
  for (const id of RISK_CONDITION_IDS) {
    if (random.next() < 0.3) state = dengueReducer(state, { type: 'toggle-risk', id });
  }
  state = dengueReducer(state, { type: 'set-ht-baseline', raw: String(random.integer(30, 55)) });
  state = dengueReducer(state, { type: 'set-ht-current', raw: String(random.integer(30, 60)) });
  state = dengueReducer({ ...state, screen: 'trilha-3' }, { type: 'open-trail-group', at });
  return dengueReducer(state, { type: 'generate-patient-message', at });
}

describe('mensagem de alta — conteúdo', () => {
  it('não muda com nada do caso, só com a hora de emissão', () => {
    const random = seededRandom(20261015);
    const reference = buildPatientMessage({ issuedAt: ISSUED_AT })
      .split('\n')
      .filter((line) => !ISSUED_LINE.test(line))
      .join('\n');
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const at = ISSUED_AT.getTime() + random.integer(0, 30 * 24 * 60) * 60_000;
      const weight = (random.integer(400, 2000) / 10).toFixed(1).replace('.', ',');
      const view = deriveDengue(randomState(random, at), weight);
      const lines = (view.patientMessage ?? '').split('\n');
      expect(lines.filter((line) => ISSUED_LINE.test(line))).toHaveLength(1);
      expect(lines.filter((line) => !ISSUED_LINE.test(line)).join('\n')).toBe(reference);
      // O peso digitado não aparece em lugar nenhum.
      expect(view.patientMessage).not.toContain(weight);
    }
  });

  it('não tem padrão de dado pessoal', () => {
    const message = buildPatientMessage({ issuedAt: ISSUED_AT });
    const withoutIssued = message
      .split('\n')
      .filter((line) => !ISSUED_LINE.test(line))
      .join('\n');
    expect(withoutIssued).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/); // CPF
    expect(withoutIssued).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/); // telefone
    expect(withoutIssued).not.toMatch(/@/); // e-mail
    expect(withoutIssued).not.toMatch(/\b\d+\s*(anos|kg|%)/i); // idade, peso, Ht
    expect(withoutIssued).not.toMatch(/\b(nome|paciente:|rua|avenida|av\.|cep|bairro)\b/i);
    expect(withoutIssued).not.toMatch(/Grupo [ABCD]/); // o grupo não identifica, mas não é texto do paciente
    // Os únicos números são os da orientação geral (2 a 3 litros).
    expect(withoutIssued.match(/\d+/g)).toEqual(['2', '3']);
  });

  it('gera o link do WhatsApp sem destinatário', () => {
    const url = whatsappShareUrl('Beber água & descansar');
    expect(url).toBe('https://wa.me/?text=Beber%20%C3%A1gua%20%26%20descansar');
  });
});
