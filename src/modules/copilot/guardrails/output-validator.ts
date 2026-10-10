import { z } from 'zod';
import { isAttachmentCitation } from '../orchestrator/prompt-builder';

export const RecommendationCategorySchema = z.enum([
  'stabilization',
  'diagnostic',
  'therapeutic',
  'verify',
]);

export const RedFlagSeveritySchema = z.enum(['critical', 'high', 'moderate']);

/**
 * Campo opcional que o modelo pode devolver como `null`. O structured output
 * estrito da OpenAI exige todo campo em `required`, então opcionais viram
 * anuláveis no JSON Schema (schemas/copilot-output.json-schema.ts); `null` é
 * lido como ausente para o resto do pipeline não mudar.
 */
function optionalFromModel<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((value) => value ?? undefined);
}

export const RedFlagSchema = z.object({
  finding: z.string().min(1),
  severity: RedFlagSeveritySchema,
  action: z.string().min(1),
});

const RecommendationSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
  citationChunkId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  preliminary: z.boolean().default(false),
  category: RecommendationCategorySchema.default('therapeutic'),
});

const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  why: z.string().min(1),
  criticality: z.enum(['blocker', 'important', 'optional']),
  expectedAnswerType: z.enum(['boolean', 'choice', 'number', 'text']),
  choices: optionalFromModel(z.array(z.string())),
  // UX-01 — finalidade clínica para agrupar na UI (ex: "Estabilidade
  // hemodinâmica"). Opcional: modelos mais fracos ou turnos antigos podem
  // não preencher — o front degrada para lista simples nesse caso.
  purpose: optionalFromModel(z.string()),
});

const DifferentialSchema = z.object({
  hypothesis: z.string().min(1),
  whyConsider: z.string().min(1),
  whatDistinguishes: z.string().min(1),
  // PI-03 — "não pode perder": mesmo bar de um red flag "critical" (risco
  // de morte/dano irreversível em minutos a horas). Default false para
  // outputs antigos/modelos mais fracos que não preencham o campo.
  cannotMiss: z.boolean().default(false),
  // Só faz sentido junto de cannotMiss=true; janela qualitativa, nunca
  // número ou percentual — ver PROBABILITY_LANGUAGE_PATTERN abaixo.
  timeToHarm: optionalFromModel(z.enum(['minutos', 'horas', 'dias'])),
});

export const CopilotOutputSchema = z
  .object({
    reasoning: z.string().min(1),
    redFlags: z.array(RedFlagSchema).default([]),
    recommendations: z.array(RecommendationSchema).min(0),
    uncertainty: z.boolean(),
    uncertaintyReason: z.string().nullable(),
    differentials: z.array(DifferentialSchema).max(3).default([]),
    clarifyingQuestions: z
      .array(ClarifyingQuestionSchema)
      .max(3, 'clarifyingQuestions must contain at most 3 items per turn')
      .default([]),
  })
  .refine(
    (data) =>
      !data.uncertainty || (data.uncertaintyReason !== null && data.uncertaintyReason.length > 0),
    {
      message: 'uncertaintyReason is required and must be non-empty when uncertainty is true',
      path: ['uncertaintyReason'],
    },
  )
  .refine(
    (data) => {
      const hasBlocker = data.clarifyingQuestions.some((q) => q.criticality === 'blocker');
      if (!hasBlocker) return true;
      return (
        data.recommendations.length === 0 || data.recommendations.every((rec) => rec.preliminary)
      );
    },
    {
      message:
        'When clarifyingQuestions contains a blocker item, recommendations must be empty or all marked as preliminary',
      path: ['recommendations'],
    },
  )
  .refine(
    (data) => {
      const hasCriticalRedFlag = data.redFlags.some((rf) => rf.severity === 'critical');
      if (!hasCriticalRedFlag) return true;
      return data.recommendations.every(
        (rec) => rec.category === 'stabilization' || rec.preliminary,
      );
    },
    {
      message:
        'When redFlags contains a critical severity item, non-stabilization recommendations must be preliminary',
      path: ['redFlags'],
    },
  );

export type CopilotOutput = z.infer<typeof CopilotOutputSchema>;

export interface ValidationResult {
  valid: boolean;
  output: CopilotOutput | null;
  errors: string[];
  unfoundedRecommendations: number[];
}

