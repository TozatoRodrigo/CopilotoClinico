import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AnyCardToolId,
  KnowledgeCardReviewFlag,
} from '../../../shared/contracts/knowledge-cards';
import type { AnyCardDraft } from './any-card-draft';

/**
 * CC-405 — achados da revisão clínica das Ferramentas (CC-310) que o revisor
 * precisa ver antes de assinar um cartão importado. Os achados moram em
 * docs/ferramentas/revisao-clinica/<ferramenta>.md, em tabelas ("| 1.1 | Onde
 * | O que o ANY diz | Por que parece problema |") ou em listas numeradas
 * ("1. **Título**" com "- Onde: …"). A ligação com o cartão é determinística:
 * o "Onde" do achado cita o nome ou o id do item (`findingTerms`), ou fala de
 * "todas"/"todo o roteiro" e vale para a ferramenta inteira.
 *
 * Só as seções de conteúdo clínico entram; as de tela e engenharia (faixas de
 * entrada, defeitos de tela, linguagem) não mudam dose e ficam de fora.
 */

export const REVIEW_DOCS_DIR = 'docs/ferramentas/revisao-clinica';

export const FINDING_DOCS: Readonly<Record<AnyCardToolId, { file: string; sections: RegExp }>> = {
  infusoes: { file: 'infusoes.md', sections: /conteúdo clínico/i },
  pediatria: { file: 'pediatria.md', sections: /achados no conteúdo/i },
  'via-aerea': { file: 'via-aerea.md', sections: /conteúdo clínico/i },
  sedacao: { file: 'sedacao.md', sections: /conteúdo clínico/i },
  toxicologia: {
    file: 'toxicologia.md',
    sections: /disponibilidade dos antídotos|antídotos e contas/i,
  },
  bloqueios: { file: 'bloqueios.md', sections: /conteúdo clínico/i },
  paliativos: {
    file: 'paliativos.md',
    sections: /conversor de opioides|hipodermóclise \(fora|manejo de sintomas/i,
  },
  acls: { file: 'acls.md', sections: /conteúdo clínico/i },
  dengue: { file: 'dengue.md', sections: /conteúdo clínico/i },
  'cad-ehh': { file: 'cad-ehh.md', sections: /conteúdo clínico/i },
};

/** Reconciliação da fonte única das doses pediátricas (CC-321), uma linha por id e faixa. */
export const PEDIATRIC_SOURCE_CSV = 'pediatria-fonte-unica.csv';

export interface ReviewFinding {
  /** "infusoes.md" */
  doc: string;
  /** "1.1" na tabela, "3" na lista. */
  id: string;
  where: string;
  detail: string;
}

/** Divergência do id entre as fontes pediátricas, quando a reconciliação aponta uma. */
export interface PediatricDivergence {
  table: 'bolus' | 'infusao';
  id: string;
  divergences: string[];
  decision: string | null;
}

export interface ReviewFindingsIndex {
  byTool: ReadonlyMap<AnyCardToolId, readonly ReviewFinding[]>;
  pediatric: ReadonlyMap<string, PediatricDivergence>;
}

const MAX_FLAG_DETAIL = 600;

function clean(text: string): string {
  return text.replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => clean(cell.replace(/\\\|/g, '|')));
}

/** Achados numerados das seções de conteúdo clínico de um documento de revisão. */
export function parseReviewFindings(
  doc: string,
  markdown: string,
  sections: RegExp,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  let active = false;
  let columns: string[] | null = null;
  let item: { id: string; title: string; where: string | null; parts: string[] } | null = null;
  let field: 'where' | 'detail' | null = null;

  const flushItem = () => {
    if (item) {
      findings.push({
        doc,
        id: item.id,
        where: clean(item.where ?? item.title),
        detail: clean([item.title, ...item.parts].join(' — ')),
      });
    }
    item = null;
    field = null;
  };

  for (const line of markdown.split('\n')) {
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      flushItem();
      active = sections.test(heading[1] ?? '');
      columns = null;
      continue;
    }
    if (!active) continue;

    if (line.trim().startsWith('|')) {
      flushItem();
      const cells = splitRow(line);
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      if (!columns) {
        columns = cells.map((cell) => cell.toLowerCase());
        continue;
      }
      const at = (name: string) =>
        cells[columns!.findIndex((column) => column.startsWith(name))] ?? '';
      const id = at('#');
      if (!/^\d+(?:\.\d+)*$/.test(id)) continue;
      findings.push({
        doc,
        id,
        where: at('onde'),
        detail: [at('o que o any diz'), at('por que parece problema')].filter(Boolean).join(' — '),
      });
      continue;
    }
    columns = null;

    const numbered = /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line);
    if (numbered) {
      flushItem();
      item = { id: numbered[1]!, title: numbered[2]!, where: null, parts: [] };
      if (numbered[3]) item.parts.push(numbered[3]);
      continue;
    }
    if (!item) continue;
    const bullet = /^\s+-\s+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1] ?? '';
      const onde = /^Onde:\s*(.*)$/i.exec(text);
      if (onde) {
        item.where = onde[1] ?? '';
        field = 'where';
      } else if (/^(O que o ANY (diz|faz)|Por que parece problema):/i.test(text)) {
        item.parts.push(text.replace(/^[^:]+:\s*/, ''));
        field = 'detail';
      } else {
        field = null;
      }
      continue;
    }
    if (/^\s{3,}\S/.test(line) && field) {
      if (field === 'where') item.where = `${item.where ?? ''} ${line.trim()}`;
      else item.parts[item.parts.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (line.trim() === '') continue;
    flushItem();
  }
  flushItem();
  return findings;
}

