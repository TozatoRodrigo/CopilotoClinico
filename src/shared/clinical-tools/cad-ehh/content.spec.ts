import { describe, expect, it } from 'vitest';
import * as content from './content';
import * as screenText from './screen-text';
import { CAD_EHH_PROVENANCE, stripSourceTags } from './sources';

/** Todas as strings de um valor, em qualquer profundidade. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

const ALL_TEXT = [...strings(content), ...strings(screenText)].filter((text) => text !== '');

/**
 * Regra de linguagem do ADR-017, a mesma das calculadoras: a ferramenta
 * sugere, não manda.
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;
/** Ordens de conduta que o ANY tinha no infinitivo ("Adiar a insulina. Repor…"). */
const INFINITIVE_ORDER =
  /(^|[.:;]\s+)(Adiar a insulina|Repor \d|Adicionar \d|Não repor|Dosar o potássio|Reduzir para)/;

/**
 * "imediatamente" só fica onde descreve que não é preciso esperar (a purga da
 * insulina, [LIT] Thompson 2012), e não onde pede pressa.
 */
const IMMEDIATELY_ALLOWED = [
  'Não é necessário aguardar tempo de repouso. Após a purga, a infusão pode ser iniciada imediatamente. [LIT: Thompson CD et al., Diabetes Technol Ther 2012]',
];

describe('conteúdo do roteiro de CAD e EHH', () => {
  it('sugere em vez de mandar', () => {
    for (const text of ALL_TEXT) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(INFINITIVE_ORDER);
      if (!IMMEDIATELY_ALLOWED.includes(text)) expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('não repete id nas listas de escolha', () => {
    for (const list of [
      content.VOLEMIC_STATES,
      content.POTASSIUM_BANDS,
      content.KCL_PRESENTATIONS,
      content.KCL_ROUTES,
      content.TRANSITION_OVERLAP,
      content.PRECIPITANTS,
      content.LAB_FIELDS,
      content.CONSCIOUSNESS_OPTIONS,
      content.TRACK_OPTIONS,
    ]) {
      const ids = list.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('faixas do painel coerentes', () => {
    for (const field of content.LAB_FIELDS) {
      expect(field.min).toBeLessThan(field.max);
      expect(field.step).toBeGreaterThan(0);
    }
    expect(content.LAB_FIELDS).toHaveLength(7);
    expect(content.LAB_FIELDS.filter(({ required }) => !required).map(({ id }) => id)).toEqual([
      'ureia',
    ]);
  });

  it('planilha com 19 colunas e 12 linhas', () => {
    expect(content.WORKSHEET_COLUMNS).toHaveLength(19);
    expect(content.WORKSHEET_ROWS).toBe(12);
  });

  it('traz procedência com versão e revisão', () => {
    expect(CAD_EHH_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CAD_EHH_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CAD_EHH_PROVENANCE.review.status).toBe('pendente');
  });
});

describe('stripSourceTags', () => {
  it('tira a marca de fonte do fim e do meio do texto', () => {
    expect(stripSourceTags('Texto. [ADA]')).toBe('Texto.');
    expect(stripSourceTags('pH venoso <7,3 e bicarbonato <18 mEq/L [UTD]')).toBe(
      'pH venoso <7,3 e bicarbonato <18 mEq/L',
    );
    expect(stripSourceTags('[ADA] aceita pH <7,30. O KetoPath segue [UTD], conforme.')).toBe(
      'aceita pH <7,30. O KetoPath segue, conforme.',
    );
    expect(stripSourceTags('Purga. [LIT: Goldberg PA et al., 2006]')).toBe('Purga.');
    expect(stripSourceTags('Sem fonte')).toBe('Sem fonte');
  });

  it('nenhum texto fica vazio sem a marca, salvo a nota que é só a fonte', () => {
    const emptied = ALL_TEXT.filter((text) => stripSourceTags(text) === '');
    // As notas "[ADA]" dos precipitantes sem comentário: a tela não mostra linha vazia.
    expect(new Set(emptied)).toEqual(new Set(['[ADA]']));
  });
});
