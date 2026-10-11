import { z } from 'zod';
import { PS_SYNDROMES } from '../../src/shared/contracts/clinical';

/**
 * F0-A — Gabarito clínico: formato de um caso.
 *
 * Cada caso é um arquivo JSON em `evals/clinical/cases/`, editado por médicos.
 * O schema é estrito (`.strict()`) de propósito: um campo com nome digitado
 * errado ("cannotmiss") seria ignorado em silêncio por um schema permissivo, e
 * o caso passaria a medir menos do que o revisor acredita.
 *
 * Gabarito v1 acrescentou, todos opcionais: `sources`, `provenance`, `probes`
 * e `excludeFromGate`.
 *
 * Gabarito v2 ("plantão simulado", 11/10/2026) mudou o que se mede, a partir
 * do experimento só-Anthropic: os 7 "erros críticos" do Opus eram do formato
 * (estação do Revalida entregue só com a frase de abertura; item tudo ou nada;
 * item de prova prática), não do raciocínio. Agora:
 * - `input.caseText` é o caso COMPLETO, como o médico escreve depois de colher
 *   a história e examinar; `input.funnel` (opcional) traz a abertura e o
 *   roteiro oficial do paciente simulado, para medir se as perguntas chegam
 *   ao dado decisivo;
 * - cada expectativa é um item com nível (`critical` decide o portão,
 *   `important` dá nota) e nota própria — não há mais "todas ou nenhuma";
 * - a conduta diz se precisa estar na camada "agora" (`timing`);
 * - o que o gabarito oficial cobra e não é papel do Copiloto (apresentar-se,
 *   orientar a família) fica em `outOfScope`, fora da nota;
 * - o "caminho esperado" saiu: a decisão em duas camadas sempre traz conduta
 *   e perguntas juntas, e o critério media o formato antigo.
 */

export const CASE_SCHEMA_VERSION = 2;

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const kebabId = z
  .string()
  .regex(KEBAB_CASE, 'use kebab-case: letras minúsculas, números e hífens (ex.: "fi-001-dengue")');

/**
 * Agrupamento por SÍNDROME DE PRONTO-SOCORRO — como o paciente se apresenta,
 * não o diagnóstico final. `tags[0]` precisa ser um destes: é o estrato usado
 * no relatório para mostrar onde o Copiloto erra ("acerta dor torácica, erra
 * déficit focal").
 *
 * F1 — a lista vive no contrato compartilhado (`PS_SYNDROMES`), a mesma que o
 * entendimento do caso usa. `outro` fica fora do gabarito: um caso de
 * avaliação sempre tem estrato definido.
 */
const SyndromeGroupSchema = z.enum(PS_SYNDROMES).exclude(['outro']);

export const SYNDROME_GROUPS = SyndromeGroupSchema.options;

export type SyndromeGroup = z.infer<typeof SyndromeGroupSchema>;

export const GOLD_SOURCES = [
  /** Caso real reportado por médico do piloto (ver tests/fixtures/field-incident-cases.ts). */
  'field_incident',
  /** Os 40 casos sintéticos do pacote KB-001 (tests/fixtures/kb-001-synthetic-cases.ts). */
  'kb001_synthetic',
  /** Derivado dos pares de dicotomia do pacote KB-004. */
  'kb004_dichotomy',
  /** Caso usado na calibração do piso de relevância. */
  'calibration',
  /** Caso escrito por médico. */
  'physician',
  /** Rascunho escrito por IA, aguardando revisão médica. */
  'ai_draft',
  /** Questão discursiva do Revalida (Inep), com o padrão de resposta oficial. */
  'revalida_discursiva',
  /** Estação de habilidades clínicas do Revalida (PEP), com o checklist oficial. */
  'revalida_pep',
  /** Expectativas ancoradas em diretriz citada em `sources`, sem caso real de origem. */
  'guideline_anchored',
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ReviewerSchema = z
  .object({
    name: z.string().trim().min(3),
    crm: z
      .string()
      .trim()
      .regex(/^\d{3,7}[-/ ]?[A-Z]{2}$/, 'CRM no formato "123456-SP"'),
  })
  .strict();

export const REVIEW_STATUSES = [
  /** Ainda não revisado por médico. */
  'draft',
  /** Revisado por médico da equipe — exige `reviewer` e `date`. */
  'physician_reviewed',
  /**
   * Expectativas tiradas do gabarito oficial de uma prova (ex.: Revalida) —
   * nem médico da equipe nem IA. A prova vai em `provenance`.
   */
  'official_exam_key',
] as const;

const ReviewSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES),
    reviewer: ReviewerSchema.optional(),
    date: z.string().regex(ISO_DATE, 'data no formato AAAA-MM-DD').optional(),
    /** Observações do revisor — por que mudou, o que ficou em dúvida. */
    notes: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((review) => review.status !== 'physician_reviewed' || (review.reviewer && review.date), {
    message: 'caso revisado precisa de reviewer (nome e CRM) e date',
  });

