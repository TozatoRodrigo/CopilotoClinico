import type { PsSyndrome } from '../../../shared/contracts/clinical';
import type {
  AnyCardToolId,
  KnowledgeCardClaimKind,
  KnowledgeCardContentInput,
  KnowledgeCardToolSource,
} from '../../../shared/contracts/knowledge-cards';
import { TOOLS } from '../../../shared/clinical-tools/catalog';
import type { ContentProvenance } from '../../../shared/clinical-tools/provenance';
import { sha256Hex } from '../../audit/audit-hash';

/**
 * CC-405 (ADR-019) — rascunho de cartão a partir do conteúdo tipado de uma
 * ferramenta do ANY. Mapeamento determinístico, sem IA: cada mapeador
 * (`mappers/*.ts`) escreve o dado do motor em linhas, e cada linha é ao mesmo
 * tempo texto da fonte e texto do cartão. A resposta e as afirmações citam a
 * linha inteira, e a dose estruturada sai da mesma linha — a checagem de
 * citação do CC-403 confere tudo isso como confere o rascunho da IA.
 */

export interface AnyCardDose {
  drug: string;
  /** Quantidade como a linha escreve ("0,01 - 3 mcg/kg/min"). */
  amount: string;
  route?: string | null;
  frequency?: string | null;
  maxDose?: string | null;
}

export interface AnyCardFact {
  /** Uma linha do texto-fonte: o dado do motor por extenso. */
  line: string;
  kind: KnowledgeCardClaimKind;
  /** Cada campo preenchido está, letra por letra, em `line`. */
  dose?: AnyCardDose;
}

export interface AnyCardDraft {
  toolId: AnyCardToolId;
  /** "infusoes/noradrenalina": ferramenta e item no motor. A chave do cartão é `any:<itemId>`. */
  itemId: string;
  itemLabel: string;
  topic: string;
  syndrome: PsSyndrome | null;
  question: string;
  population: string | null;
  /** Linhas da resposta curta (até 4), citadas como estão. */
  answer: readonly string[];
  facts: readonly AnyCardFact[];
  /** Linhas do texto-fonte que não viram afirmação (apresentação, preparo). */
  context: readonly string[];
  provenance: ContentProvenance;
  /** Referência bibliográfica que o ANY cita para o item; `null` quando não cita. */
  reference: string | null;
  /** Forma curta da referência, para o título da fonte quando há várias ("MS 6ª ed. · OMS"). */
  referenceTitle: string | null;
  referenceUrl: string | null;
  /**
   * Termos que ligam um achado da revisão clínica (CC-310) a este item: o
   * nome e o id da droga como os documentos de revisão escrevem ("Onde").
   */
  findingTerms: readonly string[];
}

/** O que o mapeador precisa dizer; o resto tem padrão. */
type OptionalField =
  | 'context'
  | 'reference'
  | 'referenceTitle'
  | 'referenceUrl'
  | 'population'
  | 'syndrome';

export type AnyCardDraftInput = Omit<AnyCardDraft, OptionalField> &
  Partial<Pick<AnyCardDraft, OptionalField>>;

export function anyCardDraft(input: AnyCardDraftInput): AnyCardDraft {
  return {
    context: [],
    reference: null,
    referenceTitle: null,
    referenceUrl: null,
    population: null,
    syndrome: null,
    ...input,
  };
}

/** Chave estável do cartão importado: reimportar acha o mesmo cartão. */
export function anySourceKey(itemId: string): string {
  return `any:${itemId}`;
}

/** Prefixo das chaves de uma ferramenta ("any:infusoes/"). */
export function anyToolKeyPrefix(toolId: AnyCardToolId): string {
  return `any:${toolId}/`;
}

/** Fragmento de id a partir de texto do ANY ("Morfina EV/SC" → "morfina-ev-sc"). */
export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TOOL_NAMES = new Map(TOOLS.map((tool) => [tool.id, tool.name]));

