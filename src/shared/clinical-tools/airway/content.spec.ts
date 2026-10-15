import { describe, expect, it } from 'vitest';
import {
  AIRWAY_PROVENANCE,
  AIRWAY_STEPS,
  ALL_CHECK_IDS,
  CHECKLISTS,
  COMMON_ERRORS,
  CRASH_ITEMS,
  FLUSH_RATE,
  INDICATIONS,
  LARYNGOSCOPY_TECHNIQUES,
  LEMON_ITEMS,
  MEMBRANE_TECHNIQUES,
  NOTICES,
  RESCUE_PLANS,
  ROMAN_ITEMS,
} from './content';
import { AIRWAY_DRUGS } from './drugs';

/** Mesma regra de linguagem das calculadoras (registry.spec.ts, ADR-017). */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

function allTexts(): string[] {
  return [
    ...INDICATIONS.flatMap(({ title, detail }) => [title, detail]),
    ...CRASH_ITEMS.flatMap(({ title, detail, suggestions }) => [
      title,
      detail ?? '',
      ...suggestions,
    ]),
    ...[...LEMON_ITEMS, ...ROMAN_ITEMS].flatMap(({ title, detail }) => [title, detail]),
    ...Object.values(CHECKLISTS).flatMap(({ title, items }) => [
      title,
      ...items.flatMap((item) => [item.title, 'detail' in item ? item.detail : '']),
    ]),
    ...Object.values(NOTICES).flatMap(({ title, lines }) => [title, ...lines]),
    ...Object.values(MEMBRANE_TECHNIQUES).flatMap(({ title, lines }) => [title, ...lines]),
    ...FLUSH_RATE.lines,
    ...LARYNGOSCOPY_TECHNIQUES.flatMap(({ label, steps }) => [label, ...steps]),
    ...COMMON_ERRORS.flatMap(({ title, detail }) => [title, detail]),
    RESCUE_PLANS.planoB.title,
    ...RESCUE_PLANS.planoB.lines,
    RESCUE_PLANS.planoC.title,
    ...RESCUE_PLANS.planoC.lines,
    ...AIRWAY_DRUGS.flatMap(({ presentation, alert }) => [presentation, alert ?? '']),
  ].filter((text) => text !== '');
}

describe('conteúdo do roteiro de via aérea', () => {
  it('tem os 11 passos em ordem', () => {
    expect(AIRWAY_STEPS.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('não repete id de item de checklist', () => {
    expect(new Set(ALL_CHECK_IDS).size).toBe(ALL_CHECK_IDS.length);
  });

  it('traz procedência com versão e revisão', () => {
    expect(AIRWAY_PROVENANCE.source).toContain('AirwayGuide');
    expect(AIRWAY_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(AIRWAY_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(AIRWAY_PROVENANCE.review.status).toBe('pendente');
  });

  it('sugere em vez de mandar', () => {
    for (const text of allTexts()) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('recomendações do CRASH e avisos falam em "considere" ou descrevem, sem ordem', () => {
    const orders =
      /^(Otimizar|Evitar|Corrigir|Minimizar|Manter|Reduzir|Limite|Confirme|Mantenha)\b/;
    const texts = [
      ...CRASH_ITEMS.flatMap(({ suggestions }) => suggestions),
      ...Object.values(NOTICES).flatMap(({ lines }) => lines),
    ];
    for (const text of texts) expect(text, text).not.toMatch(orders);
  });
});
