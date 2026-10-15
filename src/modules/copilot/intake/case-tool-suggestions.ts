import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { readBooleanFlag } from '../../../config/feature-flag';
import {
  suggestCaseTools,
  type CaseReading,
} from '../../../shared/clinical-tools/case-suggestions';
import type { CaseToolSuggestions, ConversationTurn } from '../../../shared/contracts/clinical';
import { StoredCaseUnderstandingSchema } from '../understanding/case-understanding.schema';
import { StoredIntakeReadingSchema } from './intake-reading.schema';

/**
 * CC-332 — o plano sugere a ferramenta certa, já preenchida com o caso.
 *
 * A flag é da API, e não do web, porque o caso inteiro está aqui: o
 * entendimento de cada rodada e, no Copiloto guiado, a leitura do caso (que
 * o web não recebe). A sugestão sai na leitura da conversa, por regra fixa do
 * motor das Ferramentas (`suggestCaseTools`), sem chamada de IA; liga e
 * desliga sem redeploy. A tela ainda exige `NEXT_PUBLIC_FERRAMENTAS=on`: sem
 * as Ferramentas no web não há para onde levar.
 */
export const TOOL_SUGGESTIONS_FLAG = 'COPILOT_TOOL_SUGGESTIONS';

export function toolSuggestionsEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, TOOL_SUGGESTIONS_FLAG, false);
}

const storedAnswersSchema = z.array(z.object({ answer: z.string() }).passthrough());

/** Leitura do caso do Copiloto guiado, quando a rodada não tem entendimento próprio. */
export function storedIntakeReading(value: Prisma.JsonValue | null): CaseReading | null {
  if (value === null) return null;
  const parsed = StoredIntakeReadingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function understandingOf(output: unknown): CaseReading | null {
  if (typeof output !== 'object' || output === null || !('understanding' in output)) return null;
  const parsed = StoredCaseUnderstandingSchema.safeParse(output.understanding);
  return parsed.success ? parsed.data : null;
}

export interface TurnSource {
  /** Saída gravada da rodada (`ai_interactions.raw_output`). */
  rawOutput: Prisma.JsonValue | null;
  /** Texto do caso da rodada, já redigido. */
  inputRedacted: string | null;
  /** Todas as respostas do médico até esta rodada, já redigidas. */
  answeredQuestions: Prisma.JsonValue | null;
}

/**
 * Sugestões de uma rodada: o entendimento dela (COPILOT_REASONING=stages)
 * ou, sem ele, a leitura do caso do Copiloto guiado. Sem nenhum dos dois,
 * `null`: a rodada sai como antes.
 */
export function turnToolSuggestions(
  source: TurnSource,
  intakeReading: CaseReading | null,
): CaseToolSuggestions | null {
  const reading = understandingOf(source.rawOutput) ?? intakeReading;
  if (!reading) return null;

  const answers = storedAnswersSchema.safeParse(source.answeredQuestions);
  const caseText = [
    source.inputRedacted ?? '',
    ...(answers.success ? answers.data.map(({ answer }) => answer) : []),
  ].join('\n');

  const output = source.rawOutput as Partial<ConversationTurn['output']> | null;
  const planActions = (output?.recommendations ?? [])
    .map((recommendation) => recommendation?.action)
    .filter((action): action is string => typeof action === 'string');

  return suggestCaseTools({ reading, caseText, planActions });
}

/** Linha de log sem texto clínico: ids das regras e versão do mapeamento. */
export function describeToolSuggestions(
  interactionId: string,
  suggestions: CaseToolSuggestions,
): string {
  const rules = suggestions.suggestions.map(({ ruleId }) => ruleId).join(',') || '-';
  return `TOOL_SUGGESTIONS interactionId=${interactionId} mappingVersion=${suggestions.mappingVersion} rules=${rules}`;
}
