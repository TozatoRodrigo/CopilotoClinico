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
const CNS_PATTERN = /\b\d{15}\b/g;

interface ReplacementRule {
  pattern: RegExp;
  tag: string;
  shouldMask?: (match: string, text: string, index: number) => boolean;
}

const REPLACEMENTS: Record<string, ReplacementRule> = {
  email: { pattern: EMAIL_PATTERN, tag: '[REDACTED_EMAIL]' },
  cnpj: { pattern: CNPJ_PATTERN, tag: '[REDACTED_CNPJ]' },
  cns: { pattern: CNS_PATTERN, tag: '[REDACTED_CNS]' },
  cpf: { pattern: CPF_PATTERN, tag: '[REDACTED_CPF]', shouldMask: isValidCPF },
  phone: { pattern: PHONE_PATTERN, tag: '[REDACTED_PHONE]' },
  cep: { pattern: CEP_PATTERN, tag: '[REDACTED_CEP]' },
  date: { pattern: DATE_PATTERN, tag: '[REDACTED_DATE]', shouldMask: hasBirthDateContext },
  rg: { pattern: RG_PATTERN, tag: '[REDACTED_RG]' },
};

export function maskPII(text: string): PIIFilterResult {
  const detections: Array<PIIDetection & { tag: string }> = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  for (const [type, { pattern, tag }] of Object.entries(REPLACEMENTS)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const rule = REPLACEMENTS[type]!;

      if (rule.shouldMask && !rule.shouldMask(match[0], text, start)) {
        continue;
      }

      if (occupiedRanges.some((range) => rangesOverlap(start, end, range.start, range.end))) {
        continue;
      }

      detections.push({
        type,
        start,
        end,
        original: match[0],
        tag,
      });
      occupiedRanges.push({ start, end });
    }
  }

  detections.sort((a, b) => a.start - b.start);

  let redacted = '';
  let cursor = 0;
  for (const detection of detections) {
    redacted += text.slice(cursor, detection.start);
    redacted += detection.tag;
    cursor = detection.end;
  }
  redacted += text.slice(cursor);

  return {
    redacted,
    detections: detections.map(({ tag: _tag, ...detection }) => detection),
    hasPII: detections.length > 0,
  };
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidCPF(value: string): boolean {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  const firstCheckDigit = calculateCPFCheckDigit(digits.slice(0, 9), 10);
  const secondCheckDigit = calculateCPFCheckDigit([...digits.slice(0, 9), firstCheckDigit], 11);

  return digits[9] === firstCheckDigit && digits[10] === secondCheckDigit;
}

function calculateCPFCheckDigit(digits: number[], factor: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (factor - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function hasBirthDateContext(_match: string, text: string, index: number): boolean {
  const context = text.slice(Math.max(0, index - 24), index).toLowerCase();
  return /\b(nascimento|nasc\.?|dn|data de nascimento)\s*:?\s*$/.test(context);
}