/** CSV simples (aspas duplas com vírgula dentro), como o da reconciliação. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}

export function parsePediatricDivergences(csv: string): Map<string, PediatricDivergence> {
  const [header, ...rows] = parseCsv(csv);
  const column = (name: string) => header?.indexOf(name) ?? -1;
  const [table, id, diverge, divergences, decision] = [
    column('tabela'),
    column('id'),
    column('diverge'),
    column('divergencias'),
    column('decisao_gustavo'),
  ];
  const byKey = new Map<string, PediatricDivergence>();
  for (const row of rows) {
    const tableName = row[table];
    if ((tableName !== 'bolus' && tableName !== 'infusao') || row[diverge] !== 'sim') continue;
    const key = `${tableName}:${row[id]}`;
    const current = byKey.get(key) ?? {
      table: tableName,
      id: row[id] ?? '',
      divergences: [],
      decision: null,
    };
    for (const part of (row[divergences] ?? '').split(',').map((value) => value.trim())) {
      if (part && part !== '—' && !current.divergences.includes(part))
        current.divergences.push(part);
    }
    const decided = row[decision]?.trim();
    if (decided) current.decision = decided;
    byKey.set(key, current);
  }
  return byKey;
}

/** Lê os documentos de revisão do repositório (só o comando de importação usa). */
export function loadReviewFindings(rootDir: string): ReviewFindingsIndex {
  const dir = join(rootDir, REVIEW_DOCS_DIR);
  const byTool = new Map<AnyCardToolId, readonly ReviewFinding[]>();
  for (const [toolId, { file, sections }] of Object.entries(FINDING_DOCS) as Array<
    [AnyCardToolId, (typeof FINDING_DOCS)[AnyCardToolId]]
  >) {
    byTool.set(toolId, parseReviewFindings(file, readFileSync(join(dir, file), 'utf8'), sections));
  }
  return {
    byTool,
    pediatric: parsePediatricDivergences(readFileSync(join(dir, PEDIATRIC_SOURCE_CSV), 'utf8')),
  };
}

export const EMPTY_FINDINGS: ReviewFindingsIndex = { byTool: new Map(), pediatric: new Map() };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Achado que vale para a ferramenta inteira ("Todas as drogas", "Todo o roteiro", "Ferramenta inteira"). */
const TOOL_WIDE = /(?<![a-z])(?:tod[ao]s?|inteir[ao])(?![a-z])/;

export function findingApplies(finding: ReviewFinding, draft: AnyCardDraft): boolean {
  const where = normalize(finding.where);
  if (TOOL_WIDE.test(where)) return true;
  return draft.findingTerms.some((term) => {
    const normalized = normalize(term).trim();
    if (normalized.length < 2) return false;
    return new RegExp(`(?<![a-z0-9-])${escapeRegExp(normalized)}(?![a-z0-9-])`).test(where);
  });
}

function truncate(text: string): string {
  return text.length <= MAX_FLAG_DETAIL ? text : `${text.slice(0, MAX_FLAG_DETAIL - 1)}…`;
}

/**
 * O que o revisor vê antes de assinar: a revisão pendente do conteúdo no motor
 * (`review: pendente`), cada achado ligado ao item e, na pediatria, a
 * divergência do id na fonte única. Vazio quando o motor diz que o conteúdo já
 * foi revisado e nenhum achado cita o item.
 */
export function reviewFlagsFor(
  draft: AnyCardDraft,
  findings: ReviewFindingsIndex,
): KnowledgeCardReviewFlag[] {
  const doc = FINDING_DOCS[draft.toolId];
  const docPath = `${REVIEW_DOCS_DIR}/${doc.file}`;
  const flags: KnowledgeCardReviewFlag[] = [];
  if (draft.provenance.review.status === 'pendente') {
    flags.push({
      ref: docPath,
      title: 'Revisão clínica do conteúdo do ANY pendente (CC-310)',
      detail:
        'O motor das Ferramentas marca este conteúdo como "revisão pendente". Confira os achados abaixo e o documento de revisão antes de assinar.',
    });
  }
  for (const finding of findings.byTool.get(draft.toolId) ?? []) {
    if (!findingApplies(finding, draft)) continue;
    flags.push({
      ref: `${REVIEW_DOCS_DIR}/${finding.doc}#${finding.id}`,
      title: truncate(`Achado ${finding.id}: ${finding.where}`),
      detail: truncate(finding.detail),
    });
  }
  if (draft.toolId === 'pediatria') {
    const table = draft.itemId.startsWith('pediatria/infusao-') ? 'infusao' : 'bolus';
    for (const term of draft.findingTerms) {
      const divergence = findings.pediatric.get(`${table}:${term}`);
      if (!divergence) continue;
      flags.push({
        ref: `${REVIEW_DOCS_DIR}/pediatria-fonte-unica.md#${divergence.id}`,
        title: 'Fonte única das doses pediátricas (CC-321): as fontes do ANY divergem',
        detail: truncate(
          `Diverge em: ${divergence.divergences.join(', ') || 'ver a reconciliação'}.` +
            (divergence.decision
              ? ` Decisão registrada: ${divergence.decision}.`
              : ' Sem decisão registrada.'),
        ),
      });
    }
  }
  return flags;
}
