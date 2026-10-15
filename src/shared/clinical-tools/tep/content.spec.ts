import { describe, expect, it } from 'vitest';
import { allBands, isRuleInterpretation, type CalculatorDefinition } from '../calculator';
import { PERC_RULE } from '../calculators/perc-rule';
import { CALCULATORS, getCalculator } from '../registry';
import { RESULT_TONES } from '../tone';
import { TEP_CALCULATORS, TEP_PATHWAY_CALCULATORS } from './calculators';
import { RED_FLAGS, SUBSEGMENTAL_ALERT, TEP_CATEGORIES, TEP_CATEGORY_IDS } from './categories';
import { CLASSIFICATION, DIAGNOSIS, MANAGEMENT, STABILITY, UNSTABLE } from './content';
import { infusionDrugHref, linkedToolHref, TEP_REFERENCE_SECTIONS, type TepLink } from './links';
import { TEP_ANSWERS, TEP_QUESTIONS } from './pathway';
import { TEP_REFERENCE } from './reference';

/**
 * Regra de linguagem do ADR-017, a mesma das calculadoras (registry.spec.ts):
 * a ferramenta sugere, não manda.
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Solicite|Utilize|Documente|Prossiga)\b/;

/** Todas as strings de um valor (objeto, lista ou texto). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function links(value: unknown): TepLink[] {
  if (Array.isArray(value)) return value.flatMap(links);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const own =
      record.kind === 'infusao' || record.kind === 'ferramenta' || record.kind === 'referencia'
        ? [record as unknown as TepLink]
        : [];
    return [...own, ...Object.values(record).flatMap(links)];
  }
  return [];
}

const ALL_CONTENT = [
  STABILITY,
  UNSTABLE,
  DIAGNOSIS,
  CLASSIFICATION,
  MANAGEMENT,
  TEP_REFERENCE,
  TEP_CATEGORIES,
  SUBSEGMENTAL_ALERT,
  RED_FLAGS,
];

describe.each(
  Object.values(TEP_PATHWAY_CALCULATORS).map((calculator) => [calculator.id, calculator] as const),
)('calculadora %s', (_id, calculator: CalculatorDefinition) => {
  it('tem faixas com tom válido, rótulo e ação, sem id repetido', () => {
    const { interpretation } = calculator;
    if (!isRuleInterpretation(interpretation)) {
      const values = interpretation.bands.map(({ upTo }) => upTo.value);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    }
    const bands = allBands(interpretation);
    for (const band of bands) {
      expect(RESULT_TONES).toContain(band.tone);
      expect(band.label.trim()).not.toBe('');
      expect(band.action.trim()).not.toBe('');
    }
    expect(new Set(bands.map(({ id }) => id)).size).toBe(bands.length);
  });

  it('traz procedência, referência e itens sem id repetido', () => {
    expect(calculator.provenance.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(calculator.provenance.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calculator.reference.citation).not.toBe('');
    expect(calculator.reference.pearlsPitfalls.length).toBeGreaterThan(0);
    const items = calculator.items ?? [];
    expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
    if (calculator.kind === 'formula') {
      for (const input of calculator.inputs) expect(input.min).toBeLessThan(input.max);
    }
  });

  it('sugere em vez de mandar', () => {
    for (const text of [...allBands(calculator.interpretation).map(({ action }) => action)]) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });
});

describe('registro das calculadoras do TEP', () => {
  it('são as nove da aba Calculadoras do ANY, na ordem de lá', () => {
    expect(TEP_CALCULATORS.map(({ id }) => id)).toEqual([
      'perc-rule',
      'wells-tep',
      'd-dimero-idade',
      'years',
      'years-gestacao',
      'spesi',
      'pesi',
      'bova',
      'hestia',
    ]);
  });

  it('reaproveitam o PERC do catálogo e não colidem com as outras 75', () => {
    expect(TEP_CALCULATORS[0]).toBe(PERC_RULE);
    expect(getCalculator('perc-rule')).toBe(PERC_RULE);
    const catalogIds = new Set(CALCULATORS.map(({ id }) => id));
    const own = Object.values(TEP_PATHWAY_CALCULATORS).filter(
      (calculator) => calculator !== PERC_RULE,
    );
    for (const calculator of own) expect(catalogIds.has(calculator.id), calculator.id).toBe(false);
  });
});

describe('conteúdo do roteiro', () => {
  it('sugere em vez de mandar em todo texto', () => {
    for (const text of strings(ALL_CONTENT)) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('cada pergunta oferece exatamente as respostas que o reducer aceita', () => {
    expect(Object.keys(CLASSIFICATION.questions).sort()).toEqual([...TEP_QUESTIONS].sort());
    for (const question of TEP_QUESTIONS) {
      expect(CLASSIFICATION.questions[question].options.map(({ value }) => value)).toEqual(
        TEP_ANSWERS[question],
      );
    }
  });

  it('tem as 12 categorias, com conduta completa', () => {
    expect(Object.keys(TEP_CATEGORIES).sort()).toEqual([...TEP_CATEGORY_IDS].sort());
    for (const category of Object.values(TEP_CATEGORIES)) {
      expect(category.actions.length, category.id).toBeGreaterThan(0);
      for (const text of [
        category.description,
        category.destination,
        category.anticoagulation,
        category.monitoring,
        category.advancedTherapy,
      ]) {
        expect(text.trim(), category.id).not.toBe('');
      }
      // Seguimento só nas que saem do DE (A e B), como no ANY.
      expect(Boolean(category.followUp), category.id).toBe(/^[AB]/.test(category.id));
    }
  });

  it('liga a heparina quando a anticoagulação inclui HNF', () => {
    for (const category of Object.values(TEP_CATEGORIES)) {
      expect(category.heparin, category.id).toBe(/HNF/.test(category.anticoagulation));
    }
  });

  it('todo link aponta para uma seção, droga ou ferramenta conhecida', () => {
    const all = links(ALL_CONTENT);
    expect(all.length).toBeGreaterThan(5);
    for (const link of all) {
      if (link.kind === 'referencia') expect(TEP_REFERENCE_SECTIONS).toContain(link.section);
      if (link.kind === 'infusao') {
        expect(infusionDrugHref(link.drug)).toMatch(
          /^\/ferramentas\/infusoes\?droga=[a-z]+(&indicacao=tep)?&de=tep$/,
        );
      }
      if (link.kind === 'ferramenta')
        expect(linkedToolHref(link.toolId)).toMatch(/^\/ferramentas\//);
    }
  });

  it('a heparina abre em Infusões pelo endereço que a tela de Infusões lê', () => {
    expect(infusionDrugHref('heparina')).toBe(
      '/ferramentas/infusoes?droga=heparina&indicacao=tep&de=tep',
    );
    expect(MANAGEMENT.heparin).toMatchObject({ kind: 'infusao', drug: 'heparina' });
    expect(UNSTABLE.anticoagulation.heparin.link).toMatchObject({
      kind: 'infusao',
      drug: 'heparina',
    });
  });

  it('a referência rápida tem as sete seções, uma vez cada', () => {
    expect(TEP_REFERENCE.map(({ id }) => id)).toEqual([...TEP_REFERENCE_SECTIONS]);
  });
});
