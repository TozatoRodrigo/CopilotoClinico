export interface ParsedFrontMatter {
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  cenario?: string;
  redFlags?: string[];
}

export interface ParsedGuidelineFile {
  filename: string;
  meta: ParsedFrontMatter;
  body: string;
  raw: string;
}

export interface ParseError {
  filename: string;
  error: string;
  action: string;
}

const REQUIRED_FIELDS = ['source', 'sourceVersion', 'specialty'] as const;

function parseListField(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

export function parseGuidelineContent(filename: string, raw: string): ParsedGuidelineFile {
  const pattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = raw.match(pattern);

  if (!match) {
    throw new Error(
      `Front-matter ausente ou mal formatado em ${filename}. Esperado bloco "--- ... ---" no início do arquivo.`,
    );
  }

  const [, frontMatterRaw, bodyRaw] = match;
  const fields: Record<string, string> = {};

  for (const line of (frontMatterRaw ?? '').split('\n')) {
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
  const meta: Partial<ParsedFrontMatter> = {
    source: fields.source,
    sourceVersion,
    specialty: fields.specialty,
    evidenceLevel: fields.evidenceLevel,
    cenario: fields.cenario,
    redFlags: parseListField(fields.red_flags ?? fields.redFlags),
  };

  for (const field of REQUIRED_FIELDS) {
    if (!meta[field]) {
      throw new Error(
        `Front-matter inválido em ${filename}: campo obrigatório "${field}" ausente. Edite o front-matter e reenvie.`,
      );
    }
  }

  return {
    filename,
    meta: meta as ParsedFrontMatter,
    body: (bodyRaw ?? '').trim(),
    raw,
  };
}
