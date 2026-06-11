import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  type PromptInput,
  type RetrievedContext,
  type EncounterContext,
} from './prompt-builder';

function makeChunks(
  overrides: Partial<RetrievedContext>[] = [{ chunkId: 'default-0', text: 'default evidence' }],
): RetrievedContext[] {
  return overrides.map((o, i) => ({
    chunkId: o.chunkId ?? `chunk-${i}`,
    text: o.text ?? `text-${i}`,
    source: o.source ?? 'protocol-a',
    sourceVersion: o.sourceVersion ?? '1.0',
    score: o.score ?? 0.9,
  }));
}

function makeInput(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    caseText: overrides.caseText ?? 'Paciente com dor torácica aguda.',
    retrievedChunks: overrides.retrievedChunks ?? makeChunks(),
    context: overrides.context ?? {
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
    },
    vertical: overrides.vertical,
  };
}

describe('buildPrompt', () => {
  it('separates system instructions from untrusted input', () => {
    const result = buildPrompt(makeInput());

    expect(result.system).not.toContain('<clinical_case');
    expect(result.system).not.toContain('<guideline_evidence');
    expect(result.user).toContain('<clinical_case');
  });

  it('wraps case text in clinical_case XML tags with UNTRUSTED_INPUT type', () => {
    const result = buildPrompt(makeInput());

    expect(result.user).toContain('<clinical_case type="UNTRUSTED_INPUT">');
    expect(result.user).toContain('Paciente com dor torácica aguda.');
    expect(result.user).toContain('</clinical_case>');
  });

  it('wraps guideline evidence in guideline_evidence XML tags with TRUSTED_CURATED_SOURCE type', () => {
    const result = buildPrompt(
      makeInput({
        retrievedChunks: makeChunks([{ chunkId: 'c1', text: ' guideline text' }]),
      }),
    );

    expect(result.user).toContain('<guideline_evidence type="TRUSTED_CURATED_SOURCE">');
    expect(result.user).toContain(' guideline text');
    expect(result.user).toContain('</guideline_evidence>');
  });

  it('includes citation IDs in evidence blocks', () => {
    const result = buildPrompt(
      makeInput({
        retrievedChunks: makeChunks([{ chunkId: 'abc-123', text: 'some evidence' }]),
      }),
    );

    expect(result.user).toContain('[ID: abc-123]');
    expect(result.user).toContain('some evidence');
  });

  it('includes encounter context when flags are true', () => {
    const result = buildPrompt(
      makeInput({
        context: { hasCT: true, isSus: true, hasLab: true, hasICU: true },
      }),
    );

    expect(result.user).toContain('Tomografia disponível');
    expect(result.user).toContain('Paciente SUS');
    expect(result.user).toContain('Laboratório disponível');
    expect(result.user).toContain('UTI disponível');
    expect(result.user).toContain('Recursos disponíveis:');
  });

  it('omits encounter context block when all flags are false', () => {
    const result = buildPrompt(
      makeInput({
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      }),
    );

    expect(result.user).not.toContain('Recursos disponíveis');
    expect(result.user).not.toContain('Tomografia');
  });

  it('returns empty retrievedChunkIds when no chunks provided', () => {
    const result = buildPrompt(makeInput({ retrievedChunks: [] }));

    expect(result.retrievedChunkIds).toEqual([]);
  });

  it('includes no evidence warning when no chunks', () => {
    const result = buildPrompt(makeInput({ retrievedChunks: [] }));

    expect(result.user).toContain('WARNING: No relevant guideline evidence was found');
    expect(result.user).toContain('uncertainty');
  });

  it('does not include guideline_evidence tags when no chunks', () => {
    const result = buildPrompt(makeInput({ retrievedChunks: [] }));

    expect(result.user).not.toContain('<guideline_evidence');
  });

  it('includes output schema instruction in system prompt', () => {
    const result = buildPrompt(makeInput());

    expect(result.system).toContain('OUTPUT SCHEMA');
    expect(result.system).toContain('"reasoning"');
    expect(result.system).toContain('"recommendations"');
    expect(result.system).toContain('"citationChunkId"');
  });

  it('includes mandatory rules in system prompt', () => {
    const result = buildPrompt(makeInput());

    expect(result.system).toContain('MANDATORY RULES');
    expect(result.system).toContain('NEVER fabricate or hallucinate guideline references');
    expect(result.system).toContain('physician-to-physician only');
  });

  it('extracts chunk IDs correctly', () => {
    const chunks = makeChunks([{ chunkId: 'alpha' }, { chunkId: 'beta' }, { chunkId: 'gamma' }]);
    const result = buildPrompt(makeInput({ retrievedChunks: chunks }));

    expect(result.retrievedChunkIds).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('handles missing optional vertical field gracefully', () => {
    const input: PromptInput = {
      caseText: 'Case text',
      retrievedChunks: makeChunks(),
      context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
    };

    const result = buildPrompt(input);

    expect(result.system).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.retrievedChunkIds.length).toBeGreaterThan(0);
  });

  it('includes source and version in evidence blocks', () => {
    const result = buildPrompt(
      makeInput({
        retrievedChunks: makeChunks([
          { chunkId: 'c1', source: 'protocol-x', sourceVersion: '2.1' },
        ]),
      }),
    );

    expect(result.user).toContain('[Source: protocol-x v2.1]');
  });

  describe('DEC-003: 3-way decision rule', () => {
    it('documents the 3-way decision paths in the system prompt', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('DECISION RULE (3-WAY)');
      expect(result.system).toContain('SUFFICIENT EVIDENCE + SUFFICIENT PATIENT DATA');
      expect(result.system).toContain('SUFFICIENT EVIDENCE BUT A PATIENT DETAIL');
      expect(result.system).toContain('INSUFFICIENT EVIDENCE');
    });

    it('limits clarifyingQuestions to at most 3 per turn, ordered by criticality', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('at most 3');
      expect(result.system).toContain('"blocker" first, then "important", then "optional"');
    });

    it('includes the universal red-flags checklist', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('UNIVERSAL RED FLAGS');
      expect(result.system).toContain('imunossupressão');
      expect(result.system).toContain('gestação/amamentação');
      expect(result.system).toContain('alergias medicamentosas');
      expect(result.system).toContain('tempo de evolução dos sintomas');
      expect(result.system).toContain('uso de anticoagulante');
      expect(result.system).toContain('idade extrema');
      expect(result.system).toContain('sinais vitais instáveis');
    });

    it('includes the anti-interrogation rule requiring guideline-grounded "why"', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('ANTI-INTERROGATION RULE');
      expect(result.system).toContain('"why" MUST reference the specific guideline');
    });

    it('documents preliminary and clarifyingQuestions fields in the output schema', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('"preliminary"');
      expect(result.system).toContain('"clarifyingQuestions"');
      expect(result.system).toContain('"criticality"');
      expect(result.system).toContain('"expectedAnswerType"');
    });

    it('includes a few-shot example for the flu-syndrome >48h case', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('EXAMPLE — DECISION PATH B');
      expect(result.system).toContain('síndrome gripal');
      expect(result.system).toContain('oseltamivir');
      expect(result.system).toContain('"criticality": "blocker"');
    });
  });
});
