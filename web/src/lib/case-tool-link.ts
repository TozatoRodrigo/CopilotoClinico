import { formatCompact } from '@clinical-tools/numbers';
import {
  calculatorCasePrefill,
  caseFieldCount,
  caseWeightText,
} from '@clinical-tools/case-prefill';
import { caseToolHref, isPediatricAge } from '@clinical-tools/case-suggestions';
import type { CalculatorDefinition } from '@clinical-tools/calculator';
import { getCalculator } from '@clinical-tools/registry';
import {
  ADULT_WEIGHT_KEY,
  CASE_ATTACHMENTS_KEY_PREFIX,
  CASE_LINK_KEY_PREFIX,
  CASE_PENDING_KEY,
  readToolSession,
  removeToolSession,
  writeToolSession,
} from '@/lib/tool-session';
import type { TOOL_RESULT_QUESTION_ID as ContractToolResultQuestionId } from '@contracts/clinical';
import type {
  CaseToolFacts,
  CaseToolSuggestion,
  CaseToolTarget,
  ClarifyingAnswer,
} from '@/lib/types';

/**
 * CC-332 — a ida do plano do Copiloto para uma ferramenta e a volta do
 * resultado para o caso, pela sessão da aba (tool-session.ts). Nada de dado
 * clínico no endereço: ele leva só a ferramenta e um token opaco
 * (`?caso=<token>`), e o token aponta para o elo guardado na aba.
 *
 * - Abrir: grava o elo (caso, ferramenta, números do caso), o aviso de
 *   "acabei de abrir pelo caso" (2 min) e o preenchimento das telas que já
 *   guardam estado na aba (peso adulto, respostas da calculadora).
 * - Na ferramenta: o elo dá o "Voltar ao caso", a marca "vindo do caso" e o
 *   "Anexar ao caso".
 * - Anexar: o texto de prontuário da ferramenta espera, na aba, a próxima
 *   reanálise do caso, e entra nela como resposta do médico.
 */

/** Ver `TOOL_RESULT_QUESTION_ID` no contrato (o web não empacota código de ../src/shared/contracts). */
export const TOOL_RESULT_QUESTION_ID: typeof ContractToolResultQuestionId =
  'resultado-de-ferramenta';

export interface CaseToolLink {
  token: string;
  encounterId: string;
  /** Rodada do plano que sugeriu a ferramenta. */
  interactionId: string;
  target: CaseToolTarget;
  /** Nome da ferramenta, para o "Anexar" e o "Voltar". */
  name: string;
  facts: CaseToolFacts;
}

const FACT_KEYS = [
  'ageYears',
  'weightKg',
  'systolicBp',
  'diastolicBp',
  'heartRate',
  'respiratoryRate',
  'spo2',
  'temperature',
  'glucose',
] as const satisfies readonly Exclude<keyof CaseToolFacts, 'sex'>[];

const TOKEN_PATTERN = /^[a-z]{16}$/;
const ID_PATTERN = /^[\w-]{1,64}$/;

/**
 * Token opaco da ida: 16 letras sorteadas, sem dígito — um número do caso
 * nunca aparece no endereço, nem por acaso.
 */
export function newCaseToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFacts(value: unknown): CaseToolFacts | null {
  if (!isRecord(value)) return null;
  const sex = value.sex;
  if (sex !== null && sex !== 'F' && sex !== 'M') return null;
  const facts: Record<string, number | null> = {};
  for (const key of FACT_KEYS) {
    const fact = value[key];
    if (fact !== null && (typeof fact !== 'number' || !Number.isFinite(fact))) return null;
    facts[key] = fact;
  }
  return { ...(facts as Omit<CaseToolFacts, 'sex'>), sex };
}