/**
 * S21-CLIN-01 — subset dos campos do chunk recuperado necessário para o
 * guardrail de coerência de classificação (ver `findUnresolvedSubtypeAmbiguity`
 * abaixo). Deliberadamente mínimo — não é o `RetrievedChunk` completo do
 * hybrid-search para não acoplar este módulo de guardrails ao módulo de
 * retrieval; qualquer chamador (orchestrator.service.ts) já tem esse shape.
 */
export interface ChunkForCoherenceCheck {
  id: string;
  metadata?: Record<string, unknown> | null;
}

export function validateOutput(
  rawOutput: string,
  validChunkIds: string[],
  retrievedChunks: ChunkForCoherenceCheck[] = [],
): ValidationResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    const cleaned = rawOutput
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      valid: false,
      output: null,
      errors: ['Output is not valid JSON'],
      unfoundedRecommendations: [],
    };
  }

  const schemaResult = CopilotOutputSchema.safeParse(parsed);
  if (!schemaResult.success) {
    const fieldErrors = schemaResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      valid: false,
      output: null,
      errors: ['Schema validation failed', ...fieldErrors],
      unfoundedRecommendations: [],
    };
  }

  const output = schemaResult.data;
  const chunkIdSet = new Set(validChunkIds);
  const unfoundedRecommendations: number[] = [];

  output.recommendations.forEach((rec, index) => {
    if (!chunkIdSet.has(rec.citationChunkId)) {
      unfoundedRecommendations.push(index);
    }
  });

  if (allRecommendationsUnfounded(output, validChunkIds) && output.recommendations.length > 0) {
    errors.push('All recommendations have unfounded citations — no valid chunk IDs found');
  }

  // CC-02 — "beco sem saída": um output que não recomenda nada e não pergunta
  // nada deixa o médico sem próximo passo. Isto é o que produziu a parede
  // vista na apresentação (caso de cefaleia pobre: "não há evidência
  // suficiente… 0 definitivas · 0 preliminares", sem nenhuma ação possível).
  //
  // Duas regras, deliberadamente sobrepostas (a primeira é um caso particular
  // da segunda, mantida por rastreabilidade de mensagem — ver output-validator.spec.ts):
  //
  // 1. Relaxamento: zero recomendações passa a ser legítimo quando há
  //    perguntas — perguntar é, por si só, um desfecho válido do turno.
  if (
    !output.uncertainty &&
    output.recommendations.length === 0 &&
    output.clarifyingQuestions.length === 0
  ) {
    errors.push('Output has no recommendations and uncertainty is not declared');
  }

  // 2. Regra dura: independentemente de `uncertainty`, nunca é aceitável
  //    devolver zero recomendações E zero perguntas. Esta é a regra que
  //    fecha o bug — antes dela, "uncertainty: true" sozinho bastava para
  //    passar na validação mesmo sem nenhuma pergunta, o que é exatamente
  //    a parede. A mensagem é escrita para ser acionável: ela é injetada
  //    literalmente no retry de correção (orchestrator.service.ts), então
  //    precisa dizer ao modelo o que fazer, não só o que está errado — é
  //    isto que inverte o gradiente do retry a favor de perguntar.
  if (output.recommendations.length === 0 && output.clarifyingQuestions.length === 0) {
    errors.push(
      'DEAD END: output must contain at least one recommendation or at least one ' +
        'clarifying question. Declaring uncertainty alone leaves the physician with ' +
        'no next step. If evidence is insufficient, ask the triage questions needed ' +
        'to narrow the case instead of stopping.',
    );
  }

  // F4 — Uma recomendação que cita um anexo do médico está apoiada em fonte
  // NÃO CURADA. A decisão de produto foi permitir a citação (senão anexar a
  // diretriz de dengue não resolveria nada para quem reportou o problema),
  // com o contrapeso de que ela nunca sai como conduta definitiva: a UI marca
  // a fonte como não curada e a recomendação fica preliminar. Este guardrail
  // é o que garante o contrapeso, em vez de confiar no prompt — ver
  // PHYSICIAN ATTACHMENTS RULE em prompt-builder.ts.
  const attachmentBackedDefinitive = output.recommendations
    .map((rec, index) => ({ rec, index }))
    .filter(({ rec }) => isAttachmentCitation(rec.citationChunkId) && rec.preliminary !== true)
    .map(({ index }) => index);

  if (attachmentBackedDefinitive.length > 0) {
    errors.push(
      `ATTACHMENT-BACKED RECOMMENDATION MUST BE PRELIMINARY: recommendations at index ` +
        `${attachmentBackedDefinitive.join(', ')} cite a reference the physician attached to this ` +
        'case, which was never curated. Set "preliminary": true on each of them and state in the ' +
        'rationale that the source was supplied by the physician and has not been curated.',
    );
  }

  // S21-CLIN-01 — guardrail de coerência diagnóstica. Motivado pelo caso de
  // demo em que o Copiloto citou o chunk de "AVC hemorrágico" para um caso
  // com déficit flutuante e reversível (padrão de isquemia/AIT, incompatível
  // com hemorragia ativa) enquanto Open Evidence e Volts foram para
  // isquêmico — sem que nada no output desse sinal de que a alternativa
  // hemorrágica x isquêmica havia sido sequer considerada. A causa raiz de
  // conteúdo (base sem chunk de classificação) foi endereçada em KB-003; este
  // é o backstop estrutural para quando a evidência retornada já cobre dois
  // subtipos mutuamente exclusivos do mesmo cenário mas o modelo cita só um
  // sem evidenciar que pesou a alternativa — mesmo padrão do guardrail
  // DEAD END acima (checagem estrutural, não NLP pesada), pareado com a
  // SUBTYPE / MUTUALLY-EXCLUSIVE CLASSIFICATION RULE em prompt-builder.ts.
  const subtypeOffense = findUnresolvedSubtypeAmbiguity(output, retrievedChunks);
  if (subtypeOffense) {
    const missing = subtypeOffense.missingSubtypes.map(
      (subtype) => `"${humanizeSubtype(subtype)}"`,
    );
    errors.push(
      `UNRESOLVED SUBTYPE AMBIGUITY: evidence retrieved for cenario "${subtypeOffense.cenario}" ` +
        `covers mutually exclusive subtypes (${subtypeOffense.subtypes.join(', ')}) with opposite ` +
        `management, and a recommendation cited "${subtypeOffense.citedSubtype}" without naming the ` +
        `alternative subtype ${missing.join(', ')} anywhere in the output. Name it explicitly — in a ` +
        'differential ("hypothesis", "whyConsider" or "whatDistinguishes"; cannotMiss when ' +
        'appropriate) or in "reasoning" together with the discriminating clinical feature that ' +
        'rules it out. A differential about something else does not count — never cite a ' +
        'subtype-specific recommendation silently when the retrieved evidence itself is ambiguous.',
    );
  }

  // PI-03 — guarda em runtime, não só instrução de prompt: nenhum campo de
  // differential pode conter linguagem de probabilidade/percentual. A
  // decisão de descartar isso foi do próprio Dr. Gustavo ("médico trabalha
  // muito mal com probabilidades") — `timeToHarm` já é um enum fechado que
  // barra isso estruturalmente, mas os campos de texto livre (hypothesis,
  // whyConsider, whatDistinguishes) ainda podem escapar. Rejeitar aqui
  // aciona o mesmo retry-com-feedback dos outros guard rails.
  const probabilityOffenses = findProbabilityLanguageInDifferentials(output.differentials);
  if (probabilityOffenses.length > 0) {
    errors.push(
      'PROBABILITY LANGUAGE NOT ALLOWED in differentials: found ' +
        probabilityOffenses.join('; ') +
        '. Differentials must use "cannotMiss" (boolean) and "timeToHarm" ' +
        '("minutos" | "horas" | "dias") only — never a percentage, score, or ' +
        'likelihood statement in any field.',
    );
  }

  // UX-07 — bug relatado ao vivo pelo médico piloto: o modelo pedia "quais
  // são os valores de PA, FC, FR, SpO2..." mas marcava a pergunta como
  // "boolean", oferecendo só Sim/Não/Não sei — o médico não tem como
  // responder um pedido de valores com uma dessas três opções. Como a
  // informação nunca chega, o turno seguinte pede a mesma coisa de novo:
  // é isto que o médico percebeu como "loop". Ver ANSWER TYPE MATCHING
  // RULE em prompt-builder.ts para a instrução que evita isto na origem;
  // esta é a barreira em runtime para quando a instrução não for seguida.
  const answerTypeOffenses = findAnswerTypeMismatches(output.clarifyingQuestions);
  if (answerTypeOffenses.length > 0) {
    errors.push(
      'ANSWER TYPE MISMATCH in clarifyingQuestions: ' +
        answerTypeOffenses.join('; ') +
        '. A question whose text asks "quais/qual/quando/quantos/quem/onde" ' +
        'requests a VALUE, not a yes/no fact — it cannot have ' +
        '"expectedAnswerType": "boolean" (the physician cannot answer ' +
        '"Sim/Não/Não sei" to a request for numbers or a list). Use "text" ' +
        '(or "number" for a single isolated value) instead.',
    );
  }

  return {
    valid: errors.length === 0,
    output,
    errors,
    unfoundedRecommendations,
  };
}

