import { describe, expect, it } from 'vitest';
import type { CopilotOutput } from '../../src/modules/copilot/guardrails/output-validator';
import type { ClinicalCase } from './case.schema';
import { BLIND_CASES_DIR, loadCaseSet } from './cases';
import { findForbiddenDefinitiveActions } from './graders/deterministic';

/**
 * Gabarito v1 — cada caso traz frases que a checagem automática de conduta
 * proibida DEVE e NÃO PODE acusar. A frase entra como recomendação
 * terapêutica definitiva, o pior caso para o médico.
 */

// O conjunto principal e a prova cega: a mesma checagem lê os dois.
const cases = [...loadCaseSet().cases, ...loadCaseSet(BLIND_CASES_DIR).cases];

function definitiveRecommendation(action: string): CopilotOutput {
  return {
    reasoning: 'Raciocínio clínico.',
    redFlags: [],
    recommendations: [
      {
        action,
        rationale: '',
        citationChunkId: 'chunk-1',
        confidence: 0.8,
        preliminary: false,
        category: 'therapeutic',
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
  };
}

function flaggedIds(clinicalCase: ClinicalCase, sentence: string): string[] {
  return findForbiddenDefinitiveActions(
    definitiveRecommendation(sentence),
    clinicalCase.expected.forbiddenDefinitiveActions,
  ).map((match) => match.forbiddenId);
}

function hasRegexCheck(clinicalCase: ClinicalCase): boolean {
  return clinicalCase.expected.forbiddenDefinitiveActions.some(
    (action) => action.patterns.length > 0,
  );
}

describe('sondas da checagem de conduta proibida', () => {
  it('existem em todo caso com conduta proibida checada por regex', () => {
    const withoutProbes = cases
      .filter((clinicalCase) => hasRegexCheck(clinicalCase) && !clinicalCase.probes)
      .map((clinicalCase) => clinicalCase.id);
    expect(withoutProbes).toEqual([]);
  });

  it('só aparecem em caso com conduta proibida checada por regex', () => {
    const orphanProbes = cases
      .filter((clinicalCase) => clinicalCase.probes && !hasRegexCheck(clinicalCase))
      .map((clinicalCase) => clinicalCase.id);
    expect(orphanProbes).toEqual([]);
  });

  describe.each(cases.filter((clinicalCase) => clinicalCase.probes))('$id', (clinicalCase) => {
    const probes = clinicalCase.probes ?? { mustFlag: [], mustNotFlag: [] };

    it.each(probes.mustFlag)('acusa "%s"', (sentence) => {
      expect(flaggedIds(clinicalCase, sentence)).not.toEqual([]);
    });

    it.each(probes.mustNotFlag)('não acusa "%s"', (sentence) => {
      expect(flaggedIds(clinicalCase, sentence)).toEqual([]);
    });
  });
});
