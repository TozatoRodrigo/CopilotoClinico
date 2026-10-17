import { NAME_WORD } from './person-names';
import type { PIIType } from './pii-filter';
import { protectClinicalTerms, type TextSpan } from './protected-clinical-terms';

/**
 * CC-203 — o que o modelo local de de-identificação (services/deid, ADR-020)
 * devolve: só entidades que identificam a pessoa. Idade, cidade, quantidade e
 * data comum o serviço já descarta, porque são dado clínico.
 */
export const MODEL_ENTITY_LABELS = [
  'FIRSTNAME',
  'MIDDLENAME',
  'LASTNAME',
  'ACCOUNTNAME',
  'STREET',
  'BUILDINGNUMBER',
  'ZIPCODE',
  'PHONE',
  'EMAIL',
  'SSN',
  'DATEOFBIRTH',
  'IBAN',
  'CREDITCARD',
  'MASKEDNUMBER',
] as const;
export type ModelEntityLabel = (typeof MODEL_ENTITY_LABELS)[number];

/** Trecho marcado pelo modelo, em offsets UTF-16 (os do JavaScript). */
export interface ModelEntity extends TextSpan {
  label: ModelEntityLabel;
  score: number;
}

const NAME = { type: 'name', tag: '[NOME]' } as const;
const ADDRESS = { type: 'address', tag: '[ENDERECO]' } as const;
const DOCUMENT = { type: 'document', tag: '[REDACTED_DOC]' } as const;

const MASK_BY_LABEL: Record<ModelEntityLabel, { type: PIIType; tag: string }> = {
  FIRSTNAME: NAME,
  MIDDLENAME: NAME,
  LASTNAME: NAME,
  ACCOUNTNAME: NAME,
  STREET: ADDRESS,
  BUILDINGNUMBER: ADDRESS,
  ZIPCODE: { type: 'cep', tag: '[REDACTED_CEP]' },
  PHONE: { type: 'phone', tag: '[REDACTED_PHONE]' },
  EMAIL: { type: 'email', tag: '[REDACTED_EMAIL]' },
  SSN: DOCUMENT,
  DATEOFBIRTH: { type: 'date', tag: '[REDACTED_DATE]' },
  IBAN: DOCUMENT,
  CREDITCARD: DOCUMENT,
  MASKEDNUMBER: DOCUMENT,
};

/**
 * Rótulo que a regex ou a redação do patientRef já puseram. O modelo roda
 * depois da regex e às vezes marca o "NOME" de "[NOME]" como nome.
 */
const REDACTION_TAG = /\[(?:NOME|ENDERECO|REDACTED_[A-Z_]+|PATIENT_REF_REDACTED)\]/g;

/** Nome não atravessa linha: "Maria\nRefere dor" não leva o "Refere". */
const SAME_LINE_SPACE = String.raw`[^\S\r\n]+`;

/**
 * Sobrenome que o modelo deixou logo depois do nome que ele marcou ("Paulo
 * Nogueira" virava "[NOME] Nogueira": Nogueira, Nascimento e Dias também são
 * palavra). Mesma regra do nome depois de tratamento (CC-206): palavras com
 * forma de nome, com "da/de/do" no meio; o epônimo protegido sai depois.
 */
const SURNAMES_AFTER = new RegExp(
  String.raw`(?:${SAME_LINE_SPACE}(?:(?:da|de|do|das|dos)${SAME_LINE_SPACE})?${NAME_WORD})+(?![\p{L}\p{N}])`,
  'uy',
);

/**
 * Prenome que o modelo deixou logo antes do nome que ele marcou: em "(João
 * Pedro da Silva)" e "que Luiz Fernando Rodrigues" o primeiro nome do nome
 * composto fica abaixo do limiar. Mesma forma de nome do SURNAMES_AFTER.
 */