function allRecommendationsUnfounded(output: CopilotOutput, validChunkIds: string[]): boolean {
  if (validChunkIds.length === 0) return false;
  return output.recommendations.every((rec) => !new Set(validChunkIds).has(rec.citationChunkId));
}

// PI-03 — percentuais ("70%"), termos de probabilidade em pt/en, e razões
// de verossimilhança ("likelihood ratio", "LR+"). Deliberadamente não
// bloqueia números soltos (ex: "score de Wells") — só linguagem que
// expressa CHANCE/PROBABILIDADE de um diagnóstico específico.
const PROBABILITY_LANGUAGE_PATTERN =
  /\d+(\.\d+)?\s?%|\bprobabilidade\b|\bprobability\b|\blikelihood\b|\bchance\s+de\b|\bodds\b/i;

// UX-07 — pronomes/advérbios interrogativos que, em português, SEMPRE pedem
// um valor ou lista ("quais são os valores de PA...", "quando foi a última
// dose?", "quantos episódios?") — nenhum deles forma uma pergunta de
// sim/não genuína. Se aparecem em uma pergunta marcada "boolean", é sinal
// confiável de que o tipo de resposta está errado, não de falso positivo:
// nenhum fixture legítimo de pergunta boolean deste projeto contém essas
// palavras (ver output-validator.spec.ts).
const OPEN_VALUE_REQUEST_PATTERN = /\b(qual|quais|quando|quantos?|quantas?|quem|onde)\b/i;