export function anyToolName(toolId: AnyCardToolId): string {
  const name = TOOL_NAMES.get(toolId);
  if (!name) throw new Error(`Ferramenta ${toolId} fora do catálogo das Ferramentas`);
  return name;
}

/** "ANY App v4 · drugConfigs.ts (95c8fba)" → versão "v4" e commit "95c8fba". */
export function parseAnyProvenance(origin: string): {
  anyVersion: string | null;
  anyCommit: string | null;
} {
  return {
    anyVersion: /\bANY App (v\d+)\b/.exec(origin)?.[1] ?? null,
    anyCommit: /\b([0-9a-f]{7,40})\)/.exec(origin)?.[1] ?? null,
  };
}

/** Sem a mesma linha duas vezes: a resposta costuma repetir a linha da dose. */
function uniqueLines(lines: readonly string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter((line) => line !== ''))];
}

/**
 * O texto integral da fonte do cartão: o item do motor por extenso, a
 * referência e a procedência. É contra ele que a checagem confere cada
 * citação, e o hash dele entra no conteúdo assinado.
 */
export function anyCardSourceText(draft: AnyCardDraft): string {
  const { provenance } = draft;
  return uniqueLines([
    `${anyToolName(draft.toolId)} — ${draft.itemLabel}`,
    ...draft.context,
    ...draft.answer,
    ...draft.facts.map((fact) => fact.line),
    draft.reference
      ? `Referência: ${draft.reference}`
      : 'Referência: o ANY não cita referência bibliográfica para este item.',
    `Procedência: ${provenance.source}; conteúdo ${provenance.version} de ${provenance.updatedAt}.`,
  ]).join('\n');
}

/** A fonte resolvida, sem a chave ("S1"), que depende do cartão. */
export type AnyToolSourceMeta = Omit<KnowledgeCardToolSource, 'key'>;

export function anyCardSourceMeta(draft: AnyCardDraft): AnyToolSourceMeta {
  const toolName = anyToolName(draft.toolId);
  const { anyVersion, anyCommit } = parseAnyProvenance(draft.provenance.source);
  const anyLabel = ['ANY App', anyVersion].filter(Boolean).join(' ');
  return {
    kind: 'clinical_tool',
    toolItemId: draft.itemId,
    title:
      draft.referenceTitle ??
      draft.reference ??
      `${toolName} — ANY App, sem referência bibliográfica`,
    section: `${toolName} · ${draft.itemLabel}`,
    sourceVersion: `${anyLabel}${anyCommit ? ` (${anyCommit})` : ''}, conteúdo ${draft.provenance.version}`,
    url: draft.referenceUrl,
    reference: draft.reference,
    origin: draft.provenance.source,
    contentVersion: draft.provenance.version,
    contentUpdatedAt: draft.provenance.updatedAt,
    anyVersion,
    anyCommit,
    textSha256: sha256Hex(anyCardSourceText(draft)),
  };
}

const SOURCE_KEY = 'S1';

function cite(line: string) {
  return { sourceKey: SOURCE_KEY, quote: line };
}

/**
 * O conteúdo de escrita do cartão, como o rascunho da IA o entregaria: a
 * fonte é só a chave e o item do motor; o servidor resolve o resto e confere
 * as citações (`prepareCardContent`).
 */
export function anyCardContentInput(draft: AnyCardDraft): KnowledgeCardContentInput {
  return {
    question: draft.question,
    population: draft.population,
    answer: draft.answer.join(' '),
    answerCitations: draft.answer.map(cite),
    claims: draft.facts.map((fact) => ({
      kind: fact.kind,
      text: fact.line,
      dose: fact.dose
        ? {
            drug: fact.dose.drug,
            amount: fact.dose.amount,
            route: fact.dose.route ?? null,
            frequency: fact.dose.frequency ?? null,
            maxDose: fact.dose.maxDose ?? null,
            citation: cite(fact.line),
          }
        : null,
      citations: [cite(fact.line)],
    })),
    sources: [{ key: SOURCE_KEY, kind: 'clinical_tool', toolItemId: draft.itemId }],
  };
}