/** Mesmas quatro chaves do `context` de POST /copilot/analyze. */
const EncounterContextSchema = z
  .object({
    hasCT: z.boolean(),
    isSus: z.boolean(),
    hasLab: z.boolean(),
    hasICU: z.boolean(),
  })
  .strict();

const nonEmptyText = z.string().trim().min(3);

export const SCRIPT_FACT_KINDS = [
  /** Dito pelo paciente ou acompanhante quando perguntado. */
  'history',
  /** Achado do exame físico, dado quando o médico examina. */
  'exam',
  /** Resultado de exame complementar, dado quando pedido. */
  'test',
] as const;

/**
 * Um fato do roteiro oficial do paciente simulado (ou de um impresso da
 * estação). O médico simulado só o revela quando a pergunta do Copiloto o
 * alcança. `key`: sem este fato, o diagnóstico principal não se sustenta —
 * é o que mede se as perguntas chegam ao dado decisivo.
 */
const ScriptFactSchema = z
  .object({
    id: kebabId,
    kind: z.enum(SCRIPT_FACT_KINDS),
    text: nonEmptyText,
    key: z.boolean().optional(),
  })
  .strict();

export type ScriptFact = z.infer<typeof ScriptFactSchema>;

/**
 * Modo afunilamento: o Copiloto começa só com a abertura (o que o médico sabe
 * na porta) e um médico simulado responde às perguntas dele usando apenas o
 * roteiro. Mede se as perguntas chegam ao dado decisivo e se a conduta
 * "agora" é segura enquanto isso.
 */
const FunnelSchema = z
  .object({
    opening: z.string().trim().min(10).max(1000),
    script: z.array(ScriptFactSchema).min(1),
  })
  .strict()
  .refine((funnel) => new Set(funnel.script.map((fact) => fact.id)).size === funnel.script.length, {
    message: 'ids repetidos em funnel.script',
    path: ['script'],
  });

export type Funnel = z.infer<typeof FunnelSchema>;

const CaseInputSchema = z
  .object({
    /**
     * O caso como o médico escreve no plantão DEPOIS de colher a história e
     * examinar — telegráfico, com abreviações, com os achados e resultados que
     * ele já tem. Traz achados, nunca a conclusão esperada (diagnóstico,
     * classificação de gravidade, conduta).
     */
    caseText: z.string().trim().min(10).max(4000),
    context: EncounterContextSchema.optional(),
    /** Chips de red flag confirmados pelo médico (S20-CLIN-01). */
    redFlags: z.record(z.string(), z.boolean()).optional(),
    funnel: FunnelSchema.optional(),
  })
  .strict();

function isValidRegexSource(source: string): boolean {
  try {
    new RegExp(source, 'iu');
    return true;
  } catch {
    return false;
  }
}

const RegexSourceSchema = z
  .string()
  .min(2)
  .refine(isValidRegexSource, { message: 'expressão regular inválida' });

