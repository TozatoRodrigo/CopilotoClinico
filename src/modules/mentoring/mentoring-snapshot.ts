import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { maskPII } from '../copilot/guardrails/pii-filter';
import { redactPatientRef } from '../copilot/guardrails/clinical-text-screening';
import type { EncounterContext, MentoringCaseSnapshot } from '../../shared/contracts/clinical';

/**
 * CC-707 — o caso que sai do médico para os mentores.
 *
 * Tudo o que vira texto passa pela máscara do projeto (`maskPII`) e pela
 * redação do patientRef, mesmo o que já foi gravado redigido: `inputRedacted`
 * foi mascarado por uma versão anterior do filtro, e o plano da IA pode
 * repetir um dado que o médico digitou. Mascarar de novo é barato; deixar
 * passar um CPF para outro médico não é.
 *
 * Só entra o que ajuda a discutir a conduta: o texto do caso, o contexto do
 * serviço, as hipóteses, os sinais de alarme, as condutas e as perguntas em
 * aberto. Fontes, trechos citados e o raciocínio interno ficam de fora.
 */

/**
 * Leitura defensiva do `rawOutput` (JSON gravado sem re-validação). Linha de
 * falha de validação (`{ raw, validationErrors }`) não tem plano: não serve.
 */
const analysisOutputSchema = z.object({
  differentials: z
    .array(z.object({ hypothesis: z.string(), cannotMiss: z.boolean().catch(false) }))
    .catch([]),
  redFlags: z.array(z.object({ finding: z.string(), severity: z.string().catch('') })).catch([]),
  recommendations: z.array(z.object({ action: z.string(), preliminary: z.boolean().catch(false) })),
  clarifyingQuestions: z.array(z.object({ question: z.string() })).catch([]),
  uncertainty: z.boolean().catch(false),
});

type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

const encounterContextSchema = z.object({
  hasCT: z.boolean().catch(false),
  isSus: z.boolean().catch(false),
  hasLab: z.boolean().catch(false),
  hasICU: z.boolean().catch(false),
});

export interface SnapshotSourceInteraction {
  id: string;
  inputRedacted: string | null;
  rawOutput: Prisma.JsonValue;
  createdAt: Date;
}

/** A análise mais recente que produziu um plano (as falhas de validação ficam de fora). */
export function pickLatestPlan<T extends SnapshotSourceInteraction>(
  newestFirst: readonly T[],
): { interaction: T; output: AnalysisOutput } | null {
  for (const interaction of newestFirst) {
    const parsed = analysisOutputSchema.safeParse(interaction.rawOutput);
    if (parsed.success) return { interaction, output: parsed.data };
  }
  return null;
}

/** Máscara do projeto + patientRef, no texto que sai para outro médico. */
export function maskForMentor(text: string, patientRef: string | null): string {
  return redactPatientRef(maskPII(text).redacted, patientRef);
}

/** Texto livre opcional (dúvida do médico, resposta do mentor): vazio vira `null`. */
export function maskFreeTextForMentor(
  text: string | null | undefined,
  patientRef: string | null,
): string | null {
  const trimmed = text?.trim();
  return trimmed ? maskForMentor(trimmed, patientRef) : null;
}

export interface BuildSnapshotInput {
  vertical: string;
  context: Prisma.JsonValue | null;
  patientRef: string | null;
  interaction: SnapshotSourceInteraction;
  output: AnalysisOutput;
}

export function buildMentoringCaseSnapshot(input: BuildSnapshotInput): MentoringCaseSnapshot {
  const mask = (text: string) => maskForMentor(text, input.patientRef);
  const { output } = input;
  const context = encounterContextSchema.safeParse(input.context);

  return {
    vertical: input.vertical,
    context: context.success ? (context.data satisfies EncounterContext) : null,
    caseText: input.interaction.inputRedacted ? mask(input.interaction.inputRedacted) : null,
    analysisCreatedAt: input.interaction.createdAt.toISOString(),
    plan: {
      mainHypothesis: output.differentials[0] ? mask(output.differentials[0].hypothesis) : null,
      differentials: output.differentials.map((d) => ({
        hypothesis: mask(d.hypothesis),
        cannotMiss: d.cannotMiss,
      })),
      redFlags: output.redFlags.map((flag) => ({
        finding: mask(flag.finding),
        severity: flag.severity,
      })),
      recommendations: output.recommendations.map((rec) => ({
        action: mask(rec.action),
        preliminary: rec.preliminary,
      })),
      pendingQuestions: output.clarifyingQuestions.map((q) => mask(q.question)),
      uncertainty: output.uncertainty,
    },
  };
}

/** Leitura do snapshot gravado (JSON do banco) de volta para o contrato. */
const storedSnapshotSchema = z.object({
  vertical: z.string().catch(''),
  context: encounterContextSchema.nullable().catch(null),
  caseText: z.string().nullable().catch(null),
  analysisCreatedAt: z.string().nullable().catch(null),
  plan: z
    .object({
      mainHypothesis: z.string().nullable().catch(null),
      differentials: z
        .array(z.object({ hypothesis: z.string(), cannotMiss: z.boolean().catch(false) }))
        .catch([]),
      redFlags: z
        .array(z.object({ finding: z.string(), severity: z.string().catch('') }))
        .catch([]),
      recommendations: z
        .array(z.object({ action: z.string(), preliminary: z.boolean().catch(false) }))
        .catch([]),
      pendingQuestions: z.array(z.string()).catch([]),
      uncertainty: z.boolean().catch(false),
    })
    .catch({
      mainHypothesis: null,
      differentials: [],
      redFlags: [],
      recommendations: [],
      pendingQuestions: [],
      uncertainty: false,
    }),
});

export function readStoredSnapshot(value: Prisma.JsonValue): MentoringCaseSnapshot {
  const parsed = storedSnapshotSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return storedSnapshotSchema.parse({});
}