function parseTarget(value: unknown): CaseToolTarget | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'calculator' && typeof value.calculatorId === 'string') {
    return ID_PATTERN.test(value.calculatorId)
      ? { kind: 'calculator', calculatorId: value.calculatorId }
      : null;
  }
  if (value.kind !== 'tool' || typeof value.toolId !== 'string' || !ID_PATTERN.test(value.toolId)) {
    return null;
  }
  if (value.query === undefined) return { kind: 'tool', toolId: value.toolId };
  if (!isRecord(value.query)) return null;
  const query = Object.entries(value.query);
  if (!query.every(([, param]) => typeof param === 'string')) return null;
  return {
    kind: 'tool',
    toolId: value.toolId,
    query: Object.fromEntries(query) as Record<string, string>,
  };
}

/** Lê sem confiar no formato: elo editado à mão ou de outra versão vira `null`. */
export function parseCaseToolLink(value: unknown): CaseToolLink | null {
  if (!isRecord(value)) return null;
  const { token, encounterId, interactionId, name } = value;
  const target = parseTarget(value.target);
  const facts = parseFacts(value.facts);
  if (
    typeof token !== 'string' ||
    !TOKEN_PATTERN.test(token) ||
    typeof encounterId !== 'string' ||
    !ID_PATTERN.test(encounterId) ||
    typeof interactionId !== 'string' ||
    typeof name !== 'string' ||
    !target ||
    !facts
  ) {
    return null;
  }
  return { token, encounterId, interactionId, target, name, facts };
}

export function readCaseLink(token: string, now = Date.now()): CaseToolLink | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const link = readToolSession(CASE_LINK_KEY_PREFIX + token, parseCaseToolLink, now);
  return link?.token === token ? link : null;
}

function parsePending(value: unknown): string | null {
  return isRecord(value) && typeof value.token === 'string' ? value.token : null;
}

/**
 * O elo da ferramenta que acabou de ser aberta pelo plano, já na primeira
 * renderização: o endereço só chega à tela depois, num efeito, e o roteiro
 * que guarda estado só na memória (Pediatria, calculadoras de dentro do TEP)
 * precisa do caso ao montar.
 */
export function readPendingCaseLink(now = Date.now()): CaseToolLink | null {
  const token = readToolSession(CASE_PENDING_KEY, parsePending, now);
  return token ? readCaseLink(token, now) : null;
}

export function clearPendingCaseLink(): void {
  removeToolSession(CASE_PENDING_KEY);
}

/** Campos que a calculadora já abre preenchidos (FiO₂ 21%), como na tela. */
function defaultInputs(definition: CalculatorDefinition): Record<string, string> {
  if (definition.kind !== 'formula') return {};
  return Object.fromEntries(
    definition.inputs.flatMap((input) =>
      input.defaultValue === undefined ? [] : [[input.id, formatCompact(input.defaultValue)]],
    ),
  );
}

/**
 * Preenche, na aba, o que as telas leem ao montar. O peso adulto é de todas
 * as ferramentas adultas: abrir pelo caso troca o peso que estava ali pelo
 * do caso, ou o apaga quando o caso não diz o peso — o peso do paciente
 * anterior nunca entra numa conta deste. A calculadora sugerida recomeça com
 * as respostas que o caso dá.
 */
export function applyCasePrefill(target: CaseToolTarget, facts: CaseToolFacts, now = Date.now()) {
  if (!isPediatricAge(facts.ageYears)) {
    const weight = caseWeightText(facts, 'adulto');
    if (weight) writeToolSession(ADULT_WEIGHT_KEY, weight, now);
    else removeToolSession(ADULT_WEIGHT_KEY);
  }
  if (target.kind === 'calculator') {
    const definition = getCalculator(target.calculatorId);
    if (!definition) return;
    const prefill = calculatorCasePrefill(definition, facts);
    writeToolSession(
      `calculadora:${definition.id}`,
      { items: prefill.items, inputs: { ...defaultInputs(definition), ...prefill.inputs } },
      now,
    );
  }
}

export interface OpenToolFromCase {
  encounterId: string;
  interactionId: string;
  suggestion: CaseToolSuggestion;
  facts: CaseToolFacts;
}