const NAMES_BEFORE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${NAME_WORD}${SAME_LINE_SPACE}(?:(?:da|de|do|das|dos)${SAME_LINE_SPACE})?)+$`,
  'u',
);
const NAME_WORDS = new RegExp(NAME_WORD, 'gu');
/** Quanto olhar para trás atrás de prenome: bem mais que um nome composto. */
const NAMES_BEFORE_WINDOW = 80;
/** Fim de frase ou de linha (ou só espaço) nos caracteres logo antes. */
const AFTER_SENTENCE_END = /(?:^|[.!?;:]["'”’)]?|\n)\s*$/u;

/** Entre dois trechos do mesmo tipo, o que deixa juntar num rótulo só ("Ana Paula", "Rua X, 12"). */
const SAME_TYPE_GAP = /^[\s,]*(?:(?:da|de|do|das|dos|e)\s+)?$/iu;

export interface ModelMaskResult {
  redacted: string;
  /** Tipo de cada trecho mascarado pelo modelo, para a contagem no log. */
  maskedTypes: PIIType[];
}

interface TypedSpan extends TextSpan {
  type: PIIType;
  tag: string;
}

function subtract(span: TextSpan, guards: readonly TextSpan[]): TextSpan[] {
  let pieces: TextSpan[] = [{ start: span.start, end: span.end }];
  for (const guard of guards) {
    pieces = pieces.flatMap((piece) =>
      guard.end <= piece.start || guard.start >= piece.end
        ? [piece]
        : [
            { start: piece.start, end: guard.start },
            { start: guard.end, end: piece.end },
          ].filter(({ start, end }) => end > start),
    );
  }
  return pieces;
}

function withSurnames(text: string, span: TypedSpan): TypedSpan {
  SURNAMES_AFTER.lastIndex = span.end;
  const surnames = SURNAMES_AFTER.exec(text);
  return surnames ? { ...span, end: span.end + surnames[0].length } : span;
}

/** Começo de frase ou de linha: a palavra maiúscula ali pode ser "Paciente", "Refere", "Masculino". */
function atSentenceStart(text: string, index: number): boolean {
  return AFTER_SENTENCE_END.test(text.slice(Math.max(0, index - 8), index));
}

function withNamesBefore(text: string, span: TypedSpan): TypedSpan {
  const windowStart = Math.max(0, span.start - NAMES_BEFORE_WINDOW);
  const run = NAMES_BEFORE.exec(text.slice(windowStart, span.start));
  if (!run) return span;
  const runStart = windowStart + run.index;
  if (!atSentenceStart(text, runStart)) return { ...span, start: runStart };
  // No começo de frase a primeira palavra fica: é mais vezes "Paciente" que nome.
  const second = [...run[0].matchAll(NAME_WORDS)][1];
  return second ? { ...span, start: runStart + second.index } : span;
}

/** Nome que o modelo marcou pela metade ganha as palavras com forma de nome dos dois lados. */
function withWholeName(text: string, span: TypedSpan): TypedSpan {
  return span.type === 'name' ? withNamesBefore(text, withSurnames(text, span)) : span;
}

/**
 * Ordena e junta: trechos que se sobrepõem viram um (fica o rótulo do
 * primeiro; trocar dois rótulos no mesmo lugar corromperia o texto), e
 * vizinhos do mesmo tipo também.
 */
function mergeSpans(text: string, spans: readonly TypedSpan[]): TypedSpan[] {
  const merged: TypedSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = merged[merged.length - 1];
    const joins =
      previous !== undefined &&
      (span.start < previous.end ||
        (previous.type === span.type && SAME_TYPE_GAP.test(text.slice(previous.end, span.start))));
    if (previous && joins) {
      merged[merged.length - 1] = { ...previous, end: Math.max(previous.end, span.end) };
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/**
 * Mascara o que o modelo marcou no texto que a regex já mascarou (CC-203):
 * nada do que a regex rotulou é tocado, e o termo clínico protegido (CC-202)
 * sai do trecho antes de mascarar — "Kernig" marcado como sobrenome fica.
 * Trecho fora do texto é ignorado: o serviço é outro processo, e um offset
 * errado não pode cortar o relato no meio.
 */
export function maskModelEntities(text: string, entities: readonly ModelEntity[]): ModelMaskResult {
  const tags = [...text.matchAll(REDACTION_TAG)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const candidates = entities
    .filter(
      ({ start, end }) =>
        Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end,
    )
    .filter(({ end }) => end <= text.length)
    .flatMap((entity) =>
      subtract(entity, tags).map((piece) =>
        withWholeName(text, { ...piece, ...MASK_BY_LABEL[entity.label] }),
      ),
    );
  const spans = mergeSpans(text, protectClinicalTerms(text, candidates));

  let redacted = '';
  let cursor = 0;
  for (const span of spans) {
    redacted += text.slice(cursor, span.start) + span.tag;
    cursor = span.end;
  }
  redacted += text.slice(cursor);
  return { redacted, maskedTypes: spans.map(({ type }) => type) };
}
