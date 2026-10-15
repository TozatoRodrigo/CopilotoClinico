import { describe, expect, it } from 'vitest';
import { RESULT_TONES } from '../tone';
import * as content from './content';
import {
  DENGUE_GROUPS,
  DENGUE_PROVENANCE,
  DENGUE_REFERENCES,
  DENGUE_SCREENS,
  GROUP_PAGES,
  HYDRATION_KEYS,
} from './content';

/** Todas as strings de um valor, com o caminho, para varrer o conteúdo inteiro. */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value))
    return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

const ALL = strings(content);

/** Mesma regra do registro de calculadoras (ADR-017): a ferramenta sugere, não manda. */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

/**
 * "Imediatamente" só no que o médico passa ao paciente (retorno ao serviço):
 * ali a urgência é para o paciente, não uma ordem de conduta.
 */
const PATIENT_GUIDANCE = new Set([
  'Orientar o paciente a retornar **imediatamente** se apresentar qualquer um dos seguintes:',
  'Retornar **imediatamente** se sinais de alarme',
]);

describe('conteúdo da dengue', () => {
  it('sugere em vez de mandar', () => {
    for (const { path, text } of ALL) {
      expect(text, path).not.toMatch(IMPERATIVE_START);
      if (!PATIENT_GUIDANCE.has(text)) expect(text, path).not.toMatch(/imediatamente/i);
    }
  });

  it('só usa marcadores de volume que existem', () => {
    const keys = new Set<string>(HYDRATION_KEYS);
    for (const { path, text } of ALL) {
      for (const [, key] of text.matchAll(/\{(\w+)(?:\/\d+)?\}/g)) {
        expect(keys.has(key ?? ''), `${path}: {${key}}`).toBe(true);
      }
    }
  });

  it('usa só tons do motor e telas que existem', () => {
    const tones: unknown[] = [];
    const screens: unknown[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        if ('tone' in record) tones.push(record.tone);
        if (record.kind === 'link') screens.push(record.to);
        Object.values(record).forEach(walk);
      }
    };
    walk(content);
    expect(tones.length).toBeGreaterThan(0);
    for (const tone of tones) expect(RESULT_TONES).toContain(tone);
    for (const screen of screens) expect(DENGUE_SCREENS).toContain(screen);
  });

  it('tem manejo para os quatro grupos', () => {
    expect(Object.keys(GROUP_PAGES).sort()).toEqual([...DENGUE_GROUPS]);
  });

  it('traz procedência e as referências do ANY (MS 6ª ed. 2024, ABRAMEDE, OMS)', () => {
    expect(DENGUE_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DENGUE_PROVENANCE.review.status).toBe('pendente');
    expect(DENGUE_REFERENCES.join(' ')).toMatch(/Ministério da Saúde.*6ª edição.*2024/);
    expect(DENGUE_REFERENCES.join(' ')).toContain('ABRAMEDE');
    expect(DENGUE_REFERENCES.join(' ')).toContain('World Health Organization');
  });

  it('conta os sinais de alarme no singular e no plural', () => {
    expect(content.alarmCountLabel(1)).toBe('1 sinal de alarme');
    expect(content.alarmCountLabel(3)).toBe('3 sinais de alarme');
  });
});
