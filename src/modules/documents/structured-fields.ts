import type { Prisma } from '@prisma/client';

type StructuredKind = 'array' | 'object' | 'boolean' | 'number';

/** Tipo JSON de um campo estruturado; null para texto (string ou null). */
function structuredKind(value: unknown): StructuredKind | null {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value !== null && typeof value === 'object') return 'object';
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * O editor só altera campos de texto e a lista como texto livre
 * (`<lista>_raw`). Os campos estruturados do conteúdo gerado — a lista de
 * medicamentos da prescrição, os diagnósticos da alta, `incerteza` — não são
 * editáveis: uma edição que os omita ou troque de tipo (ex.: o editor antigo
 * gravava `medicamentos: "[object Object]"`) recebe de volta o valor da
 * geração. Sem isso o documento selado (`physicianEdits ?? content`) e o PDF
 * saem sem a lista.
 *
 * Campos que continuam do mesmo tipo (ex.: a lista com um item a menos) e
 * campos de texto (string ou null na geração) ficam como o médico deixou.
 */
export function restoreStructuredFields(
  content: Prisma.JsonValue | undefined,
  physicianEdits: Record<string, unknown>,
): { physicianEdits: Record<string, unknown>; restoredFields: string[] } {
  if (!isRecord(content)) return { physicianEdits, restoredFields: [] };

  const restoredFields = Object.entries(content)
    .filter(([key, generated]) => {
      const kind = structuredKind(generated);
      return kind !== null && structuredKind(physicianEdits[key]) !== kind;
    })
    .map(([key]) => key);
  if (restoredFields.length === 0) return { physicianEdits, restoredFields };

  const restored = { ...physicianEdits };
  for (const key of restoredFields) restored[key] = content[key];
  return { physicianEdits: restored, restoredFields };
}
