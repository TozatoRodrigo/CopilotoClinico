import { parseBooleanFlag } from '../../../config/feature-flag';
import { findPersonNames } from './person-names';
import type { TextSpan } from './protected-clinical-terms';

export type PIIType =
  | 'email'
  | 'record'
  | 'cnpj'
  | 'cns'
  | 'cpf'
  | 'phone'
  | 'cep'
  | 'date'
  | 'rg'
  | 'name';

export interface PIIDetection {
  type: PIIType;
  start: number;
  end: number;
  original: string;
}

export interface PIIFilterResult {
  redacted: string;
  detections: PIIDetection[];
  hasPII: boolean;
}

export interface MaskPIIOptions {
  /**
   * CC-201/CC-206 — regras de contexto: prontuário pelo rótulo, nome depois de
   * tratamento ("Seu", "Dona", "Sr.") e apelido. Sem a opção, vale a flag
   * `DEID_CONTEXT_RULES` (ligada por padrão; `off` volta à regex anterior).
   */
  contextRules?: boolean;
}

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const PHONE_PATTERN = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const CEP_PATTERN = /\b\d{5}-?\d{3}\b/g;
const DATE_PATTERN = /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g;
const RG_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g;
const CNS_PATTERN = /\b\d{15}\b/g;

/**
 * CC-201 — número de prontuário, registro ou atendimento. Número solto não
 * identifica ninguém e quase sempre é dado clínico ("leito 12", "plaquetas
 * 150000", "PA 120x80"); só sai o número logo depois de um rótulo.
 */
const RECORD_LABEL = [
  String.raw`prontu[aá]rio`,
  String.raw`pront\.?`,
  String.raw`registro(?:\s+(?:hospitalar|geral|HC|SAME|do\s+paciente))?`,
  String.raw`reg\.`,
  String.raw`RH`,
  String.raw`matr[ií]cula`,
  String.raw`SAME`,
  String.raw`AIH`,
  String.raw`BAM`,
  String.raw`FAA`,
  // "BE" também é excesso de base na gasometria ("BE -5,2", "BE +3"): sinal e
  // vírgula não passam, e excesso de base nunca tem 4 dígitos.
  String.raw`BE`,
  String.raw`(?:c[oó]digo|ID)\s+do\s+paciente`,
  String.raw`n(?:[º°]|[úu]mero)\s+d[eo]\s+(?:atendimento|prontu[aá]rio|registro|ficha|boletim|interna[cç][aã]o)`,
].join('|');
/** Estes só valem com "nº" antes do número: em "atendimento 2023", 2023 pode ser o ano. */
const RECORD_LABEL_NEEDS_SIGN = String.raw`atendimento|ficha|boletim|interna[cç][aã]o`;
const NUMBER_SIGN = String.raw`(?:n\.?\s?[º°o](?![\p{L}])\.?|n[úu]m(?:ero)?\.?)`;
/** 4.587.213, 4587213, 0012345-6, 2024/123 — sem casa decimal ("10,5" é medida). */
const RECORD_NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:-\d+)?|\d+(?:[/-]\d+)*`;
const MEASUREMENT_UNIT = String.raw`mg|mcg|µg|g|kg|ml|l|ui|u|meq|mmol|mmhg|bpm|irpm|cm|mm|m|h|hs|min|s|x|%|°|anos?|meses|dias|semanas|vezes`;
const RECORD_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])` +
    String.raw`(?:(?:${RECORD_LABEL})(?![\p{L}])\s*(?:[:#]\s*)?(?:${NUMBER_SIGN}\s*[:#]?\s*)?` +
    String.raw`|(?:${RECORD_LABEL_NEEDS_SIGN})\s*(?:[:#]\s*)?${NUMBER_SIGN}\s*[:#]?\s*)` +
    String.raw`(?<value>${RECORD_NUMBER})(?!\d)(?![.,]\d)` +
    String.raw`(?!\s*(?:${MEASUREMENT_UNIT})(?![\p{L}]))`,
  'gdiu',
);
/** "registro 15/03/2024" é data de evento clínico, não número de registro. */
const DATE_SHAPED = /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;