/**
 * Conduta que NÃO pode sair como recomendação definitiva neste caso — se sair,
 * é erro crítico. `patterns` (regex sobre palavras inteiras, sem acento e sem
 * caixa; no JSON, radical se escreve `"trombol\\w*"`) é a checagem determinística; lista
 * vazia deixa a checagem só para o juiz. `exceptWhen` anula a ocorrência só
 * quando começa PERTO do termo, na mesma oração (ex.: "trombólise somente após
 * TC sem sangramento"). A negação que governa o termo ("não fazer trombólise",
 * "AAS contraindicado") já é reconhecida sem `exceptWhen`. Regra completa em
 * `graders/forbidden-actions.ts`.
 */
const ForbiddenActionSchema = z
  .object({
    id: kebabId,
    description: z.string().trim().min(10),
    patterns: z.array(RegexSourceSchema),
    exceptWhen: z.array(RegexSourceSchema).optional(),
  })
  .strict();

export type ForbiddenAction = z.infer<typeof ForbiddenActionSchema>;

/** Fonte que sustenta uma expectativa do caso (diretriz, protocolo do MS, gabarito oficial). */
const SourceSchema = z
  .object({
    /** O que a fonte sustenta no gabarito. */
    claim: nonEmptyText,
    title: nonEmptyText,
    publisher: nonEmptyText,
    year: z.number().int().min(1900).max(2100).nullable(),
    url: z.string().trim().url(),
  })
  .strict();

/** De onde o caso veio e o que mudou nele. */
const ProvenanceSchema = z
  .object({
    /** Prova de origem (ex.: "Revalida"). */
    exam: nonEmptyText.optional(),
    /** Edição da prova (ex.: "2024/2"). */
    edition: nonEmptyText.optional(),
    /** Questão ou estação (ex.: "discursiva 3"). */
    item: nonEmptyText.optional(),
    url: z.string().trim().url().optional(),
    /** Texto do caso antes de reescrito — preservado para rastrear a mudança. */
    originalCaseText: nonEmptyText.optional(),
    /** O que mudou no caso e por quê. */
    notes: nonEmptyText.optional(),
  })
  .strict();

/**
 * Caso que roda e recebe nota, mas fica fora do portão de release: o erro
 * crítico dele aparece no relatório sem reprovar a mudança. Para gabarito
 * oficial desatualizado ou discutível — nunca para esconder erro do modelo.
 */
const GateExclusionSchema = z
  .object({
    /** Uma linha: por que este caso não decide o portão. */
    reason: z.string().trim().min(10),
  })
  .strict();

const probeSentence = z.string().trim().min(5);

/**
 * Frases de recomendação que a checagem automática de conduta proibida DEVE
 * acusar (`mustFlag`) e NÃO PODE acusar (`mustNotFlag`) neste caso. Um teste
 * roda todas: é assim que um `patterns`/`exceptWhen` errado aparece antes de
 * uma execução real.
 */
const ProbesSchema = z
  .object({
    mustFlag: z.array(probeSentence).min(1),
    mustNotFlag: z.array(probeSentence).min(1),
  })
  .strict();

export const ITEM_TIERS = [
  /**
   * Faltar é erro crítico e reprova o portão: o diagnóstico que mata ou
   * sequela se perdido, a conduta tempo-dependente. Poucos por caso (1 a 3).
   */
  'critical',
  /** Dá nota, por item; faltar não reprova sozinho. */
  'important',
] as const;

export type ItemTier = (typeof ITEM_TIERS)[number];

const ExpectedItemSchema = z
  .object({
    text: nonEmptyText,
    tier: z.enum(ITEM_TIERS),
  })
  .strict();

export type ExpectedItem = z.infer<typeof ExpectedItemSchema>;

export const ACTION_TIMINGS = [
  /**
   * Precisa estar na camada "agora" (ou ser definitiva): já há indicação no
   * caso e esperar causa dano — ex.: complexo protrombínico na hemorragia com
   * varfarina, sem esperar o INR. Condicionada a um dado, conta como ausente.
   */
  'now',
  /** Vale estar em "agora" ou condicionada a um dado ("depende de…"). */
  'any',
] as const;

