import type { OfficialGuidelineKind } from '@prisma/client';
import { CONITEC_ORIGIN, type ConitecListingItem } from './official-guideline.types';

/**
 * ADR-010 — Parser das listas da Conitec (PCDT, DDT, DB, PU).
 *
 * As quatro páginas usam a mesma tabela do Plone: uma linha por documento,
 * com colunas [título + link do documento] [portaria + link] [Publicação MS]
 * [Resumido]. Linhas de letra ("A", "B"…) não têm link e são ignoradas.
 *
 * Regex em vez de parser de DOM: a tabela é gerada, estável e sem aninhamento
 * de tabelas. O que protege contra mudança de layout não é o parser, é o piso
 * de itens em `CONITEC_LISTINGS` — o coletor aborta se ele não for atingido.
 */

const TABLE_PATTERN = /<table[\s\S]*?<\/table>/i;
const ROW_PATTERN = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_PATTERN = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const ANCHOR_PATTERN = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

const DATE = String.raw`(\d{1,2})º?\/(\d{1,2})\/(\d{4})`;
const PUBLISHED_PATTERN = new RegExp(
  String.raw`(?:Publicad[ao]|Republicad[ao]|Retificad[ao])\s+(?:em\s*)?\(?\s*${DATE}`,
  'i',
);
/** Algumas linhas trazem só a data entre parênteses: "... 14/10/2022 ( 24/10/2022)". */
const BARE_PUBLISHED_PATTERN = new RegExp(String.raw`\(\s*${DATE}\s*\)`);
const ANNEX_UPDATED_PATTERN = new RegExp(
  String.raw`(?:Anexo\s+alterado|Alterado|Portaria\s+atualizada|atualizad[oa])\s+em\s+${DATE}`,
  'gi',
);
/**
 * Notas de atualização que a Conitec às vezes põe junto do título — entre
 * parênteses ou depois de um hífen. Precisam sair do título: ele gera a chave
 * estável do documento, que não pode mudar a cada atualização.
 */
const TITLE_NOTE_PATTERN =
  /\((?:[^()]*\b(?:alterad|atualizad|retificad|republicad)[^()]*)\)|\s+[-–]\s*(?:\S+\s+){0,2}(?:alterad|atualizad|retificad|republicad)[oa]?\s+em\s+[\d/º]+/gi;
/** A lista tem ao menos um link quebrado ("http://PCDTResumido..."). */
const VALID_URL_PATTERN = /^https?:\/\/[^/\s]+\.[^/\s]+\//i;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href: string): string {
  const decoded = decodeEntities(href).trim();
  return decoded.startsWith('/') ? `${CONITEC_ORIGIN}${decoded}` : decoded;
}

function toDate(day: string, month: string, year: string): Date | null {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

interface Anchor {
  url: string;
  text: string;
}

function anchorsOf(html: string): Anchor[] {
  return [...html.matchAll(ANCHOR_PATTERN)].map((match) => ({
    url: absoluteUrl(match[1] ?? ''),
    text: textOf(match[2] ?? ''),
  }));
}

function latestAnnexUpdate(rowText: string): Date | null {
  let latest: Date | null = null;
  for (const match of rowText.matchAll(ANNEX_UPDATED_PATTERN)) {
    const date = toDate(match[1]!, match[2]!, match[3]!);
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

function parseRow(
  rowHtml: string,
  kind: OfficialGuidelineKind,
): Omit<ConitecListingItem, 'documentKey'>[] {
  const cells = [...rowHtml.matchAll(CELL_PATTERN)].map((match) => match[1] ?? '');
  const [titleCell, actCell = ''] = cells;
  if (!titleCell) return [];

  // Um título pode ter o texto quebrado em dois <a> com o mesmo href.
  const documentAnchors = [
    ...new Map(
      anchorsOf(titleCell)
        .filter((anchor) => VALID_URL_PATTERN.test(anchor.url))
        .map((anchor) => [anchor.url, anchor]),
    ).values(),
  ];
  if (documentAnchors.length === 0) return [];

  const rowAnchors = anchorsOf(rowHtml);
  const rowText = textOf(rowHtml);
  const cellTitle = textOf(titleCell).replace(TITLE_NOTE_PATTERN, '').replace(/\s+/g, ' ').trim();
  const actText = textOf(actCell);
  const published = actText.match(PUBLISHED_PATTERN) ?? actText.match(BARE_PUBLISHED_PATTERN);
  const actAnchor = anchorsOf(actCell).find((anchor) => !/vers[aã]o reduzida/i.test(anchor.text));

  return documentAnchors.map((anchor) => ({
    kind,
    // Vários documentos distintos na mesma célula (ex.: módulos): cada um leva
    // o próprio texto do link, senão todos teriam o mesmo título.
    title:
      documentAnchors.length > 1 ? anchor.text.replace(TITLE_NOTE_PATTERN, '').trim() : cellTitle,
    documentUrl: anchor.url,
    normativeAct: actText || null,
    normativeActUrl: actAnchor?.url ?? null,
    publishedAt: published ? toDate(published[1]!, published[2]!, published[3]!) : null,
    annexUpdatedAt: latestAnnexUpdate(rowText),
    summaryUrl:
      rowAnchors.find((a) => /resumid/i.test(a.text) && VALID_URL_PATTERN.test(a.url))?.url ?? null,
  }));
}

export function parseConitecListing(
  html: string,
  kind: OfficialGuidelineKind,
): ConitecListingItem[] {
  const table = html.match(TABLE_PATTERN)?.[0];
  if (!table) return [];

  const items: ConitecListingItem[] = [];
  const seenUrls = new Set<string>();
  const keyCounts = new Map<string, number>();

  for (const row of table.matchAll(ROW_PATTERN)) {
    for (const item of parseRow(row[1] ?? '', kind)) {
      // A mesma linha às vezes aparece duplicada na página.
      if (seenUrls.has(item.documentUrl)) continue;
      seenUrls.add(item.documentUrl);

      const baseKey = `${kind}:${slugify(item.title)}`;
      const count = (keyCounts.get(baseKey) ?? 0) + 1;
      keyCounts.set(baseKey, count);

      items.push({ ...item, documentKey: count === 1 ? baseKey : `${baseKey}-${count}` });
    }
  }

  return items;
}
