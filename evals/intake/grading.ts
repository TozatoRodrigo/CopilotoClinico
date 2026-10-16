import { z } from 'zod';
import {
  READING_VITAL_SIGNS,
  type IntakeReading,
} from '../../src/modules/copilot/intake/intake-reading.schema';
import { PS_SYNDROMES } from '../../src/shared/contracts/clinical';
import type { ExpectedNumber, IntakeExpected, VitalKey } from './case.schema';

/**
 * CC-104 — o que a leitura extraiu e o que o gabarito pede, campo a campo.
 * Guarda-se só o que é comparado (e as perguntas, para ler a qualidade): a
 * nota se refaz a partir dos arquivos da rodada quando o gabarito muda.
 */
export const ExtractedFieldsSchema = z.object({
  sex: z.enum(['F', 'M']).nullable(),
  age: z.number().nullable(),
  vitals: z.object(
    Object.fromEntries(READING_VITAL_SIGNS.map((sign) => [sign, z.number().nullable()])) as Record<
      VitalKey,
      z.ZodNullable<z.ZodNumber>
    >,
  ),
  syndrome: z.enum(PS_SYNDROMES),
  instability: z.boolean(),
  timeCritical: z.boolean(),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

export function extractFields(reading: IntakeReading): ExtractedFields {
  const { age, sex, vitals } = reading.structuredData;
  return {
    sex,
    age,
    vitals: { ...vitals },
    syndrome: reading.syndrome,
    instability: reading.instability.present,
    timeCritical: reading.timeCritical,
  };
}

/** Dados: o texto diz e a leitura copia. Julgamento: a leitura interpreta. */
export const DATA_FIELDS = ['sex', 'age', ...READING_VITAL_SIGNS] as const;
export const JUDGMENT_FIELDS = ['syndrome', 'instability', 'timeCritical'] as const;
export type DataField = (typeof DATA_FIELDS)[number];
export type JudgmentField = (typeof JUDGMENT_FIELDS)[number];
export type GradedField = DataField | JudgmentField;

/**
 * `wrong`: valor diferente; `missing`: o texto informa e a leitura deixou
 * `null`; `invented`: o texto não informa e a leitura pôs um valor (a regra 1
 * do prompt proíbe inferir); `disagree`: julgamento diferente do gabarito.
 */
export type CheckKind = 'ok' | 'wrong' | 'missing' | 'invented' | 'disagree';

export interface FieldCheck {
  field: GradedField;
  kind: CheckKind;
  expected: string;
  got: string;
}

/** Sinais vitais e idade vêm com no máximo uma casa decimal ("T 39,4"). */
const NUMBER_TOLERANCE = 0.05;

function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

function formatExpectedNumber(expected: ExpectedNumber): string {
  if (expected === null) return '—';
  return Array.isArray(expected) ? expected.map(formatNumber).join(' ou ') : formatNumber(expected);
}

function checkNumber(field: DataField, expected: ExpectedNumber, got: number | null): FieldCheck {
  const shown = {
    field,
    expected: formatExpectedNumber(expected),
    got: got === null ? '—' : formatNumber(got),
  };
  if (expected === null) return { ...shown, kind: got === null ? 'ok' : 'invented' };
  if (got === null) return { ...shown, kind: 'missing' };
  const accepted = Array.isArray(expected) ? expected : [expected];
  const matches = accepted.some((value) => Math.abs(value - got) <= NUMBER_TOLERANCE);
  return { ...shown, kind: matches ? 'ok' : 'wrong' };
}

function checkSex(expected: IntakeExpected['sex'], got: ExtractedFields['sex']): FieldCheck {
  const shown = { field: 'sex' as const, expected: expected ?? '—', got: got ?? '—' };
  if (expected === got) return { ...shown, kind: 'ok' };
  if (expected === null) return { ...shown, kind: 'invented' };
  return { ...shown, kind: got === null ? 'missing' : 'wrong' };
}

function checkJudgment(field: JudgmentField, accepted: readonly string[], got: string): FieldCheck {
  return {
    field,
    expected: accepted.join(' ou '),
    got,
    kind: accepted.includes(got) ? 'ok' : 'disagree',
  };
}

function yesNo(value: boolean): string {
  return value ? 'sim' : 'não';
}

/** Um `FieldCheck` por campo avaliado; julgamento sem gabarito fica de fora. */
export function gradeFields(fields: ExtractedFields, expected: IntakeExpected): FieldCheck[] {
  const checks: FieldCheck[] = [
    checkSex(expected.sex, fields.sex),
    checkNumber('age', expected.age, fields.age),
    ...READING_VITAL_SIGNS.map((sign) =>
      checkNumber(sign, expected.vitals[sign], fields.vitals[sign]),
    ),
  ];
  if (expected.syndrome) {
    checks.push(checkJudgment('syndrome', expected.syndrome, fields.syndrome));
  }
  if (expected.instability !== undefined) {
    checks.push(
      checkJudgment('instability', [yesNo(expected.instability)], yesNo(fields.instability)),
    );
  }
  if (expected.timeCritical !== undefined) {
    checks.push(
      checkJudgment('timeCritical', [yesNo(expected.timeCritical)], yesNo(fields.timeCritical)),
    );
  }
  return checks;
}

export const FIELD_LABELS: Record<GradedField, string> = {
  sex: 'sexo',
  age: 'idade',
  systolicBp: 'PA sistólica',
  diastolicBp: 'PA diastólica',
  heartRate: 'FC',
  respiratoryRate: 'FR',
  spo2: 'SpO2',
  temperature: 'temperatura',
  glucose: 'glicemia',
  syndrome: 'síndrome',
  instability: 'instabilidade',
  timeCritical: 'tempo-crítico',
};

export const CHECK_KIND_LABELS: Record<Exclude<CheckKind, 'ok'>, string> = {
  wrong: 'errado',
  missing: 'omitido',
  invented: 'inventado',
  disagree: 'diverge',
};
