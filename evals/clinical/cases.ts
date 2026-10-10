import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ClinicalCaseSchema, type ClinicalCase } from './case.schema';

export const CASES_DIR = join(__dirname, 'cases');

export interface CaseSet {
  cases: ClinicalCase[];
  /**
   * Hash do conteúdo de todos os arquivos de caso. Vai para o relatório: dois
   * runs só são comparáveis se rodaram sobre o mesmo gabarito.
   */
  version: string;
}

export class CaseFileError extends Error {}

function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');
}

function parseCaseFile(filePath: string): ClinicalCase {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CaseFileError(`${basename(filePath)}: JSON inválido — ${reason}`);
  }

  const parsed = ClinicalCaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CaseFileError(
      `${basename(filePath)}: não segue o formato do caso\n${formatZodIssues(parsed.error.issues)}`,
    );
  }

  // O nome do arquivo é o id: é assim que o médico acha o caso citado no relatório.
  const expectedFileName = `${parsed.data.id}.json`;
  if (basename(filePath) !== expectedFileName) {
    throw new CaseFileError(
      `${basename(filePath)}: o arquivo deve se chamar ${expectedFileName} (igual ao id)`,
    );
  }

  return parsed.data;
}

export function loadCaseSet(dir: string = CASES_DIR): CaseSet {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const hash = createHash('sha256');
  const cases: ClinicalCase[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const filePath = join(dir, file);
    hash.update(file).update(readFileSync(filePath));
    const clinicalCase = parseCaseFile(filePath);
    if (seenIds.has(clinicalCase.id)) {
      throw new CaseFileError(`id repetido: ${clinicalCase.id}`);
    }
    seenIds.add(clinicalCase.id);
    cases.push(clinicalCase);
  }

  return { cases, version: hash.digest('hex').slice(0, 12) };
}

const CRITICAL_SELECTOR = 'critical';
const TAG_PREFIX = 'tag:';

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

function matchesSelector(clinicalCase: ClinicalCase, selector: string): boolean {
  if (selector === CRITICAL_SELECTOR) return clinicalCase.critical;
  if (selector.startsWith(TAG_PREFIX)) {
    return clinicalCase.tags.includes(selector.slice(TAG_PREFIX.length));
  }
  if (/[*?]/.test(selector)) return globToRegExp(selector).test(clinicalCase.id);
  return clinicalCase.id === selector || clinicalCase.tags.includes(selector);
}

/**
 * `--cases` aceita uma lista separada por vírgula; o resultado é a UNIÃO.
 * Cada item é `critical`, um glob sobre o id (`kb001-*`), `tag:<tag>` ou um id
 * exato (que, se não for id, é tentado como tag).
 */
export function selectCases(
  cases: ClinicalCase[],
  selectorList: string | undefined,
): ClinicalCase[] {
  if (!selectorList) return cases;
  const selectors = selectorList
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);

  const selected = cases.filter((clinicalCase) =>
    selectors.some((selector) => matchesSelector(clinicalCase, selector)),
  );
  if (selected.length === 0) {
    throw new CaseFileError(`--cases "${selectorList}" não selecionou nenhum caso`);
  }
  return selected;
}
