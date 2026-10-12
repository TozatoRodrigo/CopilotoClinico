import type {
  BOOLEAN_ANSWER_CHOICES as ContractBooleanChoices,
  UNDERSTANDING_CORRECTION_QUESTION_ID as ContractCorrectionQuestionId,
} from "@contracts/clinical";
import type {
  ClarifyingQuestion,
  IntakeQuestion,
  VitalSign,
  VitalsAnswer,
} from "@/lib/types";

/**
 * ADR-014 — modelo de tela da conversa do caso. As perguntas de antes do
 * plano (leitura do caso) e as de depois (decisão) chegam em formatos
 * diferentes; a conversa mostra as duas do mesmo jeito, uma por vez.
 */

/**
 * Opções de toque de toda pergunta sim/não. Conferidas contra o contrato em
 * tempo de compilação; o import é só de tipo porque o build do web não
 * empacota código de ../src.
 */
export const BOOLEAN_CHOICES: typeof ContractBooleanChoices = ["Sim", "Não", "Não sei"];

/** Ver `UNDERSTANDING_CORRECTION_QUESTION_ID` no contrato. */
export const UNDERSTANDING_CORRECTION_QUESTION_ID: typeof ContractCorrectionQuestionId =
  "correcao-do-entendimento";

/**
 * UX-02 — questionId sintético do texto livre que o médico acrescenta ao
 * caso depois do plano. O backend usa o próprio id como rótulo no bloco
 * "P: … R: …" quando não acha pergunta com esse id.
 */
export const COMPLEMENT_QUESTION_ID = "Informações adicionais fornecidas pelo médico";

export type ConversationAnswerType = "choice" | "number" | "text" | "vitals";

export interface ConversationQuestion {
  id: string;
  question: string;
  why: string;
  separates: string[];
  answerType: ConversationAnswerType;
  choices: string[];
  unit: string | null;
  vitalSigns: VitalSign[];
}

/** Sim/não é escolha com as opções fixas que o servidor já mandou. */
const INTAKE_ANSWER_TYPE: Record<IntakeQuestion["answerType"], ConversationAnswerType> = {
  boolean: "choice",
  choice: "choice",
  number: "number",
  text: "text",
  vitals: "vitals",
};

export function fromIntakeQuestion(question: IntakeQuestion): ConversationQuestion {
  return {
    id: question.id,
    question: question.question,
    why: question.why,
    separates: question.separates,
    answerType: INTAKE_ANSWER_TYPE[question.answerType],
    choices: question.choices,
    unit: question.unit,
    vitalSigns: question.vitalSigns,
  };
}

/**
 * Pergunta da decisão, depois do plano. Sim/não ganha "Não sei" e vira
 * escolha; escolha sem opções vira texto (o médico responde no campo).
 */
export function fromClarifyingQuestion(question: ClarifyingQuestion): ConversationQuestion {
  const choices =
    question.expectedAnswerType === "boolean" ? [...BOOLEAN_CHOICES] : (question.choices ?? []);
  const answerType: ConversationAnswerType =
    question.expectedAnswerType === "number"
      ? "number"
      : choices.length >= 2
        ? "choice"
        : "text";
  return {
    id: question.id,
    question: question.question,
    why: question.why,
    separates: question.separates ?? [],
    answerType,
    choices: answerType === "choice" ? choices : [],
    unit: null,
    vitalSigns: [],
  };
}

/** Faixas plausíveis — as mesmas do servidor (intake.schemas.ts). */
const VITAL_RANGES: Record<Exclude<keyof VitalsAnswer, "systolicBp" | "diastolicBp">, [number, number]> = {
  heartRate: [10, 300],
  respiratoryRate: [2, 80],
  spo2: [30, 100],
  temperature: [25, 45],
  glucose: [10, 2000],
};

const EMPTY_VITALS: VitalsAnswer = {
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

const BLOOD_PRESSURE = /^(\d{2,3})\s*[x×/]\s*(\d{2,3})$/i;

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function inRange(value: number, [min, max]: [number, number]): boolean {
  return value >= min && value <= max;
}

export type VitalsInput = Partial<Record<VitalSign, string>>;

export type VitalsParse =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "valid"; vitals: VitalsAnswer };

/**
 * Sinais vitais digitados à beira do leito: PA como "120/80" (ou "120x80"),
 * o resto só número, vírgula ou ponto decimal. Campo vazio = não informado.
 */
export function parseVitals(input: VitalsInput): VitalsParse {
  const vitals: VitalsAnswer = { ...EMPTY_VITALS };
  let filled = 0;

  for (const [sign, raw] of Object.entries(input) as Array<[VitalSign, string | undefined]>) {
    if (!raw?.trim()) continue;
    filled++;
    if (sign === "bloodPressure") {
      const match = BLOOD_PRESSURE.exec(raw.trim());
      if (!match) return { kind: "invalid" };
      const systolic = Number(match[1]);
      const diastolic = Number(match[2]);
      if (!inRange(systolic, [20, 300]) || !inRange(diastolic, [10, 200])) return { kind: "invalid" };
      vitals.systolicBp = systolic;
      vitals.diastolicBp = diastolic;
      continue;
    }
    const value = parseNumber(raw);
    if (value === null || !inRange(value, VITAL_RANGES[sign])) return { kind: "invalid" };
    vitals[sign] = value;
  }

  return filled === 0 ? { kind: "empty" } : { kind: "valid", vitals };
}

/** Número de uma pergunta `number`, com vírgula ou ponto decimal. */
export function parseAnswerNumber(raw: string): number | null {
  return parseNumber(raw);
}
