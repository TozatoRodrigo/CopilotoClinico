import { z } from 'zod';
import type { WebEvidenceItem } from '../../../shared/contracts/clinical';
import type { VerificationAction } from './source-verification-prompt';

/**
 * Verificação com fonte (`COPILOT_KNOWLEDGE_SOURCE=verify`): o que o modelo
 * do vínculo devolve e a mesclagem determinística dele com a saída da
 * decisão. O modelo só SUGERE o vínculo; quem decide o que vale é o código —
 * id que não é desta análise e dose que não está no trecho não entram.
 */

export const SourceAttachResponseSchema = z.object({
  items: z.array(
    z.object({
      /** Número do rótulo `[A<n>]`. */
      action: z.number(),
      citationId: z.string().nullable(),
      dose: z.string().nullable(),
      conflict: z.string().nullable(),
    }),
  ),
});

export type SourceAttachItem = z.infer<typeof SourceAttachResponseSchema>['items'][number];

export type ParsedSourceAttach =
  | { success: true; items: SourceAttachItem[] }
  | { success: false; reason: string };

/** Modelo sem structured output às vezes embrulha o JSON em bloco de código. */
export function parseSourceAttachResponse(content: string): ParsedSourceAttach {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim(),
    );
  } catch {
    return { success: false, reason: 'o vínculo não devolveu JSON' };
  }
  const result = SourceAttachResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { success: false, reason: `o vínculo saiu do schema (${issues.join('; ')})` };
  }
  return { success: true, items: result.data.items };
}

/** Vínculo aceito entre uma conduta da decisão e um trecho de fonte oficial. */
export interface SourceLink {
  /** Id de um item da evidência desta análise (`web:N`). */
  citationId: string;
  /** Dose que aparece literalmente no trecho citado; `null` sem dose confirmada. */
  dose: string | null;
  /** Frase em pt-BR dizendo no que a fonte diverge; `null` sem divergência. */
  conflict: string | null;
}

/**
 * Caixa, acento e espaços não mudam uma dose: "0,9 MG/KG" é "0,9 mg/kg".
 * Nada além disso — trocar unidade, vírgula ou hífen já seria interpretar.
 */
export function normalizeDoseText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** A dose só vale se o trecho citado a traz, letra por letra depois da normalização. */
function literalDose(dose: string | null, citedText: string): string | null {
  const candidate = blankToNull(dose);
  if (!candidate) return null;
  return normalizeDoseText(citedText).includes(normalizeDoseText(candidate)) ? candidate : null;
}

/**
 * Mesclagem determinística, por índice da recomendação na saída da decisão:
 * - rótulo `[A<n>]` que não existe é ignorado;
 * - `citationId` só vale se for um id da evidência desta análise; sem ele,
 *   dose e conflito também caem — sem trecho, não há o que conferir;
 * - `dose` só vale se aparecer literalmente no `citedText` do item citado;
 * - um vínculo por conduta: o primeiro válido.
 */
export function acceptSourceLinks(
  actions: readonly VerificationAction[],
  items: readonly SourceAttachItem[],
  evidence: readonly WebEvidenceItem[],
): Map<number, SourceLink> {
  const actionsByLabel = new Map(actions.map((item) => [item.label, item]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const links = new Map<number, SourceLink>();

  for (const item of items) {
    const action = actionsByLabel.get(item.action);
    if (!action || links.has(action.recommendationIndex)) continue;
    const excerpt = item.citationId === null ? undefined : evidenceById.get(item.citationId);
    if (!excerpt) continue;
    links.set(action.recommendationIndex, {
      citationId: excerpt.id,
      dose: literalDose(item.dose, excerpt.citedText),
      conflict: blankToNull(item.conflict),
    });
  }
  return links;
}

/**
 * O que a fonte acrescenta ao texto da conduta: a dose como o trecho a
 * escreve e, quando ela diverge, no quê — ao lado do que a decisão disse,
 * nunca no lugar.
 */
export function applySourceLinkText(
  recommendation: { action: string; rationale: string },
  link: SourceLink,
): { action: string; rationale: string } {
  return {
    action: link.dose
      ? `${recommendation.action} — dose na fonte: ${link.dose}`
      : recommendation.action,
    rationale: link.conflict
      ? `${recommendation.rationale} Fonte oficial diverge: ${link.conflict}`
      : recommendation.rationale,
  };
}
