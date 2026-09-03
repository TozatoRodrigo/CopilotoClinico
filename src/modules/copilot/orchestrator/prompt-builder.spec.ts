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
    redFlags: overrides.redFlags,
    coverage: overrides.coverage,
    physicianAttachments: overrides.physicianAttachments,
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

  // CC-03 — Antes desta correção, este exato caminho (zero chunks
  // recuperados) instruía "Set uncertainty to true. Analyze this case and
  // declare evidence insufficiency." e nada mais — é literalmente a causa
  // raiz da parede reproduzida na apresentação para os médicos com o caso de
  // cefaleia. Estes testes travam que o caminho D (perguntar) seja sempre
  // instruído aqui, não apenas documentado em abstrato no system prompt.
  describe('CC-03: the zero-evidence path asks instead of stopping (the wall reproduced)', () => {
    it('never instructs the model to simply stop — always points to DECISION MATRIX path D', () => {
      const result = buildPrompt(makeInput({ retrievedChunks: [] }));

      expect(result.user).not.toContain('declare evidence insufficiency');
      expect(result.user).toContain('Do NOT simply declare insufficiency and stop');
      expect(result.user).toContain('DECISION MATRIX path D');
    });

    it('instructs universal-triage clarifying questions with a concrete priority order', () => {
      const result = buildPrompt(makeInput({ retrievedChunks: [] }));

      expect(result.user).toContain('UNIVERSAL-TRIAGE-ANCHORED clarifyingQuestions');
      expect(result.user).toContain('time course (sudden vs progressive)');
      expect(result.user).toContain('hemodynamic stability / vital signs');
      expect(result.user).toContain('most discriminating red flag');
    });

    it('explicitly permits empty recommendations only because questions are being asked', () => {
      const result = buildPrompt(makeInput({ retrievedChunks: [] }));

      expect(result.user).toContain(
        '"recommendations" may be empty here ONLY because you are asking',
      );
      expect(result.user).toContain('never leave both recommendations and clarifyingQuestions empty');
    });

    it('never blames the physician for a vague description — frames the gap as guideline coverage', () => {
      const result = buildPrompt(makeInput({ retrievedChunks: [] }));

      expect(result.user).toContain('never blame the physician\'s description');
    });
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

  // CC-03 — Este describe block ANTES testava "DECISION RULE (3-WAY)", os
  // três caminhos mutuamente exclusivos (A/B/C) que produziram a parede da
  // apresentação: sem cobertura de diretriz E sem dado do paciente, o modelo
  // caía no caminho C e parava, sem perguntar nada. Renomeado e reescrito
  // para documentar a reversão deliberada — a matriz de 2 eixos abre um
  // quarto caminho (D) exatamente para esse quadrante.
  describe('DEC-003 / CC-03: 2-axis decision matrix', () => {
    it('documents the 2-axis decision matrix with all 4 quadrants in the system prompt', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('DECISION MATRIX (2-AXIS)');
      expect(result.system).toContain('Axis 1 — EVIDENCE');
      expect(result.system).toContain('Axis 2 — PATIENT DATA');
      expect(result.system).toContain('A. EVIDENCE OK + PATIENT DATA OK');
      expect(result.system).toContain('B. EVIDENCE OK + PATIENT DATA MISSING');
      expect(result.system).toContain('C. EVIDENCE INSUFFICIENT + PATIENT DATA OK');
      expect(result.system).toContain('D. EVIDENCE INSUFFICIENT + PATIENT DATA MISSING');
    });

    it('CC-03: quadrant D never leaves the physician without a next step', () => {
      const result = buildPrompt(makeInput());

      // O quadrante que faltava na arquitetura antiga: sem diretriz E sem
      // dado do paciente — exatamente o caso da apresentação. A regra
      // precisa instruir pergunta, nunca silêncio.
      expect(result.system).toContain(
        'UNIVERSAL-TRIAGE-ANCHORED "clarifyingQuestions"',
      );
      expect(result.system).toContain('never leave both empty');
    });

    it('CC-02/CC-03: states the absolute rule that recommendations and clarifyingQuestions cannot both be empty', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain(
        'NEVER return an output with zero "recommendations" AND zero "clarifyingQuestions"',
      );
      expect(result.system).toContain('silence is not an acceptable answer');
      // A distinção central que destrava a correção inteira.
      expect(result.system).toContain('Asking a question never requires a citation');
    });

    it('CC-03: uncertainty is documented as describing evidence coverage, never terminal by itself', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain(
        '"uncertainty" always describes evidence coverage, never patient-data completeness',
      );
      expect(result.system).toContain('it is never terminal by itself');
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

    // CC-04 — a trava mais sutil das quatro identificadas na investigação:
    // antes, TODA pergunta exigia citação de diretriz. Sem diretriz
    // recuperada, nenhuma pergunta era sequer emitível — mesmo com a
    // DECISION MATRIX já corrigida (CC-03), o modelo continuaria mudo.
    describe('CC-04: universal-triage anchoring (second mode)', () => {
      it('documents both anchoring modes as the only two ways to ask a question', () => {
        const result = buildPrompt(makeInput());

        expect(result.system).toContain('GUIDELINE-ANCHORED');
        expect(result.system).toContain('UNIVERSAL-TRIAGE-ANCHORED');
        expect(result.system).toContain(
          'use ONLY when no retrieved chunk covers the point',
        );
      });

      it('restricts universal-triage questions to a closed, named set of categories', () => {
        const result = buildPrompt(makeInput());

        expect(result.system).toContain('Hemodynamic stability / ABCDE');
        expect(result.system).toContain('Time course: sudden vs progressive onset');
        expect(result.system).toContain('single most discriminating finding');
        expect(result.system).toContain('Associated trauma or mechanism of injury');
        expect(result.system).toContain('do not invent a category outside it');
      });

      it('forbids re-asking about anything already confirmed via physician_confirmed_red_flags', () => {
        const result = buildPrompt(makeInput());

        expect(result.system).toContain(
          'Never ask about anything already confirmed in physician_confirmed_red_flags',
        );
      });
    });

    // UX-01 — "dados necessários para uma análise segura" agrupados por
    // finalidade clínica, não uma lista solta de perguntas.
    it('documents the clinical purpose grouping rule for clarifyingQuestions', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('CLINICAL PURPOSE GROUPING RULE');
      expect(result.system).toContain('"purpose"');
      expect(result.system).toContain('Estabilidade hemodinâmica');
      // O contraste bom/ruim é o que evita que o modelo devolva a
      // categoria técnica do dado em vez do objetivo clínico da pergunta.
      expect(result.system).toContain('not a technical category');
    });

    // UX-07 — bug ao vivo do piloto: pergunta pedia valores ("quais são os
    // valores de PA...") mas vinha marcada "boolean", oferecendo só
    // Sim/Não/Não sei. Ver output-validator.spec.ts para a barreira em
    // runtime que reforça isto quando a instrução não é seguida.
    it('documents the answer type matching rule for clarifyingQuestions', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('ANSWER TYPE MATCHING RULE');
      expect(result.system).toContain('"quais"');
      expect(result.system).toContain('cannot answer vital sign values with Sim/Não/Não sei');
      expect(result.system).toContain('prefer "text"');
    });

    it('documents preliminary and clarifyingQuestions fields in the output schema', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('"preliminary"');
      expect(result.system).toContain('"category"');
      expect(result.system).toContain('"differentials"');
      expect(result.system).toContain('"clarifyingQuestions"');
      expect(result.system).toContain('"criticality"');
      expect(result.system).toContain('"expectedAnswerType"');
    });

    it('documents the emergency preceptor ordering rule for unstable patients', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('PRECEPTOR DE EMERGÊNCIA RULE');
      expect(result.system).toContain('"stabilization" FIRST');
      expect(result.system).toContain('"diagnostic", then "therapeutic", then "verify"');
      expect(result.system).toContain('do NOT include any "stabilization" recommendation');
    });

    it('documents the anti-anchoring differentials rule', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('ANTI-ANCHORING DIFFERENTIALS RULE');
      expect(result.system).toContain('include up to 3 items in "differentials"');
      expect(result.system).toContain('Differentials are reminders, not blockers');
      expect(result.system).toContain('return "differentials": []');
    });

    // PI-03 — diferenciais "não pode perder", sem número de probabilidade
    // (decisão explícita do Dr. Gustavo em reunião).
    it('documents the cannot-miss differentials rule with the same bar as a critical red flag', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('CANNOT-MISS DIFFERENTIALS RULE');
      expect(result.system).toContain('"cannotMiss": true');
      expect(result.system).toContain('same bar as a "critical" red flag');
      expect(result.system).toContain('"minutos", "horas", or "dias"');
    });

    it('explicitly forbids probability/percentage language in differentials', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('NEVER express likelihood as a percentage');
      expect(result.system).toContain('numeric score');
      expect(result.system).toContain('reason poorly with probability numbers');
    });

    it('documents cannotMiss and timeToHarm in the output schema', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('"cannotMiss"');
      expect(result.system).toContain('"timeToHarm"');
      expect(result.system).toContain("'minutos' | 'horas' | 'dias'");
    });

    it('includes a few-shot example for the flu-syndrome >48h case', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('EXAMPLE — DECISION PATH B');
      expect(result.system).toContain('síndrome gripal');
      expect(result.system).toContain('oseltamivir');
      expect(result.system).toContain('"criticality": "blocker"');
      expect(result.system).toContain('"category": "therapeutic"');
      expect(result.system).toContain('"differentials": []');
    });
  });

  // ──── S20-CLIN-01 — red flags explícitas do médico ───────────────────
  describe('S20-CLIN-01 — physician_confirmed_red_flags', () => {
    it('injects a dedicated block when red flags are confirmed', () => {
      const result = buildPrompt(
        makeInput({
          redFlags: { immunosuppressed: true, pregnant: false, anticoagulant: true },
        }),
      );

      expect(result.user).toContain('<physician_confirmed_red_flags');
      expect(result.user).toContain('TRUSTED_PHYSICIAN_INPUT');
      expect(result.user).toContain('Paciente imunossuprimido');
      expect(result.user).toContain('Paciente em uso de anticoagulante');
    });

    it('omits red flags marked as false (only confirmed=true appear)', () => {
      const result = buildPrompt(
        makeInput({
          redFlags: { immunosuppressed: true, pregnant: false },
        }),
      );

      expect(result.user).toContain('Paciente imunossuprimido');
      expect(result.user).not.toContain('Paciente gestante');
    });

    it('omits the entire block when no red flags are confirmed', () => {
      const result = buildPrompt(
        makeInput({
          redFlags: { immunosuppressed: false, pregnant: false },
        }),
      );

      expect(result.user).not.toContain('<physician_confirmed_red_flags');
    });

    it('omits the block when redFlags is undefined (retrocompatível)', () => {
      const result = buildPrompt(makeInput());

      expect(result.user).not.toContain('<physician_confirmed_red_flags');
    });

    it('instructs the model to treat confirmed flags as fact, not hypothesis', () => {
      const result = buildPrompt(
        makeInput({ redFlags: { immunosuppressed: true } }),
      );

      expect(result.user).toContain('Considere cada uma como fato estabelecido');
      expect(result.user).toContain('NÃO pergunte sobre elas nas clarifyingQuestions');
    });

    it('uses pt-BR clinical label for each canonical key', () => {
      const result = buildPrompt(
        makeInput({
          redFlags: {
            immunosuppressed: true,
            pregnant: true,
            anticoagulant: true,
            pediatric: true,
            elderly65: true,
            allergy: true,
          },
        }),
      );

      expect(result.user).toContain('Paciente imunossuprimido');
      expect(result.user).toContain('Paciente gestante ou amamentando');
      expect(result.user).toContain('Paciente em uso de anticoagulante');
      expect(result.user).toContain('Paciente pediátrico');
      expect(result.user).toContain('Paciente idoso (≥ 65 anos)');
      expect(result.user).toContain('Paciente com alergia medicamentosa relatada');
    });

    it('renders a fallback label for unknown keys (forward-compat)', () => {
      const result = buildPrompt(
        makeInput({ redFlags: { futureUnknownKey: true } }),
      );

      expect(result.user).toContain('Red flag marcada pelo médico: futureUnknownKey');
    });

    it('injects red flags block even when no guideline evidence is retrieved', () => {
      const result = buildPrompt(
        makeInput({
          retrievedChunks: [],
          redFlags: { immunosuppressed: true },
        }),
      );

      expect(result.user).toContain('<physician_confirmed_red_flags');
      expect(result.user).toContain('Paciente imunossuprimido');
      expect(result.user).toContain('WARNING: No relevant guideline evidence');
    });
  });

  describe('S21-CLIN-01: SUBTYPE / MUTUALLY-EXCLUSIVE CLASSIFICATION RULE', () => {
    it('includes the subtype classification rule in the system instruction on every prompt', () => {
      const result = buildPrompt(makeInput());

      expect(result.system).toContain('SUBTYPE / MUTUALLY-EXCLUSIVE CLASSIFICATION RULE');
      // Regressão do caso real que motivou a regra — mantém o texto do
      // prompt amarrado ao incidente documentado em docs/guidelines-catalog.md
      // (KB-003), para que uma futura reescrita do prompt não apague
      // silenciosamente a instrução sem que o teste avise.
      expect(result.system).toContain('fluctuating, repeatedly-reversible focal deficit');
      expect(result.system).toContain('AVC isquêmico');
      expect(result.system).toContain('AVC hemorrágico');
    });

    it('is present even when zero chunks are retrieved (case-only path)', () => {
      const result = buildPrompt(makeInput({ retrievedChunks: [] }));

      expect(result.system).toContain('SUBTYPE / MUTUALLY-EXCLUSIVE CLASSIFICATION RULE');
    });
  });
});

