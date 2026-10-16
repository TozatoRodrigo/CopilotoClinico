import { z } from 'zod';
import {
  INTAKE_PATHS,
  PS_SYNDROMES,
  type CaseUnderstanding,
  type PsSyndrome,
} from '../../../src/shared/contracts/clinical';
import { READING_SEVERITIES, type ClinicalCase, type ReadingSeverity } from '../case.schema';
import type { FunnelExchange, ResultRow } from '../records';

/**
 * CC-106 — nota determinística da conversa antes do plano (Copiloto guiado,
 * ADR-014), no modo afunilamento: se a leitura do caso pegou a síndrome e a
 * gravidade, quantas voltas até o plano, quanto tempo até a primeira pergunta,
 * e se as perguntas alcançaram os fatos do roteiro — inclusive o essencial.
 *
 * Tudo aqui sai do que a conversa gravou e dos ids de fato que o médico
 * simulado devolve (conferidos contra o roteiro). Só o que pede leitura de
 * texto — a pergunta é pertinente? pediu dado que a abertura já dava? — fica
 * com o juiz (`conversation` no veredito).
 */

/** Gravidade da leitura: instabilidade manda direto ao plano; tempo-crítico pergunta uma vez. */
export function readingSeverity(
  understanding: Pick<CaseUnderstanding, 'instability' | 'timeCritical'>,
): ReadingSeverity {
  if (understanding.instability.present) return 'unstable';
  return understanding.timeCritical ? 'time_critical' : 'stable';
}

export function severityRank(severity: ReadingSeverity): number {
  return READING_SEVERITIES.indexOf(severity);
}

/** Síndromes de PS aceitas na leitura: as do caso ou, sem elas, `tags[0]`. */
export function expectedReadingSyndromes(clinicalCase: ClinicalCase): PsSyndrome[] {
  return clinicalCase.expected.conversation?.syndromes ?? [clinicalCase.tags[0]];
}

/**
 * Gravidade que a leitura não pode subestimar: a do caso ou, no caso crítico
 * (tempo-dependente por definição), `time_critical`. `null` sem expectativa.
 */
export function expectedReadingSeverity(clinicalCase: ClinicalCase): ReadingSeverity | null {
  return (
    clinicalCase.expected.conversation?.severity ?? (clinicalCase.critical ? 'time_critical' : null)
  );
}

/** A conversa inteira, na ordem: as perguntas antes do 1º plano e as rodadas do plano. */
export function conversationExchanges(row: Pick<ResultRow, 'intake' | 'turns'>): FunnelExchange[] {
  return [...(row.intake?.exchanges ?? []), ...row.turns.flatMap((turn) => turn.exchanges)];
}

export const ConversationGradeSchema = z.object({
  path: z.enum(INTAKE_PATHS),
  /** Perguntas respondidas antes do 1º plano — na tela, uma volta cada. */
  questionsBeforePlan: z.number().int(),
  /** Voltas até o plano avaliado: as perguntas antes do 1º plano e as rodadas de resposta ao plano. */
  roundsToFinalPlan: z.number().int(),
  firstQuestionMs: z.number().nullable(),
  /** `null` sem leitura válida (leitura desligada, que falhou ou passou do teto). */
  syndrome: z
    .object({
      read: z.enum(PS_SYNDROMES),
      expected: z.array(z.enum(PS_SYNDROMES)),
      pass: z.boolean(),
    })
    .nullable(),
  /** `pass`: não subestimou. `null` sem leitura válida ou sem gravidade esperada. */
  severity: z
    .object({
      read: z.enum(READING_SEVERITIES),
      expected: z.enum(READING_SEVERITIES),
      pass: z.boolean(),
    })
    .nullable(),
  /** Perguntas antes do plano cuja resposta revelou algum fato do roteiro. */
  questionsWithScriptFact: z.number().int(),
  /** Os fatos `key` do roteiro e os que as perguntas antes do 1º plano revelaram. */
  keyFacts: z.array(z.string()),
  keyFactsBeforePlan: z.array(z.string()),
  /**
   * As `expected.conversation.essentialQuestions` (pelo `about`) que nenhuma
   * pergunta antes do plano fez; `null` quando o caso não as declara.
   */
  missingEssentialQuestions: z.array(z.string()).nullable(),
});

export type ConversationGrade = z.infer<typeof ConversationGradeSchema>;

/** `null` fora do afunilamento e nas execuções anteriores ao CC-106, que não têm conversa. */
export function gradeConversation(
  clinicalCase: ClinicalCase,
  row: Pick<ResultRow, 'mode' | 'intake' | 'turns'>,
): ConversationGrade | null {
  const { intake } = row;
  if (row.mode !== 'funnel' || !intake) return null;

  const keyFacts =
    clinicalCase.input.funnel?.script.filter((fact) => fact.key).map((fact) => fact.id) ?? [];
  const revealedBeforePlan = new Set(intake.exchanges.flatMap((exchange) => exchange.factIds));
  const planRounds = row.turns.filter((turn) => turn.exchanges.length > 0).length;
  const essential = clinicalCase.expected.conversation?.essentialQuestions;
  const { understanding } = intake;
  const expectedSyndromes = expectedReadingSyndromes(clinicalCase);
  const expectedSeverity = expectedReadingSeverity(clinicalCase);
  const readSeverity = understanding ? readingSeverity(understanding) : null;

  return {
    path: intake.path,
    questionsBeforePlan: intake.exchanges.length,
    roundsToFinalPlan: intake.exchanges.length + planRounds,
    firstQuestionMs: intake.firstQuestionMs,
    syndrome: understanding
      ? {
          read: understanding.syndrome,
          expected: expectedSyndromes,
          pass: expectedSyndromes.includes(understanding.syndrome),
        }
      : null,
    severity:
      readSeverity && expectedSeverity
        ? {
            read: readSeverity,
            expected: expectedSeverity,
            pass: severityRank(readSeverity) >= severityRank(expectedSeverity),
          }
        : null,
    questionsWithScriptFact: intake.exchanges.filter((exchange) => exchange.factIds.length > 0)
      .length,
    keyFacts,
    keyFactsBeforePlan: keyFacts.filter((id) => revealedBeforePlan.has(id)),
    missingEssentialQuestions: essential
      ? essential
          .filter((question) => !question.factIds.some((id) => revealedBeforePlan.has(id)))
          .map((question) => question.about)
      : null,
  };
}
