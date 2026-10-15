import type { DocumentType, Prisma } from '@prisma/client';
import { AI_USE_RECORD_FIELD } from '../../shared/contracts/clinical';

/**
 * F0-D — registro de uso de IA no prontuário.
 *
 * A Resolução CFM 2.454/2026 (em vigor desde 26/08/2026) exige registrar no
 * prontuário o uso de inteligência artificial no atendimento. Os documentos
 * gerados com o copiloto não diziam nada sobre isso.
 *
 * TEXTO PROVISÓRIO, AGUARDANDO REVISÃO JURÍDICA. É a única fonte deste texto:
 * mudar aqui muda os documentos gerados daqui em diante; os já gerados
 * mantêm o texto da época (ele faz parte do conteúdo selado pelo hash).
 */
export const AI_USE_RECORD_TEXT =
  'Registro de uso de IA (Res. CFM 2.454/2026): documento elaborado com apoio do ' +
  'Copiloto Clínico (ferramenta de inteligência artificial), revisado e confirmado ' +
  'pelo médico responsável.';

/**
 * Documentos de registro clínico que recebem o registro. Prescrição e
 * atestado ficam de fora até a decisão jurídica: são entregues ao paciente ou
 * a terceiros, e a forma de declarar IA neles ainda não foi definida.
 */
const DOCUMENT_TYPES_WITH_AI_USE_RECORD: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'soap',
  'sbar',
  'alta',
]);

export function withAiUseRecord(
  type: DocumentType,
  content: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  if (!DOCUMENT_TYPES_WITH_AI_USE_RECORD.has(type)) return content;
  return { ...content, [AI_USE_RECORD_FIELD]: AI_USE_RECORD_TEXT };
}

/** O registro gravado no conteúdo do documento, se houver. */
export function aiUseRecordOf(content: Prisma.JsonValue | Record<string, unknown>): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const record: unknown = content[AI_USE_RECORD_FIELD];
  return typeof record === 'string' && record.trim() ? record : null;
}