/**
 * KB-005/KB-006 — Aviso de cobertura fraca. Regressão dos dois casos
 * reportados em campo: chunks do cenário vizinho chegavam ao modelo marcados
 * como TRUSTED_CURATED_SOURCE, sem nenhum sinal de que o encaixe era ruim.
 */
describe('buildPrompt — aviso de cobertura', () => {
  it('injeta o aviso de encaixe fraco quando a cobertura é parcial', () => {
    const result = buildPrompt(makeInput({ coverage: 'partial' }));

    expect(result.user).toContain('<evidence_coverage_warning>');
    expect(result.user).toContain('COVERAGE IS WEAK');
    // O aviso precisa vir ANTES da evidência, para o modelo lê-lo enquanto
    // ainda está decidindo se aquele cenário é mesmo o do caso.
    expect(result.user.indexOf('<evidence_coverage_warning>')).toBeLessThan(
      result.user.indexOf('<guideline_evidence'),
    );
  });

  it('não injeta nada quando a cobertura é forte — prompt idêntico ao anterior', () => {
    const semAviso = buildPrompt(makeInput({ coverage: 'full' }));
    const semCampo = buildPrompt(makeInput());

    expect(semAviso.user).not.toContain('evidence_coverage_warning');
    expect(semAviso.user).toBe(semCampo.user);
  });

  it('cai no caminho de "declarar a lacuna e perguntar" quando não há chunk algum', () => {
    // Cobertura 'none' nunca chega aqui com chunks: o retrieval devolve lista
    // vazia e o buildPrompt usa buildCaseOnlyUser (DECISION MATRIX path D).
    const result = buildPrompt(makeInput({ retrievedChunks: [], coverage: 'none' }));

    expect(result.user).toContain('No relevant guideline evidence was found');
    expect(result.user).toContain('DECISION MATRIX path D');
    expect(result.user).not.toContain('<guideline_evidence');
    expect(result.retrievedChunkIds).toEqual([]);
  });
});

