import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { READING_VITAL_SIGNS } from '../../src/modules/copilot/intake/intake-reading.schema';
import { PS_SYNDROMES } from '../../src/shared/contracts/clinical';
import { ReviewerSchema } from '../clinical/case.schema';

/**
 * CC-104 — gabarito da leitura do caso: o que a leitura (`intake_reading`)
 * precisa extrair de cada caso. Um arquivo JSON por caso, com o nome igual ao
 * id, como no gabarito clínico.
 *
 * Os dados (sexo, idade, sinais vitais) são literais: valem o que o texto diz,
 * e `null` diz que o texto não informa — a leitura também precisa deixar
 * `null` (regra 1 do prompt: nunca inferir). O julgamento (síndrome,
 * instabilidade, tempo-crítico) é opcional: ausente, o campo não é avaliado.
 */

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kebabId = z.string().regex(KEBAB_CASE, 'use kebab-case (ex.: "real-01-dor-toracica")');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Um valor, ou os valores aceitos quando o texto traz mais de uma medida (PA nos dois braços). */
const ExpectedNumberSchema = z.union([z.number(), z.array(z.number()).min(2), z.null()]);
export type ExpectedNumber = z.infer<typeof ExpectedNumberSchema>;

export type VitalKey = (typeof READING_VITAL_SIGNS)[number];

/** Os sete sinais vitais do entendimento, todos obrigatórios: esquecer um não pode virar "não avaliado". */
const ExpectedVitalsSchema = z
  .object(
    Object.fromEntries(READING_VITAL_SIGNS.map((sign) => [sign, ExpectedNumberSchema])) as Record<
      VitalKey,
      typeof ExpectedNumberSchema
    >,
  )
  .strict();

const ExpectedSchema = z
  .object({
    sex: z.enum(['F', 'M']).nullable(),
    /** Em anos, como o texto diz ("78a"). */
    age: ExpectedNumberSchema,
    vitals: ExpectedVitalsSchema,
    /** Síndromes aceitas (a primeira é a do estrato); ausente = não avaliada. */
    syndrome: z.array(z.enum(PS_SYNDROMES)).min(1).optional(),
    instability: z.boolean().optional(),
    timeCritical: z.boolean().optional(),
  })
  .strict();

export type IntakeExpected = z.infer<typeof ExpectedSchema>;

export const INTAKE_SOURCE_KINDS = ['clinical_case', 'real_anonymized'] as const;

const SourceSchema = z.discriminatedUnion('kind', [
  /** Mesmo texto de um caso do gabarito clínico (evals/clinical/cases), com o mesmo id. */
  z.object({ kind: z.literal('clinical_case'), caseId: kebabId }).strict(),
  /** Caso real anonimizado. Fica em cases-local/, fora do git. */
  z
    .object({ kind: z.literal('real_anonymized'), note: z.string().trim().min(1).optional() })
    .strict(),
]);

const ReviewSchema = z
  .object({
    status: z.enum(['draft', 'physician_reviewed']),
    reviewer: ReviewerSchema.optional(),
    date: z.string().regex(ISO_DATE, 'data no formato AAAA-MM-DD').optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((review) => review.status !== 'physician_reviewed' || (review.reviewer && review.date), {
    message: 'caso revisado precisa de reviewer (nome e CRM) e date',
  });

export const IntakeCaseSchema = z
  .object({
    id: kebabId,
    source: SourceSchema,
    review: ReviewSchema,
    input: z
      .object({
        caseText: z.string().trim().min(10).max(4000),
        /** Chips de red flag que o médico marcou, como no POST do caso. */
        redFlags: z.record(z.string(), z.boolean()).optional(),
      })
      .strict(),
    expected: ExpectedSchema,
  })
  .strict();

export type IntakeCase = z.infer<typeof IntakeCaseSchema>;

export const SEED_CASES_DIR = join(__dirname, 'cases');
/** Os casos reais anonimizados: fora do git (.gitignore), mesmo anonimizados. */
export const LOCAL_CASES_DIR = join(__dirname, 'cases-local');

export const INTAKE_CASE_SETS = { seed: SEED_CASES_DIR, local: LOCAL_CASES_DIR } as const;
export type IntakeCaseSetName = keyof typeof INTAKE_CASE_SETS;

export interface IntakeCaseSet {
  cases: IntakeCase[];
  /** Hash do conteúdo dos arquivos: duas rodadas só se comparam sobre o mesmo gabarito. */
  version: string;
}

export class IntakeCaseError extends Error {}

function parseCaseFile(filePath: string): IntakeCase {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new IntakeCaseError(`${basename(filePath)}: JSON inválido — ${reason}`);
  }
  const parsed = IntakeCaseSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new IntakeCaseError(`${basename(filePath)}: não segue o formato do caso\n${issues}`);
  }
  if (basename(filePath) !== `${parsed.data.id}.json`) {
    throw new IntakeCaseError(
      `${basename(filePath)}: o arquivo deve se chamar ${parsed.data.id}.json (igual ao id)`,
    );
  }
  return parsed.data;
}

export function loadIntakeCaseSet(dir: string): IntakeCaseSet {
  if (!existsSync(dir)) {
    throw new IntakeCaseError(
      `${dir} não existe. Os casos reais anonimizados ficam nessa pasta (fora do git); ` +
        'ver docs/evals/leitura-do-caso.md.',
    );
  }
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  const hash = createHash('sha256');
  const cases: IntakeCase[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const filePath = join(dir, file);
    hash.update(file).update(readFileSync(filePath));
    const intakeCase = parseCaseFile(filePath);
    if (seen.has(intakeCase.id)) throw new IntakeCaseError(`id repetido: ${intakeCase.id}`);
    seen.add(intakeCase.id);
    cases.push(intakeCase);
  }
  if (cases.length === 0) throw new IntakeCaseError(`${dir} não tem nenhum caso (.json)`);
  return { cases, version: hash.digest('hex').slice(0, 12) };
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

/** `--cases`: ids ou globs no id (`kb004-*`), separados por vírgula; o resultado é a união. */
export function selectIntakeCases(
  cases: IntakeCase[],
  selectorList: string | undefined,
): IntakeCase[] {
  if (!selectorList) return cases;
  const patterns = selectorList
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map(globToRegExp);
  const selected = cases.filter((intakeCase) =>
    patterns.some((pattern) => pattern.test(intakeCase.id)),
  );
  if (selected.length === 0) {
    throw new IntakeCaseError(`--cases "${selectorList}" não selecionou nenhum caso`);
  }
  return selected;
}
