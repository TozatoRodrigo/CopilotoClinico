import { describe, it, expect } from 'vitest';
import { validateOutput, CopilotOutputSchema } from './output-validator';

const VALID_CHUNK_IDS = ['chunk-1', 'chunk-2', 'chunk-3'];

function makeValidOutput(overrides: Record<string, unknown> = {}): string {
  const base = {
    reasoning: 'Patient shows signs of hypertension',
    recommendations: [
      {
        action: 'Initiate ACE inhibitor therapy',
        rationale: 'BP consistently above 140/90',
        citationChunkId: 'chunk-1',
        confidence: 0.85,
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe('validateOutput', () => {
  it('accepts valid output with matching citations', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.unfoundedRecommendations).toEqual([]);
    expect(result.output?.recommendations[0]?.category).toBe('therapeutic');
  });

  it('rejects non-JSON output', () => {
    const result = validateOutput('not json at all', VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors).toContain('Output is not valid JSON');
  });

  it('rejects output that fails schema validation', () => {
    const result = validateOutput(JSON.stringify({ reasoning: '' }), VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('accepts an explicit recommendation category from the LLM', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Iniciar cristalóide EV',
            rationale: 'Paciente instável hemodinamicamente',
            citationChunkId: 'chunk-1',
            confidence: 0.97,
            category: 'stabilization',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );

    expect(result.valid).toBe(true);
    expect(result.output?.recommendations[0]?.category).toBe('stabilization');
  });

  it('accepts up to 3 anti-anchoring differentials and defaults to empty otherwise', () => {
    const withDifferentials = validateOutput(
      makeValidOutput({
        differentials: [
          {
            hypothesis: 'Dissecção de aorta abdominal',
            whyConsider: 'Lombalgia aguda em idoso hipertenso pode mascarar etiologia vascular.',
            whatDistinguishes: 'Dor súbita intensa, pulso assimétrico e angioTC.',
          },
          {
            hypothesis: 'Abscesso epidural',
            whyConsider: 'Dor lombar com sinais sistêmicos pode ter foco infeccioso profundo.',
            whatDistinguishes: 'Febre, déficit neurológico e ressonância.',
          },
          {
            hypothesis: 'Cauda equina',
            whyConsider: 'Atraso no reconhecimento muda prognóstico neurológico.',
            whatDistinguishes: 'Anestesia em sela, retenção urinária e déficit motor.',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );

    expect(withDifferentials.valid).toBe(true);
    expect(withDifferentials.output?.differentials).toHaveLength(3);

    const defaulted = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(defaulted.output?.differentials).toEqual([]);
  });

  // PI-03 — diferenciais "não pode perder".
  describe('PI-03: cannotMiss / timeToHarm', () => {
    it('defaults cannotMiss to false when omitted (retrocompatível)', () => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Pneumonia atípica',
              whyConsider: 'Febre e tosse com padrão radiológico atípico.',
              whatDistinguishes: 'Sorologia e TC de tórax.',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.differentials[0]?.cannotMiss).toBe(false);
      expect(result.output?.differentials[0]?.timeToHarm).toBeUndefined();
    });

    it('accepts a cannot-miss differential with a qualitative timeToHarm', () => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta',
              whyConsider: 'Dor torácica súbita irradiada para o dorso em hipertenso.',
              whatDistinguishes: 'Assimetria de pulsos e angioTC de aorta.',
              cannotMiss: true,
              timeToHarm: 'minutos',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.differentials[0]?.cannotMiss).toBe(true);
      expect(result.output?.differentials[0]?.timeToHarm).toBe('minutos');
    });

    it('rejects timeToHarm values outside the closed qualitative set (never a number)', () => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta',
              whyConsider: 'Dor torácica súbita.',
              whatDistinguishes: 'AngioTC.',
              cannotMiss: true,
              timeToHarm: '30 minutos' as unknown as 'minutos',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(false);
    });

    it.each([
      ['percentual', 'Probabilidade de 70% de ser dissecção de aorta.'],
      ['palavra "probabilidade"', 'Alta probabilidade de etiologia vascular dado o perfil.'],
      ['likelihood em inglês', 'High likelihood of aortic dissection given the presentation.'],
      ['razão de chance', 'A chance de ser isso é considerável.'],
    ])('rejects differential whose text uses %s instead of cannotMiss/timeToHarm', (_label, whyConsider) => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta',
              whyConsider,
              whatDistinguishes: 'AngioTC.',
              cannotMiss: true,
              timeToHarm: 'minutos',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('PROBABILITY LANGUAGE NOT ALLOWED'))).toBe(
        true,
      );
    });

    it('rejects probability language in hypothesis or whatDistinguishes too, not just whyConsider', () => {
      const inHypothesis = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta (65% dos casos torácicos atípicos)',
              whyConsider: 'Dor súbita irradiada.',
              whatDistinguishes: 'AngioTC.',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(inHypothesis.valid).toBe(false);

      const inDistinguishes = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta',
              whyConsider: 'Dor súbita irradiada.',
              whatDistinguishes: 'AngioTC — probability of confirming is high with contrast.',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(inDistinguishes.valid).toBe(false);
    });

    it('does not flag legitimate clinical scores/numbers that are not probability language', () => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Tromboembolismo pulmonar',
              whyConsider: 'Score de Wells elevado e dispneia súbita.',
              whatDistinguishes: 'D-dímero e angioTC de tórax.',
              cannotMiss: true,
              timeToHarm: 'horas',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
    });

    it('allows cannotMiss=false differentials to coexist with cannotMiss=true ones', () => {
      const result = validateOutput(
        makeValidOutput({
          differentials: [
            {
              hypothesis: 'Dissecção de aorta',
              whyConsider: 'Dor súbita irradiada.',
              whatDistinguishes: 'AngioTC.',
              cannotMiss: true,
              timeToHarm: 'minutos',
            },
            {
              hypothesis: 'Costocondrite',
              whyConsider: 'Dor reprodutível à palpação.',
              whatDistinguishes: 'Exame físico dirigido.',
              cannotMiss: false,
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.differentials.map((d) => d.cannotMiss)).toEqual([true, false]);
    });
  });

  it('rejects output without citations when chunk IDs are provided but none match', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Test',
            rationale: 'Test rationale',
            citationChunkId: 'FAKE-ID',
            confidence: 0.9,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.unfoundedRecommendations).toEqual([0]);
  });

  it('flags recommendations with fabricated chunk IDs as unfounded', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R',
            citationChunkId: 'FABRICATED',
            confidence: 0.8,
          },
          {
            action: 'C',
            rationale: 'R',
            citationChunkId: 'chunk-3',
            confidence: 0.7,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.unfoundedRecommendations).toEqual([1]);
    expect(result.valid).toBe(true);
  });

  // CC-02 — Este teste ANTES afirmava que uncertainty=true sozinho, sem
  // recomendações E sem perguntas, era um output válido. Essa era exatamente
  // a codificação do bug reproduzido na apresentação (caso de cefaleia pobre:
  // "0 definitivas · 0 preliminares", sem próximo passo possível). Mantido
  // aqui, invertido, para documentar a reversão deliberada — não é um teste
  // nascendo já quebrado, é a prova de que o comportamento antigo foi
  // conscientemente eliminado.
  it('CC-02: rejects uncertainty=true with no recommendations AND no clarifying questions (the wall)', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Insufficient data',
      }),
      VALID_CHUNK_IDS,
    );
    // Erro de regra de negócio pós-schema (não falha de parse/Zod) — output
    // continua populado para eventual inspeção/log, mas valid=false é o que
    // impede o orquestrador de aceitar a resposta.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('DEAD END'))).toBe(true);
  });

  it('CC-02: accepts uncertainty=true with no recommendations WHEN clarifying questions are present (incerteza sobre a diretriz, perguntas sobre o paciente coexistem)', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Nenhuma diretriz cobre este cenário na base atual',
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'A dor é súbita ou progressiva?',
            why: 'Discrimina causas vasculares agudas de causas subagudas',
            criticality: 'blocker',
            expectedAnswerType: 'choice',
            choices: ['Súbita', 'Progressiva'],
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toHaveLength(1);
  });

  it('rejects output with no recommendations and uncertainty=false', () => {
    const result = validateOutput(
      makeValidOutput({ recommendations: [], uncertainty: false }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Output has no recommendations and uncertainty is not declared',
    );
    expect(result.errors.some((e) => e.startsWith('DEAD END'))).toBe(true);
  });

  it('CC-02: accepts zero recommendations with uncertainty=false WHEN clarifying questions are present (o caso que destrava a correção)', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [],
        uncertainty: false,
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'O paciente é imunossuprimido?',
            why: 'Muda a indicação e a duração do oseltamivir — Diretriz Influenza',
            criticality: 'blocker',
            expectedAnswerType: 'boolean',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.recommendations).toEqual([]);
    expect(result.output?.clarifyingQuestions).toHaveLength(1);
  });

  it('CC-02: rejects zero recommendations and zero clarifying questions regardless of uncertainty value (DEAD END is absolute)', () => {
    const withUncertaintyTrue = validateOutput(
      makeValidOutput({
        recommendations: [],
        clarifyingQuestions: [],
        uncertainty: true,
        uncertaintyReason: 'Sem evidência',
      }),
      VALID_CHUNK_IDS,
    );
    const withUncertaintyFalse = validateOutput(
      makeValidOutput({ recommendations: [], clarifyingQuestions: [], uncertainty: false }),
      VALID_CHUNK_IDS,
    );

    for (const result of [withUncertaintyTrue, withUncertaintyFalse]) {
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('DEAD END'))).toBe(true);
    }
  });

  it('CC-02: the DEAD END message is actionable — it tells the model to ask, not just that it failed (contrato com o retry automático)', () => {
    const result = validateOutput(
      makeValidOutput({ recommendations: [], clarifyingQuestions: [], uncertainty: true, uncertaintyReason: 'x' }),
      VALID_CHUNK_IDS,
    );
    const deadEndError = result.errors.find((e) => e.startsWith('DEAD END'));
    expect(deadEndError).toBeDefined();
    expect(deadEndError).toMatch(/ask/i);
  });

  it('rejects output with uncertainty=true but null uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: true, uncertaintyReason: null }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('uncertaintyReason'))).toBe(true);
  });

  it('rejects output with uncertainty=true but empty string uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: true, uncertaintyReason: '' }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('uncertaintyReason'))).toBe(true);
  });

  it('accepts output with uncertainty=false and null uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: false, uncertaintyReason: null }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('handles JSON wrapped in markdown code blocks', () => {
    const raw = '```json\n' + makeValidOutput() + '\n```';
    const result = validateOutput(raw, VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output).not.toBeNull();
  });

  it('validates confidence range (0-1)', () => {
    const highResult = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: 1.5,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(highResult.valid).toBe(false);
    expect(highResult.output).toBeNull();

    const lowResult = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: -0.1,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(lowResult.valid).toBe(false);
    expect(lowResult.output).toBeNull();
  });

  it('validates all required fields exist', () => {
    const missingFields = JSON.stringify({
      reasoning: 'Some reasoning',
    });
    const result = validateOutput(missingFields, VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('returns unfounded indices for fabricated citations', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'FAKE-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R',
            citationChunkId: 'FAKE-2',
            confidence: 0.8,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.unfoundedRecommendations).toEqual([0, 1]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'All recommendations have unfounded citations — no valid chunk IDs found',
    );
  });

  // UX-07 — bug relatado ao vivo por um médico do piloto: o modelo pedia
  // "quais são os valores de PA, FC, FR, SpO2..." mas marcava a pergunta
  // como "boolean" — a UI só oferecia Sim/Não/Não sei, o médico não
  // conseguia responder, e o turno seguinte pedia a mesma coisa de novo
  // ("loop"). Ver ANSWER TYPE MATCHING RULE em prompt-builder.ts.
  describe('UX-07: clarifyingQuestions answer-type mismatch', () => {
    it.each([
      ['quais são os valores', 'Quais são os valores de PA, FC, FR, SpO2 e temperatura?'],
      ['quando + qual (composta)', 'Qual foi o último momento em que o paciente estava bem, e qual é a glicemia capilar?'],
      ['quantos/quantas', 'Quantos episódios de vômito o paciente teve nas últimas 24h?'],
      ['quem', 'Quem observou o início dos sintomas?'],
      ['onde', 'Onde exatamente é a dor referida?'],
    ])('rejects a "boolean" question whose text asks %s (an open value, not yes/no)', (_label, question) => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question,
              why: 'Define estabilidade hemodinâmica',
              // 'important' (não 'blocker') para não colidir com o refine
              // pré-existente que exige recomendações preliminares quando
              // há uma pergunta blocker — irrelevante para este teste.
              criticality: 'important',
              expectedAnswerType: 'boolean',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('ANSWER TYPE MISMATCH'))).toBe(true);
      expect(result.errors.join(' ')).toContain(question);
    });

    it('accepts the same question text when expectedAnswerType is "text" instead of "boolean"', () => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Quais são os valores de PA, FC, FR, SpO2 e temperatura?',
              why: 'Define estabilidade hemodinâmica',
              criticality: 'important',
              expectedAnswerType: 'text',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
    });

    it('does not flag a genuine boolean question with no interrogative wh-word', () => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'O paciente é imunossuprimido?',
              why: 'Define necessidade de cobertura antibiótica ampliada',
              criticality: 'important',
              expectedAnswerType: 'boolean',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
    });

    it('flags each offending question independently when multiple clarifyingQuestions mismatch', () => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Quais os valores de PA e FC?',
              why: 'Define estabilidade hemodinâmica',
              criticality: 'important',
              expectedAnswerType: 'boolean',
            },
            {
              id: 'q2',
              question: 'Quando foi a última dose do anticoagulante?',
              why: 'Define necessidade de reversão',
              criticality: 'important',
              expectedAnswerType: 'boolean',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(false);
      const mismatchError = result.errors.find((e) => e.startsWith('ANSWER TYPE MISMATCH'));
      expect(mismatchError).toContain('clarifyingQuestions[0]');
      expect(mismatchError).toContain('clarifyingQuestions[1]');
    });
  });

  it('accepts output with valid clarifyingQuestions', () => {
    const result = validateOutput(
      makeValidOutput({
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'O paciente é imunossuprimido?',
            why: 'Define necessidade de cobertura antibiótica ampliada',
            criticality: 'important',
            expectedAnswerType: 'boolean',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toHaveLength(1);
  });

  // UX-01 — "purpose" agrupa perguntas por finalidade clínica na UI.
  describe('UX-01: clarifyingQuestions.purpose', () => {
    it('accepts a clarifyingQuestion with a purpose label', () => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Qual a PA atual?',
              why: 'Define gravidade do choque',
              // 'important' (não 'blocker') para não colidir com o refine
              // pré-existente que exige recomendações preliminares quando
              // há uma pergunta blocker — irrelevante para o que este
              // teste verifica (aceitação do campo purpose).
              criticality: 'important',
              expectedAnswerType: 'number',
              purpose: 'Estabilidade hemodinâmica',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.clarifyingQuestions[0]?.purpose).toBe('Estabilidade hemodinâmica');
    });

    it('remains backward-compatible when purpose is omitted (older turns/weaker models)', () => {
      const result = validateOutput(
        makeValidOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Qual a PA atual?',
              why: 'Define gravidade do choque',
              criticality: 'important',
              expectedAnswerType: 'number',
            },
          ],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.clarifyingQuestions[0]?.purpose).toBeUndefined();
    });

    it('groups multiple questions under the same purpose string, unaltered', () => {
      const question = (id: string, q: string) => ({
        id,
        question: q,
        why: 'Define gravidade do choque',
        criticality: 'important' as const,
        expectedAnswerType: 'number' as const,
        purpose: 'Estabilidade hemodinâmica',
      });
      const result = validateOutput(
        makeValidOutput({
          recommendations: [
            {
              action: 'Initiate ACE inhibitor therapy',
              rationale: 'BP consistently above 140/90',
              citationChunkId: 'chunk-1',
              confidence: 0.85,
              preliminary: true,
            },
          ],
          clarifyingQuestions: [question('q1', 'Qual a PA?'), question('q2', 'Qual a FC?')],
        }),
        VALID_CHUNK_IDS,
      );
      expect(result.valid).toBe(true);
      expect(result.output?.clarifyingQuestions.map((q) => q.purpose)).toEqual([
        'Estabilidade hemodinâmica',
        'Estabilidade hemodinâmica',
      ]);
    });
  });

  it('rejects output with a blocker clarifying question and a non-preliminary recommendation', () => {
    const result = validateOutput(
      makeValidOutput({
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'Há quanto tempo iniciaram os sintomas?',
            why: 'Define se o quadro é agudo ou crônico',
            criticality: 'blocker',
            expectedAnswerType: 'choice',
            choices: ['<48h', '>=48h'],
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.some((e) => e.includes('recommendations'))).toBe(true);
  });

  it('accepts output with a blocker clarifying question when recommendations are marked preliminary', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'O paciente é imunossuprimido?',
            why: 'Define necessidade de cobertura antibiótica ampliada',
            criticality: 'blocker',
            expectedAnswerType: 'boolean',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.recommendations[0]?.preliminary).toBe(true);
  });

  it('remains backward-compatible with output that has no clarifyingQuestions field', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toEqual([]);
    expect(result.output?.recommendations[0]?.preliminary).toBe(false);
  });

  it('accepts output with exactly 3 clarifyingQuestions', () => {
    const question = (id: string) => ({
      id,
      question: `Pergunta ${id}?`,
      why: 'Define a conduta conforme a diretriz X',
      criticality: 'important' as const,
      expectedAnswerType: 'boolean' as const,
    });
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [question('q1'), question('q2'), question('q3')],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toHaveLength(3);
  });

  it('rejects output with more than 3 clarifyingQuestions (DEC-003)', () => {
    const question = (id: string) => ({
      id,
      question: `Pergunta ${id}?`,
      why: 'Define a conduta conforme a diretriz X',
      criticality: 'important' as const,
      expectedAnswerType: 'boolean' as const,
    });
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [question('q1'), question('q2'), question('q3'), question('q4')],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(
      result.errors.some((e) => e.includes('clarifyingQuestions') && e.includes('at most 3')),
    ).toBe(true);
  });

  it('accepts valid output when all chunk IDs match', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R1',
            citationChunkId: 'chunk-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R2',
            citationChunkId: 'chunk-2',
            confidence: 0.8,
          },
          {
            action: 'C',
            rationale: 'R3',
            citationChunkId: 'chunk-3',
            confidence: 0.7,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.unfoundedRecommendations).toEqual([]);
    expect(result.output?.recommendations.length).toBe(3);
  });

  describe('S21-CLIN-01: unresolved subtype ambiguity guardrail', () => {
    // Regressão do caso real de demo: déficit focal flutuante-reversível
    // (padrão de isquemia/AIT) citado contra o chunk de AVC hemorrágico, sem
    // que a alternativa isquêmica fosse sequer mencionada. Ver
    // docs/guidelines-catalog.md (KB-003) e prompt-builder.ts (SUBTYPE /
    // MUTUALLY-EXCLUSIVE CLASSIFICATION RULE) para o resto da correção.
    const AVC_CHUNKS = [
      { id: 'chunk-avc-isquemico', metadata: { cenario: 'avc_agudo', subtipo: 'isquemico' } },
      { id: 'chunk-avc-hemorragico', metadata: { cenario: 'avc_agudo', subtipo: 'hemorragico' } },
    ];
    // Distinto de VALID_CHUNK_IDS (usado pelo resto do arquivo) para que os
    // testes deste bloco exercitem só o guardrail de coerência, sem cair
    // também no guardrail (não relacionado) de "citação sem chunk válido".
    const AVC_CHUNK_IDS = AVC_CHUNKS.map((c) => c.id);

    it('rejects citing only the hemorrhagic subtype when both subtypes were retrieved and the model shows no sign of having considered the alternative', () => {
      const result = validateOutput(
        makeValidOutput({
          reasoning: 'Paciente com déficit focal agudo, TC com ASPECTS 10.',
          recommendations: [
            {
              action: 'Reverter anticoagulação e controlar PA <150mmHg',
              rationale: 'Conduta de hemorragia intracraniana',
              citationChunkId: 'chunk-avc-hemorragico',
              confidence: 0.8,
            },
          ],
          differentials: [],
        }),
        AVC_CHUNK_IDS,
        AVC_CHUNKS,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('UNRESOLVED SUBTYPE AMBIGUITY'))).toBe(true);
    });

    it('accepts the same citation when a differential covers the other subtype', () => {
      const result = validateOutput(
        makeValidOutput({
          reasoning: 'Paciente com déficit focal agudo, TC com ASPECTS 10.',
          recommendations: [
            {
              action: 'Reverter anticoagulação e controlar PA <150mmHg',
              rationale: 'Conduta de hemorragia intracraniana',
              citationChunkId: 'chunk-avc-hemorragico',
              confidence: 0.8,
            },
          ],
          differentials: [
            {
              hypothesis: 'AVC isquêmico / AIT',
              whyConsider: 'Déficit fixo desde o início, sem padrão flutuante relatado.',
              whatDistinguishes: 'Confirmar horário exato de início e se houve reversão.',
              cannotMiss: true,
              timeToHarm: 'horas',
            },
          ],
        }),
        AVC_CHUNK_IDS,
        AVC_CHUNKS,
      );
      expect(result.valid).toBe(true);
    });

    it('accepts the same citation when reasoning explicitly names the discriminating alternative subtype', () => {
      const result = validateOutput(
        makeValidOutput({
          reasoning:
            'Déficit fixo e progressivo desde o início, sem reversão — padrão incompatível com isquemico/AIT, compatível com hemorragia.',
          recommendations: [
            {
              action: 'Reverter anticoagulação e controlar PA <150mmHg',
              rationale: 'Conduta de hemorragia intracraniana',
              citationChunkId: 'chunk-avc-hemorragico',
              confidence: 0.8,
            },
          ],
          differentials: [],
        }),
        AVC_CHUNK_IDS,
        AVC_CHUNKS,
      );
      expect(result.valid).toBe(true);
    });

    it('does not trigger when only one subtype was retrieved (no ambiguity to resolve)', () => {
      const result = validateOutput(
        makeValidOutput({
          recommendations: [
            {
              action: 'Trombólise IV',
              rationale: 'Dentro da janela de 4,5h',
              citationChunkId: 'chunk-avc-isquemico',
              confidence: 0.8,
            },
          ],
          differentials: [],
        }),
        AVC_CHUNK_IDS,
        [AVC_CHUNKS[0]!],
      );
      expect(result.valid).toBe(true);
    });

    it('does not trigger when retrieved chunks have no cenario/subtipo metadata (backward-compatible with content that predates this guardrail)', () => {
      const result = validateOutput(
        makeValidOutput({
          recommendations: [
            {
              action: 'A',
              rationale: 'R',
              citationChunkId: 'chunk-1',
              confidence: 0.8,
            },
          ],
          differentials: [],
        }),
        VALID_CHUNK_IDS,
        [
          { id: 'chunk-1', metadata: {} },
          { id: 'chunk-2', metadata: {} },
        ],
      );
      expect(result.valid).toBe(true);
    });

    it('generalizes to any cenario/subtipo pair, not just AVC (proves the check is not domain-hardcoded)', () => {
      const chunks = [
        { id: 'chunk-x', metadata: { cenario: 'cenario_sintetico', subtipo: 'tipo_a' } },
        { id: 'chunk-y', metadata: { cenario: 'cenario_sintetico', subtipo: 'tipo_b' } },
      ];
      const result = validateOutput(
        makeValidOutput({
          reasoning: 'Sem menção a nenhum dos dois subtipos.',
          recommendations: [
            {
              action: 'Conduta do tipo A',
              rationale: 'R',
              citationChunkId: 'chunk-x',
              confidence: 0.8,
            },
          ],
          differentials: [],
        }),
        chunks.map((c) => c.id),
        chunks,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cenario_sintetico'))).toBe(true);
    });

    // KB-004 (docs/guidelines/drafts/kb-004-dicotomias-plantao/03-anafilaxia.md
    // e 04-alergia-simples.md) — segunda dicotomia real de conduta oposta,
    // além do caso original de AVC: tratar anafilaxia como alergia simples
    // atrasa a adrenalina IM, e o atraso mata em minutos.
    it('rejects treating a case as simple allergy without addressing anaphylaxis when both subtypes were retrieved for anafilaxia_urticaria', () => {
      const chunks = [
        { id: 'chunk-anafilaxia', metadata: { cenario: 'anafilaxia_urticaria', subtipo: 'anafilaxia' } },
        {
          id: 'chunk-alergia-simples',
          metadata: { cenario: 'anafilaxia_urticaria', subtipo: 'alergia_simples' },
        },
      ];
      const result = validateOutput(
        makeValidOutput({
          reasoning: 'Paciente com urticária após exposição a alérgeno conhecido.',
          recommendations: [
            {
              action: 'Anti-histamínico oral e observação',
              rationale: 'Reação alérgica localizada',
              citationChunkId: 'chunk-alergia-simples',
              confidence: 0.7,
            },
          ],
          differentials: [],
        }),
        chunks.map((c) => c.id),
        chunks,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('UNRESOLVED SUBTYPE AMBIGUITY'))).toBe(true);
    });
  });
});

