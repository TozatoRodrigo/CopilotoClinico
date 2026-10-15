import { parseArgs } from 'node:util';
import { ANY_CARD_TOOL_IDS, type AnyCardToolId } from '../../../shared/contracts/knowledge-cards';
import { ANY_CONTENT_REVIEWER_NAME, type ReviewerCrm } from './any-card-import';

/**
 * CC-405 — argumentos de `pnpm cards:import-any` (scripts/cards/import-any.ts).
 */
export const IMPORT_CLI_USAGE = `Uso:
  pnpm cards:import-any [--tool <ferramenta>] [--dry-run] [--print] [--reviewer-crm <UF>-<número>]

  --tool           só uma ferramenta: ${ANY_CARD_TOOL_IDS.join(', ')}
  --dry-run        mapeia e confere as citações sem abrir o banco; mostra o que entraria
  --print          com --dry-run, mostra cada cartão (pergunta, doses e achados)
  --reviewer-crm   revisor indicado pelo CRM (ex.: SP-123456); sem ele, o médico cadastrado
                   com o nome "${ANY_CONTENT_REVIEWER_NAME}" (precisa ser um só)

Sem IA: o conteúdo sai do motor das Ferramentas (src/shared/clinical-tools). Reimportar
não duplica: cartão com o mesmo conteúdo fica como está, conteúdo novo vira versão nova.`;

export type ImportCliResult =
  | { kind: 'help' }
  | { kind: 'error'; message: string }
  | {
      kind: 'run';
      toolId: AnyCardToolId | null;
      dryRun: boolean;
      print: boolean;
      reviewerCrm: ReviewerCrm | null;
    };

function isToolId(value: string): value is AnyCardToolId {
  return (ANY_CARD_TOOL_IDS as readonly string[]).includes(value);
}

/** "SP-123456", "sp/123456" ou "123456/SP". */
export function parseReviewerCrm(raw: string): ReviewerCrm | null {
  const text = raw.trim().toUpperCase();
  const ufFirst = /^([A-Z]{2})[-/ ]?(\d{3,10})$/.exec(text);
  if (ufFirst?.[1] && ufFirst[2]) return { uf: ufFirst[1], number: ufFirst[2] };
  const numberFirst = /^(\d{3,10})[-/ ]?([A-Z]{2})$/.exec(text);
  if (numberFirst?.[1] && numberFirst[2]) return { uf: numberFirst[2], number: numberFirst[1] };
  return null;
}

export function parseImportCli(argv: readonly string[]): ImportCliResult {
  let values: {
    tool?: string;
    'dry-run'?: boolean;
    print?: boolean;
    'reviewer-crm'?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        tool: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        print: { type: 'boolean', default: false },
        'reviewer-crm': { type: 'string' },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  if (values.help) return { kind: 'help' };

  const tool = values.tool?.trim();
  if (tool !== undefined && !isToolId(tool)) {
    return { kind: 'error', message: `--tool desconhecida: ${tool}` };
  }
  let reviewerCrm: ReviewerCrm | null = null;
  if (values['reviewer-crm'] !== undefined) {
    reviewerCrm = parseReviewerCrm(values['reviewer-crm']);
    if (!reviewerCrm)
      return { kind: 'error', message: '--reviewer-crm no formato UF-número (ex.: SP-123456)' };
  }
  if (values.print && !values['dry-run']) {
    return { kind: 'error', message: '--print só vale com --dry-run' };
  }
  return {
    kind: 'run',
    toolId: tool ?? null,
    dryRun: values['dry-run'] ?? false,
    print: values.print ?? false,
    reviewerCrm,
  };
}