/** Prepara a ida e devolve o endereço: `/ferramentas/<id>?caso=<token>`. */
export function openToolFromCase(
  { encounterId, interactionId, suggestion, facts }: OpenToolFromCase,
  now = Date.now(),
): string {
  const token = newCaseToken();
  const link: CaseToolLink = {
    token,
    encounterId,
    interactionId,
    target: suggestion.target,
    name: suggestion.name,
    facts,
  };
  writeToolSession(CASE_LINK_KEY_PREFIX + token, link, now);
  writeToolSession(CASE_PENDING_KEY, { token }, now);
  applyCasePrefill(suggestion.target, facts, now);
  return caseToolHref(suggestion.target, token);
}

/** Quantos campos a ferramenta abre já preenchidos com o caso (para o botão dizer). */
export const prefilledFieldCount = caseFieldCount;

// ── Resultado anexado ao caso ────────────────────────────────────────────

/** Mais que isso numa rodada é ruído para a reanálise. */
export const MAX_CASE_ATTACHMENTS = 5;
/** Texto de prontuário de uma ferramenta cabe nisso com folga; o resto não entra na análise. */
export const MAX_ATTACHMENT_LENGTH = 3000;

export interface CaseToolAttachment {
  id: string;
  /** Nome da ferramenta ("NIHSS"). */
  toolName: string;
  /** O texto de prontuário que a ferramenta gerou (sem dado de identificação). */
  text: string;
  attachedAt: number;
}

function parseAttachments(value: unknown): CaseToolAttachment[] | null {
  if (!Array.isArray(value)) return null;
  const attachments = value.filter(
    (item): item is CaseToolAttachment =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.toolName === 'string' &&
      typeof item.text === 'string' &&
      typeof item.attachedAt === 'number',
  );
  return attachments.length === value.length ? attachments : null;
}

const attachmentsKey = (encounterId: string) => CASE_ATTACHMENTS_KEY_PREFIX + encounterId;

export function readCaseAttachments(encounterId: string, now = Date.now()): CaseToolAttachment[] {
  return readToolSession(attachmentsKey(encounterId), parseAttachments, now) ?? [];
}

function writeAttachments(encounterId: string, attachments: CaseToolAttachment[], now: number) {
  if (attachments.length === 0) removeToolSession(attachmentsKey(encounterId));
  else writeToolSession(attachmentsKey(encounterId), attachments, now);
}

/**
 * Anexa o resultado ao caso. O mesmo texto duas vezes conta uma; passando
 * do teto, sai o mais antigo.
 */
export function attachToCase(
  encounterId: string,
  { toolName, text }: { toolName: string; text: string },
  now = Date.now(),
): CaseToolAttachment[] {
  const trimmed = text.trim().slice(0, MAX_ATTACHMENT_LENGTH);
  const current = readCaseAttachments(encounterId, now).filter((item) => item.text !== trimmed);
  const next = [...current, { id: newCaseToken(), toolName, text: trimmed, attachedAt: now }].slice(
    -MAX_CASE_ATTACHMENTS,
  );
  writeAttachments(encounterId, next, now);
  return next;
}

export function isAttachedToCase(encounterId: string, text: string, now = Date.now()): boolean {
  const trimmed = text.trim().slice(0, MAX_ATTACHMENT_LENGTH);
  return readCaseAttachments(encounterId, now).some((item) => item.text === trimmed);
}

/** Tira do caso os anexos com estes ids (os que já entraram numa reanálise, ou o removido). */
export function removeCaseAttachments(
  encounterId: string,
  ids: readonly string[],
  now = Date.now(),
): CaseToolAttachment[] {
  const next = readCaseAttachments(encounterId, now).filter((item) => !ids.includes(item.id));
  writeAttachments(encounterId, next, now);
  return next;
}

/**
 * A resposta que leva o anexo à reanálise. O backend rotula o
 * `TOOL_RESULT_QUESTION_ID` como "Resultado de ferramenta calculado pelo
 * médico"; o nome da ferramenta vai na primeira linha quando o texto não
 * começa por ele.
 */
export function attachmentAnswer(attachment: CaseToolAttachment): ClarifyingAnswer {
  const { toolName, text } = attachment;
  return {
    questionId: TOOL_RESULT_QUESTION_ID,
    answer: text.startsWith(toolName) ? text : `${toolName}\n${text}`,
  };
}
