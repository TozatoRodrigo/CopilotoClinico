import type { IntakeAnswerValue, VitalsAnswer } from '../../../shared/contracts/clinical';
import { normalize } from '../guardrails/output-validator';
import type { IntakeQuestionRecord } from './intake-gate';

/**
 * ADR-014 — resposta que torna o caso urgente encerra as perguntas: paciente
 * instável não espera a próxima pergunta, venha a gravidade de uma opção
 * marcada pela leitura do caso ou dos sinais vitais que o médico digitou.
 */

/**
 * Os mesmos sinais de ameaça imediata da regra 2 do entendimento, em números:
 * hipotensão, hipoxemia, taqui/bradicardia extremas, taquipneia e
 * hipoglicemia (tratamento agora).
 */
const UNSTABLE_VITALS: ReadonlyArray<(vitals: VitalsAnswer) => boolean> = [
  (vitals) => vitals.systolicBp !== null && vitals.systolicBp < 90,
  (vitals) => vitals.spo2 !== null && vitals.spo2 < 90,
  (vitals) => vitals.heartRate !== null && (vitals.heartRate > 130 || vitals.heartRate < 40),
  (vitals) => vitals.respiratoryRate !== null && vitals.respiratoryRate > 30,
  (vitals) => vitals.glucose !== null && vitals.glucose < 60,
];

export function vitalsShowInstability(vitals: VitalsAnswer): boolean {
  return UNSTABLE_VITALS.some((unstable) => unstable(vitals));
}

/** Sem acento, sem caixa e sem pontuação: o ditado devolve "Sim." e o médico digita "sim, há 2h". */
function comparable(value: string): string {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A opção que uma resposta livre escolheu: igual à opção ou começando por ela
 * ("sim, há 2h" → "Sim"). Vence a opção mais longa, para "não sei" não virar
 * "Não".
 */
export function matchOption(answer: string, options: readonly string[]): string | null {
  const text = comparable(answer);
  const matches = options.filter((option) => {
    const candidate = comparable(option);
    return candidate.length > 0 && (text === candidate || text.startsWith(`${candidate} `));
  });
  return matches.sort((left, right) => right.length - left.length)[0] ?? null;
}

export function isUrgentAnswer(
  question: IntakeQuestionRecord | undefined,
  value: IntakeAnswerValue,
  answerText: string,
): boolean {
  if (typeof value === 'object') return vitalsShowInstability(value);
  if (!question || question.urgentAnswers.length === 0) return false;
  const option = matchOption(answerText, question.choices);
  return option !== null && question.urgentAnswers.includes(option);
}
