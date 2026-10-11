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
 * Evolução sem quebra: campos novos entram como opcionais. O próximo previsto
 * é `input.followUps` (respostas roteirizadas às perguntas esclarecedoras,
 * para avaliar mais de um turno); os casos atuais continuam válidos sem ele.
 * Gabarito v1 acrescentou, todos opcionais: `sources`, `provenance` e `probes`.
 */

export const CASE_SCHEMA_VERSION = 1;

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

export const ExpectedPathSchema = z.enum([
  /** Ao menos uma recomendação definitiva e nenhuma pergunta bloqueadora. */
  'recommend',
  /** Ao menos uma pergunta esclarecedora. */
  'clarify',
  /** `uncertainty: true` — a base não cobre o cenário. */
  'uncertainty',
  /** Mais de um caminho é clinicamente aceitável; não pontua o caminho. */
  'any',
]);

export type ExpectedPath = z.infer<typeof ExpectedPathSchema>;

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

const CaseInputSchema = z
  .object({
    /**
     * Texto como o médico digita à beira do leito — telegráfico, com
     * abreviações. Nunca contém a resposta esperada.
     */
    caseText: z.string().trim().min(10).max(4000),
    context: EncounterContextSchema.optional(),
    /** Chips de red flag confirmados pelo médico (S20-CLIN-01). */
    redFlags: z.record(z.string(), z.boolean()).optional(),
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

const nonEmptyText = z.string().trim().min(3);

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

const CaseExpectationsSchema = z
  .object({
    /** Síndrome de PS em que o caso deve ser enquadrado. */
    syndrome: nonEmptyText,
    /** Hipóteses que precisam ser consideradas (diferencial, raciocínio ou red flag). */
    cannotMiss: z.array(nonEmptyText),
    /** Dados AUSENTES do caso que mudam a conduta e precisam ser pedidos. */
    mustRequest: z.array(nonEmptyText),
    /** Condutas que precisam aparecer (definitivas ou preliminares). */
    requiredActions: z.array(nonEmptyText),
    forbiddenDefinitiveActions: z.array(ForbiddenActionSchema),
    expectedPath: ExpectedPathSchema,
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
  })
  .strict()
  .refine((clinicalCase) => !clinicalCase.critical || clinicalCase.expected.cannotMiss.length > 0, {
    message: 'caso crítico precisa de ao menos um item em expected.cannotMiss',
    path: ['expected', 'cannotMiss'],
  })
  .refine(
    (clinicalCase) =>
      new Set(clinicalCase.expected.forbiddenDefinitiveActions.map((action) => action.id)).size ===
      clinicalCase.expected.forbiddenDefinitiveActions.length,
    {
      message: 'ids repetidos em expected.forbiddenDefinitiveActions',
      path: ['expected', 'forbiddenDefinitiveActions'],
    },
  );

export type ClinicalCase = z.infer<typeof ClinicalCaseSchema>;
export type CaseExpectations = ClinicalCase['expected'];