describe('CopilotOutputSchema', () => {
  it('accepts confidence at boundary 0', () => {
    const result = CopilotOutputSchema.safeParse({
      reasoning: 'test',
      recommendations: [
        {
          action: 'A',
          rationale: 'R',
          citationChunkId: 'chunk-1',
          confidence: 0,
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts confidence at boundary 1', () => {
    const result = CopilotOutputSchema.safeParse({
      reasoning: 'test',
      recommendations: [
        {
          action: 'A',
          rationale: 'R',
          citationChunkId: 'c1',
          confidence: 1,
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('redFlags', () => {
  it('defaults to empty array when redFlags is omitted', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags).toEqual([]);
  });

  it('accepts output with valid red flags', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Taquicardia sustentada > 130 bpm',
            severity: 'high',
            action: 'Monitorar ritmo cardíaco contínuo e investigar causa',
          },
          {
            finding: 'Febre persistente há 5 dias',
            severity: 'moderate',
            action: 'Investigar foco infeccioso e considerar hemocultura',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags).toHaveLength(2);
    expect(result.output?.redFlags[0]?.severity).toBe('high');
  });

  it('accepts output with moderate severity red flags', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Febre persistente há 5 dias',
            severity: 'moderate',
            action: 'Investigar foco infeccioso e considerar hemocultura',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags[0]?.severity).toBe('moderate');
  });

  it('rejects red flag with invalid severity', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Test',
            severity: 'invalid',
            action: 'Test',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
  });

  it('rejects red flag missing required fields', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [{ finding: 'Test' }],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
  });

  it('allows critical red flags with stabilization recommendations', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar cristalóide EV em bolus',
            rationale: 'Paciente instável',
            citationChunkId: 'chunk-1',
            confidence: 0.95,
            preliminary: false,
            category: 'stabilization',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects critical red flags when non-stabilization recommendations are definitive', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: false,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
  });

  it('allows critical red flags when non-stabilization recommendations are preliminary', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Considerar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.7,
            preliminary: true,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('allows high severity red flags with any recommendations', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Taquicardia > 130 bpm',
            severity: 'high',
            action: 'Monitorar ritmo cardíaco',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: false,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });
});
