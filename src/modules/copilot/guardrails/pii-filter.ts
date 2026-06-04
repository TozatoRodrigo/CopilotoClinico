export interface PIIDetection {
  type: string;
  start: number;
  end: number;
  original: string;
}

export interface PIIFilterResult {
  redacted: string;
  detections: PIIDetection[];
  hasPII: boolean;
}

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const PHONE_PATTERN = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const CEP_PATTERN = /\b\d{5}-?\d{3}\b/g;
const DATE_PATTERN = /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g;
const RG_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g;

const REPLACEMENTS: Record<string, { pattern: RegExp; tag: string }> = {
  email: { pattern: EMAIL_PATTERN, tag: '[REDACTED_EMAIL]' },
  cnpj: { pattern: CNPJ_PATTERN, tag: '[REDACTED_CNPJ]' },
  cpf: { pattern: CPF_PATTERN, tag: '[REDACTED_CPF]' },
  phone: { pattern: PHONE_PATTERN, tag: '[REDACTED_PHONE]' },
  cep: { pattern: CEP_PATTERN, tag: '[REDACTED_CEP]' },
  date: { pattern: DATE_PATTERN, tag: '[REDACTED_DATE]' },
  rg: { pattern: RG_PATTERN, tag: '[REDACTED_RG]' },
};

export function maskPII(text: string): PIIFilterResult {
  let redacted = text;
  const detections: PIIDetection[] = [];

  for (const [type, { pattern, tag }] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      detections.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
      });
      redacted = redacted.replace(match[0], tag);
    }
  }

  return {
    redacted,
    detections,
    hasPII: detections.length > 0,
  };
}