export type ActionTiming = (typeof ACTION_TIMINGS)[number];

const ExpectedActionSchema = ExpectedItemSchema.extend({
  timing: z.enum(ACTION_TIMINGS),
}).strict();

export type ExpectedAction = z.infer<typeof ExpectedActionSchema>;

const CaseExpectationsSchema = z
  .object({
    /** Síndrome de PS em que o caso deve ser enquadrado. */
    syndrome: nonEmptyText,
    /** Hipóteses que precisam aparecer (diferencial, raciocínio, red flag ou conduta). */
    diagnoses: z.array(ExpectedItemSchema),
    /** Condutas que precisam aparecer, com o nível e a camada exigida. */
    actions: z.array(ExpectedActionSchema),
    /**
     * Dados AUSENTES do `caseText` que mudam a conduta e precisam ser pedidos
     * (pergunta ou exame recomendado). No modo afunilamento, o roteiro mede o
     * resto.
     */
    questions: z.array(nonEmptyText),
    /** Sempre crítica: sair como conduta para agora reprova o portão. */
    forbiddenDefinitiveActions: z.array(ForbiddenActionSchema),
    /**
     * Itens do gabarito oficial que não são papel do Copiloto (apresentar-se,
     * explicar o diagnóstico à família, orientar prevenção). Ficam para
     * rastrear a conversão; não entram na nota.
     */
    outOfScope: z.array(nonEmptyText).optional(),
    /** Por que o gabarito é este — fonte, protocolo do MS, raciocínio. */
    rationale: z.string().trim().min(10).optional(),
  })
  .strict();

export const ClinicalCaseSchema = z
  .object({
    schemaVersion: z.literal(CASE_SCHEMA_VERSION),
    id: kebabId,
    title: z.string().trim().min(5),
    /** `tags[0]` é a síndrome de PS (SYNDROME_GROUPS); as demais são livres. */
    tags: z.tuple([SyndromeGroupSchema]).rest(kebabId),
    /** "Não pode errar": cenário tempo-dependente em que errar mata ou sequela. */
    critical: z.boolean(),
    goldSource: z.enum(GOLD_SOURCES),
    review: ReviewSchema,
    input: CaseInputSchema,
    expected: CaseExpectationsSchema,
    /** O que sustenta as expectativas. */
    sources: z.array(SourceSchema).optional(),
    provenance: ProvenanceSchema.optional(),
    probes: ProbesSchema.optional(),
    excludeFromGate: GateExclusionSchema.optional(),
  })
  .strict()
  .refine(
    (clinicalCase) =>
      !clinicalCase.critical ||
      clinicalCase.expected.diagnoses.some((diagnosis) => diagnosis.tier === 'critical'),
    {
      message: 'caso crítico precisa de ao menos um diagnóstico de nível critical',
      path: ['expected', 'diagnoses'],
    },
  )
  .refine(
    (clinicalCase) =>
      new Set(clinicalCase.expected.forbiddenDefinitiveActions.map((action) => action.id)).size ===
      clinicalCase.expected.forbiddenDefinitiveActions.length,
    {
      message: 'ids repetidos em expected.forbiddenDefinitiveActions',
      path: ['expected', 'forbiddenDefinitiveActions'],
    },
  )
  .refine(
    (clinicalCase) =>
      clinicalCase.review.status !== 'official_exam_key' ||
      Boolean(
        clinicalCase.provenance?.exam &&
        clinicalCase.provenance.url &&
        clinicalCase.provenance.originalCaseText,
      ),
    {
      message:
        'gabarito oficial de prova precisa de provenance.exam, provenance.url e provenance.originalCaseText',
      path: ['provenance'],
    },
  );

export type ClinicalCase = z.infer<typeof ClinicalCaseSchema>;
export type CaseExpectations = ClinicalCase['expected'];
