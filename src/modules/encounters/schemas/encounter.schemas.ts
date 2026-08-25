import { z } from 'zod';
import { encounterStatusValues, encounterVerticalValues } from '../../../shared/contracts/clinical';

/**
 * Validação LGPD-001: patientRef deve ser um identificador opaco.
 *
 * O patientRef NÃO pode conter dados pessoais identificáveis como CPF ou nome
 * completo. O sistema do hospital (HIS/EMR) deve fornecer um identificador
 * pseudônimo (ex: número de prontuário, UUID, hash de CPF com salt por tenant).
 *
 * Referência: LGPD Art. 13 (pseudonimização), docs/decisions/ADR-004
 * Tarefa: https://app.clickup.com/t/90132565680/86ahx6fj7
 */

/** CPF sem formatação: exatamente 11 dígitos numéricos */
const CPF_UNFORMATTED = /^\d{11}$/;
/** CPF com formatação: 000.000.000-00 */
const CPF_FORMATTED = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

/**
 * Nome completo: duas ou mais palavras iniciadas por maiúsculas (com acentos PT-BR).
 * Captura: "Maria Silva", "João da Silva", "Ana Paula Costa"
 * NÃO captura: "PRN-2024", "PAT-001", "a1b2c3", "UUID-123" (identificadores opacos)
 *
 * Nota: identificadores com números longos (>11 dígitos) não são bloqueados
 * pelo padrão CPF mesmo que pareçam numéricos.
 */
const FULL_NAME_PATTERN =
  /\b[A-ZÁÀÂÃÉÈÊÍÏÓÕÔÚÜÇÑ][a-záàâãéèêíïóõôúüçñ]{1,}(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÀÂÃÉÈÊÍÏÓÕÔÚÜÇÑ][a-záàâãéèêíïóõôúüçñ]{1,})+\b/;

export function isValidPatientRef(value: string): boolean {
  if (CPF_UNFORMATTED.test(value)) return false;
  if (CPF_FORMATTED.test(value)) return false;
  if (FULL_NAME_PATTERN.test(value)) return false;
  return true;
}

export const PATIENT_REF_VALIDATION_ERROR =
  'patientRef não pode conter CPF ou nome completo — use um identificador opaco ' +
  '(ex: número de prontuário, UUID, hash do sistema do hospital)';

const patientRefSchema = z
  .string()
  .min(1, 'patientRef é obrigatório')
  .max(50, 'patientRef deve ter no máximo 50 caracteres')
  .refine(isValidPatientRef, { message: PATIENT_REF_VALIDATION_ERROR });

// S25-QC-01 — identificação do paciente é opcional na criação: sem ela, o
// caso é uma "consulta rápida" (fora da fila do Plantão até ser
// identificado — ver EncountersService.findByPhysician e update()). Quando
// PREENCHIDO, continua validado pelas mesmas regras de LGPD-001 (nunca CPF
// ou nome completo) — a opcionalidade não relaxa essa validação.
export const createEncounterSchema = z.object({
  patientRef: patientRefSchema.optional(),
  vertical: z.string().min(1).default('trauma'),
  institutionId: z.string().uuid().optional(),
  context: z
    .object({
      hasCT: z.boolean().default(false),
      isSus: z.boolean().default(false),
      hasLab: z.boolean().default(false),
      hasICU: z.boolean().default(false),
    })
    .default({}),
});

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

export const updateEncounterSchema = z.object({
  status: z.enum(encounterStatusValues).optional(),
  // S25-QC-01 — permite identificar o paciente depois de uma consulta
  // rápida, "promovendo" o encontro para a fila do Plantão. Mesma validação
  // de LGPD-001 do campo na criação (nunca CPF ou nome completo).
  patientRef: patientRefSchema.optional(),
  context: z
    .object({
      hasCT: z.boolean(),
      isSus: z.boolean(),
      hasLab: z.boolean(),
      hasICU: z.boolean(),
    })
    .optional(),
  // UX-04 — vertical deixa de ser obrigatória na criação do caso (passa a
  // default silenciosamente para 'general'); o médico pode confirmar ou
  // corrigi-la depois, sem bloquear a captura. Ver encounters/new/page.tsx.
  vertical: z.enum(encounterVerticalValues).optional(),
});

export type UpdateEncounterInput = z.infer<typeof updateEncounterSchema>;

export const listEncountersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(encounterStatusValues).optional(),
  vertical: z.enum(encounterVerticalValues).optional(),
  search: z.string().max(100).optional(),
  // S25-QC-01 — por padrão, consultas rápidas (sem patientRef) ficam de
  // fora da fila do Plantão. `includeUnidentified: true` é o único jeito de
  // trazê-las de volta na listagem — uso previsto para uma futura tela de
  // "consultas recentes", não para o Plantão em si.
  includeUnidentified: z.coerce.boolean().default(false),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ListEncountersQuery = z.infer<typeof listEncountersQuerySchema>;
