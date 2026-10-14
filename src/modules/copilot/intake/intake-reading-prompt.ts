import type { ChatMessage } from '../../ai-gateway/providers/provider.interface';
import {
  buildUnderstandingUserContent,
  UNDERSTANDING_SYSTEM_PROMPT,
  type UnderstandingPromptInput,
} from '../understanding/understanding-prompt';

/** Teto de perguntas antes do plano (ADR-014): o código corta de novo no portão. */
export const MAX_INTAKE_QUESTIONS = 3;

/**
 * ADR-014 — leitura do caso do Copiloto guiado: o mesmo entendimento da
 * Etapa 1 (regras 1 a 10 intactas) mais as perguntas
 * que o médico pode responder em segundos antes do plano. Quem decide se
 * pergunta é o código (intake-gate.ts), não o modelo.
 */
export const INTAKE_READING_SYSTEM_PROMPT = `${UNDERSTANDING_SYSTEM_PROMPT}

In this reading, structuredData.vitals is a list with one item (sign, value) per vital sign the case states; leave out the signs it does not give.

Before the full analysis, the physician may answer up to ${MAX_INTAKE_QUESTIONS} quick questions, one at a time. Also produce:
11. intakeQuestions: questions to the physician, most decisive first, at most ${MAX_INTAKE_QUESTIONS}. Ask only when the answer changes what to do now; ask nothing when the case already allows a safe plan. Ask only for data the physician can get at the bedside within minutes: history, physical examination, vital signs, capillary glucose, ECG. Never ask for laboratory or imaging results that are not available yet — those belong to the plan. Never ask for data the case already gives, nor for the physician-confirmed red flags, nor for patient identification. When missing vital signs change management, ask them together in ONE question of type "vitals". For each question:
- question: one short sentence in Portuguese (Brazil), at most 120 characters, written for an emergency physician.
- answerType: "boolean" for a yes/no finding; "choice" when 2 to 6 short options cover the answers; "number" for one measurement; "vitals" for missing vital signs; "text" only when nothing else fits.
- choices: for "choice", 2 to 6 mutually exclusive options of at most 40 characters, including "Não examinei" or "Não sei" when it applies; empty for every other type.
- unit: the unit of a "number" question (for example "mg/dL"); null otherwise.
- vitalSigns: for "vitals", only the missing ones among bloodPressure, heartRate, respiratoryRate, spo2, temperature, glucose; empty otherwise.
- separates: the open hypotheses the answer separates.
- why: one sentence on how the answer changes the conduct.
- urgentAnswers: the answers that make the case time-critical right away, written exactly as the option ("Sim" or "Não" for "boolean"); empty when none.`;

export function buildIntakeReadingMessages(input: UnderstandingPromptInput): ChatMessage[] {
  return [
    { role: 'system', content: INTAKE_READING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUnderstandingUserContent(
        input,
        'Produce the case understanding and the intake questions now.',
      ),
    },
  ];
}