function findAnswerTypeMismatches(
  clarifyingQuestions: CopilotOutput['clarifyingQuestions'],
): string[] {
  const offenses: string[] = [];
  clarifyingQuestions.forEach((q, index) => {
    if (q.expectedAnswerType === 'boolean' && OPEN_VALUE_REQUEST_PATTERN.test(q.question)) {
      offenses.push(`clarifyingQuestions[${index}] ("${q.question}")`);
    }
  });
  return offenses;
}

interface SubtypeOffense {
  cenario: string;
  subtypes: string[];
  citedSubtype: string;
  /** Subtipos alternativos que o output não nomeou em lugar nenhum. */
  missingSubtypes: string[];
}

/** cenario -> subtipo -> ids dos chunks daquele subtipo. */
type SubtypeGroups = Map<string, Map<string, Set<string>>>;

/**
 * Comparação textual tolerante: sem acento, sem caixa e com `_`/`-` virando
 * espaço — a metadata usa `alergia_simples`, o modelo escreve "alergia
 * simples"; a metadata usa `isquemico`, o modelo escreve "Isquêmico".
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeSubtype(subtype: string): string {
  return subtype.replace(/[_-]+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Palavra inteira, não substring: "NSTEMI" não pode contar como ter nomeado
 * "STEMI".
 */
function namesSubtype(normalizedText: string, subtype: string): boolean {
  return new RegExp(`\\b${escapeRegExp(normalize(subtype))}\\b`).test(normalizedText);
}

/**
 * S21-CLIN-01 / F0-C — agrupa por `cenario` os chunks recuperados que têm
 * `subtipo` e devolve só os cenários em que a evidência cobre ≥2 subtipos
 * distintos (ex.: "isquemico" e "hemorragico" em `avc_agudo` — ver a metadata
 * seedada em prisma/seeds/guidelines-seed.ts).
 *
 * Deliberadamente genérico: não depende de nenhuma string de domínio clínico
 * — vale para qualquer par `cenario`/`subtipo` de futuras curadorias com o
 * mesmo formato de metadata.
 */