interface Rule {
  type: PIIType;
  tag: string;
  find: (text: string) => TextSpan[];
}

function regexRule(
  type: PIIType,
  tag: string,
  pattern: RegExp,
  shouldMask?: (match: string, text: string, index: number) => boolean,
): Rule {
  return {
    type,
    tag,
    find: (text) =>
      [...text.matchAll(pattern)]
        .filter((match) => !shouldMask || shouldMask(match[0], text, match.index))
        .map((match) => ({ start: match.index, end: match.index + match[0].length })),
  };
}

const RECORD_RULE: Rule = {
  type: 'record',
  tag: '[REDACTED_RECORD]',
  find: (text) =>
    [...text.matchAll(RECORD_PATTERN)].flatMap((match) => {
      const value = match.groups?.value;
      const range = match.indices?.groups?.value;
      if (!value || !range) return [];
      if (value.replace(/\D/g, '').length < 4 || DATE_SHAPED.test(value)) return [];
      return [{ start: range[0], end: range[1] }];
    }),
};

const NAME_RULE: Rule = { type: 'name', tag: '[NOME]', find: findPersonNames };

const EMAIL_RULE = regexRule('email', '[REDACTED_EMAIL]', EMAIL_PATTERN);
const STRUCTURED_RULES: readonly Rule[] = [
  regexRule('cnpj', '[REDACTED_CNPJ]', CNPJ_PATTERN),
  regexRule('cns', '[REDACTED_CNS]', CNS_PATTERN),
  regexRule('cpf', '[REDACTED_CPF]', CPF_PATTERN, isValidCPF),
  regexRule('phone', '[REDACTED_PHONE]', PHONE_PATTERN),
  regexRule('cep', '[REDACTED_CEP]', CEP_PATTERN),
  regexRule('date', '[REDACTED_DATE]', DATE_PATTERN, hasBirthDateContext),
  regexRule('rg', '[REDACTED_RG]', RG_PATTERN),
];

/** Em sobreposição vale a regra que vem antes: "prontuário 12345678" é prontuário, não CEP. */
const RULES_WITHOUT_CONTEXT: readonly Rule[] = [EMAIL_RULE, ...STRUCTURED_RULES];
const RULES_WITH_CONTEXT: readonly Rule[] = [
  EMAIL_RULE,
  RECORD_RULE,
  ...STRUCTURED_RULES,
  NAME_RULE,
];

/** Lida a cada chamada, como as outras flags: desligar não pede redeploy. */
function contextRulesEnabled(): boolean {
  return parseBooleanFlag(process.env.DEID_CONTEXT_RULES, true);
}

export function maskPII(text: string, options: MaskPIIOptions = {}): PIIFilterResult {
  const rules =
    (options.contextRules ?? contextRulesEnabled()) ? RULES_WITH_CONTEXT : RULES_WITHOUT_CONTEXT;
  const detections: Array<PIIDetection & { tag: string }> = [];

  for (const { type, tag, find } of rules) {
    for (const { start, end } of find(text)) {
      if (detections.some((taken) => rangesOverlap(start, end, taken.start, taken.end))) {
        continue;
      }
      detections.push({ type, start, end, original: text.slice(start, end), tag });
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

/** Quantos de cada tipo, para log — nunca o trecho mascarado. */
export function countDetectionsByType(
  detections: readonly PIIDetection[],
): Partial<Record<PIIType, number>> {
  const counts: Partial<Record<PIIType, number>> = {};
  for (const { type } of detections) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

/**
 * F0-D — texto livre opcional digitado pelo médico ou pela curadoria (nota de
 * uma recomendação, comentário de feedback, nota de triagem): vazio vira
 * `null`; o resto volta mascarado, pronto para gravar.
 */
export function maskFreeText(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return maskPII(trimmed).redacted;
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
