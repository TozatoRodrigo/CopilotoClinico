import type { KnowledgeCardClaimKind } from '../../../../shared/contracts/knowledge-cards';
import { formatCompact } from '../../../../shared/clinical-tools/numbers';
import { findDoseMentions } from '../../../copilot/guardrails/dose-detector';
import type { AnyCardDose, AnyCardFact } from '../any-card-draft';

/**
 * CC-405 — ajudas dos mapeadores: número como a tela das Ferramentas escreve
 * e dose estruturada tirada de uma linha de texto do ANY. Nada aqui reescreve
 * dose: quantidade, via e teto são pedaços literais da linha (a checagem de
 * citação confere), e o que não dá para separar com segurança fica só no
 * texto da afirmação, sem dose estruturada.
 */

/** "0,5", "40", "1,25": o `formatCompact` das Ferramentas. */
export function num(value: number, maxDecimals = 3): string {
  return formatCompact(value, maxDecimals);
}

/** Afirmação de uma linha só, cada uma citando a si mesma. */
export function fact(line: string, kind: KnowledgeCardClaimKind, dose?: AnyCardDose): AnyCardFact {
  return dose ? { line, kind, dose } : { line, kind };
}

/** Teto da afirmação (`text` ≤ 500 no zod do cartão), com folga. */
const MAX_LINE_CHARS = 480;

/**
 * Texto longo do ANY em linhas de até 480 letras, quebrando entre frases.
 * Frase sozinha maior que isso fica inteira e a checagem a recusa — melhor
 * recusar e mostrar no relatório do que cortar uma frase clínica no meio.
 */
export function splitSentences(text: string): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9])/u);
  const lines: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length <= MAX_LINE_CHARS || current === '') {
      current = joined;
    } else {
      lines.push(current);
      current = sentence;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Vias como o ANY escreve depois da quantidade ("0,2 mg/kg IV"). */
const ROUTE = /^(.*\d.*?)\s+((?:IV|EV|IM|VO|SC|IO|IN)(?:\/(?:IV|EV|IM|VO|SC|IO|IN))*)\b(.*)$/;

/** "0,2 mg/kg IV" → quantidade "0,2 mg/kg" e via "IV"; sem via, só a quantidade. */
export function splitRoute(value: string): { amount: string; route: string | null } {
  const match = ROUTE.exec(value.trim());
  if (!match?.[1] || !match[2]) return { amount: value.trim(), route: null };
  return { amount: match[1].trim(), route: match[2] };
}

/** "60 UI/kg (máx 4.000 UI)" → quantidade "60 UI/kg" e teto "4.000 UI". */
export function splitMax(value: string): { amount: string; maxDose: string | null } {
  const match = /^(.*?)\s*\(m[áa]x\.?\s+([^)]+)\)\s*$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return { amount: value.trim(), maxDose: null };
  return { amount: match[1].trim(), maxDose: match[2].trim() };
}