function ambiguousSubtypeGroups(retrievedChunks: ChunkForCoherenceCheck[]): SubtypeGroups {
  const byCenario: SubtypeGroups = new Map();
  for (const chunk of retrievedChunks) {
    const cenario = chunk.metadata?.['cenario'];
    const subtipo = chunk.metadata?.['subtipo'];
    if (typeof cenario !== 'string' || typeof subtipo !== 'string' || !cenario || !subtipo)
      continue;

    const subtypeMap = byCenario.get(cenario) ?? new Map<string, Set<string>>();
    const chunkIds = subtypeMap.get(subtipo) ?? new Set<string>();
    chunkIds.add(chunk.id);
    subtypeMap.set(subtipo, chunkIds);
    byCenario.set(cenario, subtypeMap);
  }

  for (const [cenario, subtypeMap] of byCenario) {
    if (subtypeMap.size < 2) byCenario.delete(cenario);
  }
  return byCenario;
}

/**
 * F0-C — ids dos chunks específicos de um subtipo, nos cenários em que a
 * evidência recuperada cobre ≥2 subtipos. O orquestrador marca como
 * preliminar (`subtype_ambiguity`) toda recomendação que cita um deles — ver
 * orchestrator/preliminary-containment.ts.
 */
export function ambiguousSubtypeChunkIds(retrievedChunks: ChunkForCoherenceCheck[]): Set<string> {
  const ids = new Set<string>();
  for (const subtypeMap of ambiguousSubtypeGroups(retrievedChunks).values()) {
    for (const chunkIds of subtypeMap.values()) {
      for (const id of chunkIds) ids.add(id);
    }
  }
  return ids;
}

/**
 * S21-CLIN-01 — quando a evidência recuperada cobre ≥2 subtipos do mesmo
 * cenário e uma recomendação cita um deles, exige que o output NOMEIE cada
 * subtipo alternativo — num diferencial (`hypothesis`, `whyConsider`,
 * `whatDistinguishes`) ou no `reasoning`.
 *
 * F0-C — antes, qualquer diferencial satisfazia a regra: um diferencial de
 * "TEP" liberava a citação silenciosa de AVC hemorrágico. Agora o subtipo
 * alternativo precisa aparecer pelo nome. Continua sendo checagem estrutural:
 * não verifica SE a justificativa é clinicamente correta — isso é trabalho do
 * médico revisando o output —, só barra a ambiguidade citada em silêncio.
 */
function findUnresolvedSubtypeAmbiguity(
  output: CopilotOutput,
  retrievedChunks: ChunkForCoherenceCheck[],
): SubtypeOffense | null {
  if (retrievedChunks.length === 0 || output.recommendations.length === 0) return null;

  const namedText = normalize(
    [
      output.reasoning,
      ...output.differentials.flatMap((differential) => [
        differential.hypothesis,
        differential.whyConsider,
        differential.whatDistinguishes,
      ]),
    ].join('\n'),
  );

  for (const [cenario, subtypeMap] of ambiguousSubtypeGroups(retrievedChunks)) {
    const citedSubtype = output.recommendations
      .map((rec) => {
        for (const [subtipo, chunkIds] of subtypeMap) {
          if (chunkIds.has(rec.citationChunkId)) return subtipo;
        }
        return null;
      })
      .find((subtipo): subtipo is string => subtipo !== null);

    if (!citedSubtype) continue; // recomendações citaram chunks fora deste grupo ambíguo

    const missingSubtypes = [...subtypeMap.keys()].filter(
      (subtipo) => subtipo !== citedSubtype && !namesSubtype(namedText, subtipo),
    );

    if (missingSubtypes.length > 0) {
      return { cenario, subtypes: [...subtypeMap.keys()], citedSubtype, missingSubtypes };
    }
  }

  return null;
}

function findProbabilityLanguageInDifferentials(
  differentials: CopilotOutput['differentials'],
): string[] {
  const offenses: string[] = [];
  differentials.forEach((diff, index) => {
    const fields: Array<[string, string | undefined]> = [
      ['hypothesis', diff.hypothesis],
      ['whyConsider', diff.whyConsider],
      ['whatDistinguishes', diff.whatDistinguishes],
    ];
    for (const [fieldName, value] of fields) {
      if (value && PROBABILITY_LANGUAGE_PATTERN.test(value)) {
        offenses.push(`differentials[${index}].${fieldName}`);
      }
    }
  });
  return offenses;
}
