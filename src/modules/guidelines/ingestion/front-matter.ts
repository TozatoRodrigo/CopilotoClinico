export interface GuidelineFrontMatter {
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  institutionId?: string;
}

export interface ParsedGuidelineDocument {
  meta: GuidelineFrontMatter;
  body: string;
}

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const REQUIRED_FIELDS: Array<keyof GuidelineFrontMatter> = ['source', 'sourceVersion', 'specialty'];

/**
 * Parser mínimo de front-matter `chave: valor` (sem dependência de YAML),
 * usado pelo `scripts/ingest-batch.ts` (KB-002). Front-matter aceita
 * `version` como sinônimo de `sourceVersion`.
 */
export function parseGuidelineDocument(raw: string): ParsedGuidelineDocument {
  const match = raw.match(FRONT_MATTER_PATTERN);
  if (!match) {
    throw new Error(
      'Front-matter ausente ou mal formatado (esperado bloco "--- ... ---" no início do arquivo)',
    );
  }

  const [, frontMatter, body] = match;
  const fields: Record<string, string> = {};

  for (const line of (frontMatter ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["'](.*)["']$/, '$1');

    fields[key] = value;
  }

  const sourceVersion = fields.sourceVersion ?? fields.version;
  const meta: Partial<GuidelineFrontMatter> = {
    source: fields.source,
    sourceVersion,
    specialty: fields.specialty,
    evidenceLevel: fields.evidenceLevel,
    institutionId: fields.institutionId,
  };

  for (const field of REQUIRED_FIELDS) {
    if (!meta[field]) {
      throw new Error(`Front-matter inválido: campo obrigatório "${field}" ausente`);
    }
  }

  return {
    meta: meta as GuidelineFrontMatter,
    body: (body ?? '').trim(),
  };
}