/**
 * F4 — referências anexadas pelo médico ao caso. Decisão de produto: podem ser
 * citadas (senão anexar a diretriz de dengue não resolveria o problema de quem
 * reportou), mas nunca como fonte curada.
 */
describe('buildPrompt — anexos do médico', () => {
  const attachment = {
    citationId: 'anexo:11111111-1111-4111-8111-111111111111',
    filename: 'abramede-dengue.pdf',
    text: 'Reposição volêmica: 10 mL/kg na primeira hora.',
  };

  it('coloca o anexo em bloco próprio, FORA da evidência curada', () => {
    const result = buildPrompt(makeInput({ physicianAttachments: [attachment] }));

    expect(result.user).toContain('<physician_attachments type="PHYSICIAN_SUPPLIED_UNCURATED">');
    expect(result.user).toContain(attachment.text);

    // O texto do anexo não pode estar dentro do bloco de fonte curada.
    const evidencia = result.user.slice(
      result.user.indexOf('<guideline_evidence'),
      result.user.indexOf('</guideline_evidence>'),
    );
    expect(evidencia).not.toContain(attachment.text);
  });

  it('torna o id do anexo citável, senão o validador rejeitaria a citação como inventada', () => {
    const result = buildPrompt(makeInput({ physicianAttachments: [attachment] }));

    expect(result.retrievedChunkIds).toContain(attachment.citationId);
  });

  it('mantém o anexo citável mesmo quando a base não cobre o caso', () => {
    // Cenário literal do reporte: a base não tem dengue, o médico anexa a
    // diretriz. Sem isto, anexar não mudaria nada.
    const result = buildPrompt(
      makeInput({ retrievedChunks: [], coverage: 'none', physicianAttachments: [attachment] }),
    );

    expect(result.user).toContain('<physician_attachments');
    expect(result.retrievedChunkIds).toEqual([attachment.citationId]);
  });

  it('não muda nada no prompt quando não há anexo', () => {
    expect(buildPrompt(makeInput()).user).not.toContain('physician_attachments');
  });

  it('instrui o modelo a marcar recomendação apoiada em anexo como preliminar', () => {
    const result = buildPrompt(makeInput({ physicianAttachments: [attachment] }));

    expect(result.system).toContain('PHYSICIAN ATTACHMENTS RULE');
    expect(result.system).toContain('"preliminary": true');
  });
});