/** "5/5 min até máx 20 mg" → frequência "5/5 min" e teto "20 mg". */
export function splitRepeat(value: string): { frequency: string; maxDose: string | null } {
  const match = /^(.*?)\s+até\s+m[áa]x\.?\s+(.+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return { frequency: value.trim(), maxDose: null };
  return { frequency: match[1].trim(), maxDose: match[2].trim() };
}

/** Mesma normalização do detector de dose: posições batem com a linha original. */
function detectorNormalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Onde cada dose da linha começa e termina; vazio sem dose ou se a normalização mudar o tamanho. */
function doseSpans(text: string): Array<{ start: number; end: number }> {
  const mentions = findDoseMentions(text);
  const normalized = detectorNormalize(text);
  if (mentions.length === 0 || normalized.length !== text.length) return [];
  return mentions.flatMap((mention) => {
    const start = normalized.indexOf(mention);
    return start >= 0 ? [{ start, end: start + mention.length }] : [];
  });
}

const MAX_AMOUNT_CHARS = 80;

/** Rótulos que dizem limite, não quantidade a dar ("Máximo: 3-5 mg"). */
const LIMIT_LABEL = /^(?:m[áa]x|dose m[áa]xima|teto|limite)/i;
/** Diluição e reconstituição falam de volume de diluente, não de dose. */
const PREPARATION_TEXT = /^(?:diluir|reconstituir|preparo)\b/i;
/** O começo de uma faixa ou de um teto antes da primeira dose ("0,04 a ", "1-", "até "). */
const RANGE_PREFIX = /(?:\d+(?:,\d+)?\s*(?:a|-|–)\s*|até\s+)$/i;
const MAX_PREFIX = /m[áa]x\.?\s*$/i;

export interface LineDose {
  amount: string;
  route: string | null;
  frequency: string | null;
}

/**
 * Quantidade de uma linha de texto do ANY, como pedaço literal dela: sem o
 * rótulo antes de ": " (quando o rótulo não tem dose), a partir da primeira
 * dose (com o começo da faixa, "0,04 a 0,4 mg") e sem o comentário depois da
 * última (" — ", ". ", "; ", ", ", " (", " se ", " após "). A via logo depois da quantidade e o
 * "a cada …" viram campos próprios. Linha sem dose, de limite ("Máximo: …",
 * "(máx 7 mg/kg)"), de diluição ou que não cabe em 80 letras fica sem dose
 * estruturada.
 */
export function doseFromLine(line: string): LineDose | null {
  let text = line.trim().replace(/\.$/, '');
  if (findDoseMentions(text).length === 0) return null;

  // "Fomepizol — Ataque: 15 mg/kg IV": cada rótulo sem dose sai, um de cada vez.
  for (let colon = text.indexOf(': '); colon > 0; colon = text.indexOf(': ')) {
    const label = text.slice(0, colon);
    if (LIMIT_LABEL.test(label.replace(/^.*[—:]\s*/, ''))) return null;
    if (findDoseMentions(label).length > 0) break;
    text = text.slice(colon + 2);
  }
  if (PREPARATION_TEXT.test(text)) return null;

  const spans = doseSpans(text);
  if (spans.length > 0) {
    const first = Math.min(...spans.map((span) => span.start));
    const before = text.slice(0, first);
    if (MAX_PREFIX.test(before)) return null;
    text = text.slice(first - (RANGE_PREFIX.exec(before)?.[0].length ?? 0));
    const end = Math.max(...doseSpans(text).map((span) => span.end));
    const tail = text.slice(end);
    const cut = [' — ', '. ', '; ', ', ', ' (', ' se ', ' após ']
      .map((separator) => tail.indexOf(separator))
      .filter((index) => index >= 0);
    if (cut.length > 0) text = text.slice(0, end + Math.min(...cut));
  }
  text = text.trim();
  if (text.length > MAX_AMOUNT_CHARS || !/\d/.test(text)) return null;

  const { amount, route } = splitRoute(text);
  const every = /^(.*?\d.*?)\s+(a cada .+)$/i.exec(amount);
  return every?.[1] && every[2]
    ? { amount: every[1], route, frequency: every[2] }
    : { amount, route, frequency: null };
}

/**
 * Afirmação a partir de uma linha de texto: com dose estruturada quando a
 * linha tem uma quantidade separável, sem ela quando não tem.
 */
export function textFact(line: string, kind: KnowledgeCardClaimKind, drug: string): AnyCardFact {
  const dose = doseFromLine(line);
  return dose ? fact(line, kind, { drug, ...dose }) : fact(line, kind);
}

/**
 * Dose por padrão explícito, para texto em que a quantidade está no meio da
 * frase ("…repor 10 a 20 mEq de KCl por hora…"). O padrão diz onde está cada
 * campo (grupos `amount`, `route`, `frequency`, `max`); sem casamento, a
 * afirmação fica sem dose estruturada — o teste do mapeador acusa.
 */
export function patternFact(
  line: string,
  kind: KnowledgeCardClaimKind,
  drug: string,
  pattern: RegExp,
): AnyCardFact {
  const groups = pattern.exec(line)?.groups;
  if (!groups?.amount) return fact(line, kind);
  return fact(line, kind, {
    drug,
    amount: groups.amount,
    route: groups.route ?? null,
    frequency: groups.frequency ?? null,
    maxDose: groups.max ?? null,
  });
}
