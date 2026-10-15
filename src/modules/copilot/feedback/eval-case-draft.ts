import { z } from 'zod';
import type { CopilotFeedbackKind, Prisma } from '@prisma/client';
import {
  EVAL_CASE_DRAFT_PLACEHOLDER as TO_FILL,
  type EncounterContext,
  type EvalCaseDraft,
  type PsSyndrome,
} from '../../../shared/contracts/clinical';
import { maskPII } from '../guardrails/pii-filter';
import { extractRetrievalCoverage, extractUnderstandingSignals } from '../interaction-trace';
import { withAnsweredQuestions } from '../orchestrator/answered-questions';

/**
 * CC-703 — rascunho de caso do gabarito v2 a partir de um reporte da triagem.
 *
 * Antes, "virou caso do gabarito" era só um status, e o botão da triagem
 * copiava um esqueleto no formato antigo (cannotMiss, expectedPath) que o
 * schema v2 recusa. Aqui o servidor monta um caso que JÁ passa no schema
 * (evals/clinical/case.schema.ts): o texto que o modelo leu naquela rodada,
 * mascarado de novo, e as expectativas vazias. O que é do curador vai marcado
 * com EVAL_CASE_DRAFT_PLACEHOLDER, e o teste do gabarito recusa o arquivo até
 * a marca sumir.
 *
 * A API não escreve no repositório: o rascunho sai como download e entra em
 * evals/clinical/cases/ por PR.
 */

/** Mesmo intervalo de `input.caseText` no gabarito v2. */
const CASE_TEXT_MIN_CHARS = 10;
const CASE_TEXT_MAX_CHARS = 4000;

/** `campo-` + 8 primeiros caracteres do id do reporte: rastreável de volta à fila. */
const DRAFT_ID_PREFIX = 'campo-';
const DRAFT_ID_CHARS = 8;

type DraftSyndrome = Exclude<PsSyndrome, 'outro'>;

/**
 * `tags[0]` quando o entendimento não registrou a síndrome. A primeira da
 * lista de propósito: num caso de dengue, "agitação psicomotora" salta aos
 * olhos, e a tag `a-preencher` ao lado (recusada pelo teste do gabarito)
 * obriga o curador a trocá-la.
 */
const PROVISIONAL_SYNDROME: DraftSyndrome = 'agitacao-psicomotora';
const PROVISIONAL_SYNDROME_TAG = 'a-preencher';

const FIELD_INCIDENT_TAG = 'incidente-de-campo';

const KIND_LABEL: Record<CopilotFeedbackKind, { label: string; tag: string }> = {
  wrong_scenario: { label: 'cenário errado', tag: 'cenario-errado' },
  missing_coverage: { label: 'faltou diretriz', tag: 'faltou-diretriz' },
  wrong_recommendation: { label: 'conduta incorreta', tag: 'conduta-incorreta' },
  helpful: { label: 'foi útil', tag: 'foi-util' },
};

const answeredQuestionsSchema = z
  .array(z.object({ question: z.string(), answer: z.string() }))
  .catch([]);

const encounterContextSchema = z.object({
  hasCT: z.boolean(),
  isSus: z.boolean(),
  hasLab: z.boolean(),
  hasICU: z.boolean(),
});

const redFlagsSchema = z.object({ redFlags: z.record(z.string(), z.boolean()) });

const mainHypothesisSchema = z.object({
  differentials: z.array(z.object({ hypothesis: z.string() })).min(1),
});

export interface EvalCaseDraftSource {
  feedback: {
    id: string;
    kind: CopilotFeedbackKind;
    /** Já mascarado na gravação; passa de novo pela máscara aqui. */
    comment: string | null;
    createdAt: Date;
  };
  interaction: {
    model: string;
    turnIndex: number;
    inputRedacted: string | null;
    answeredQuestions: Prisma.JsonValue | null;
    params: Prisma.JsonValue | null;
    rawOutput: Prisma.JsonValue;
  };
  encounterContext: Prisma.JsonValue | null;
}

export function buildEvalCaseDraft(source: EvalCaseDraftSource): EvalCaseDraft {
  const { feedback, interaction } = source;
  const kind = KIND_LABEL[feedback.kind];
  const { syndrome } = extractUnderstandingSignals(interaction.rawOutput);
  const suggestedSyndrome = syndrome && syndrome !== 'outro' ? syndrome : null;
  const caseText = draftCaseText(interaction);
  const context = parseContext(source.encounterContext);
  const redFlags = parseRedFlags(interaction.params);
  const reportedOn = feedback.createdAt.toISOString().slice(0, 10);

  return {
    schemaVersion: 2,
    id: `${DRAFT_ID_PREFIX}${feedback.id.slice(0, DRAFT_ID_CHARS)}`,
    title: `${TO_FILL}: título do caso (reporte "${kind.label}" de ${reportedOn})`,
    tags: suggestedSyndrome
      ? [suggestedSyndrome, FIELD_INCIDENT_TAG, kind.tag]
      : [PROVISIONAL_SYNDROME, PROVISIONAL_SYNDROME_TAG, FIELD_INCIDENT_TAG, kind.tag],
    critical: false,
    goldSource: 'field_incident',
    review: {
      status: 'draft',
      notes: reviewChecklist({
        syndromeSuggested: suggestedSyndrome !== null,
        caseTextMissing: caseText.missing,
        caseTextTruncated: caseText.truncated,
      }),
    },
    input: {
      caseText: caseText.text,
      ...(context ? { context } : {}),
      ...(redFlags ? { redFlags } : {}),
    },
    expected: {
      syndrome: `${TO_FILL}: síndrome em que o caso deve ser enquadrado como hipótese principal`,
      diagnoses: [],
      actions: [],
      questions: [],
      forbiddenDefinitiveActions: [],
      rationale: `${TO_FILL}: por que o gabarito é este (protocolo do MS, diretriz, raciocínio)`,
    },
    provenance: {
      origin: `feedback:${feedback.id}`,
      notes: provenanceNotes(source, kind.label, reportedOn),
    },
  };
}

interface DraftCaseText {
  text: string;
  missing: boolean;
  truncated: boolean;
}

/**
 * O texto que o modelo leu na rodada reportada: o caso e, a partir da segunda
 * rodada, as respostas do médico. Já foi redigido na gravação; passa de novo
 * pela máscara porque vai sair do sistema num arquivo.
 */
function draftCaseText(interaction: EvalCaseDraftSource['interaction']): DraftCaseText {
  const base = interaction.inputRedacted?.trim() ?? '';
  const answers = answeredQuestionsSchema.parse(interaction.answeredQuestions ?? []);
  const text = maskPII(withAnsweredQuestions(base, answers)).redacted.trim();

  if (base.length === 0 || text.length < CASE_TEXT_MIN_CHARS) {
    return {
      text: `${TO_FILL}: o texto do caso não foi gravado nesta análise`,
      missing: true,
      truncated: false,
    };
  }
  if (text.length > CASE_TEXT_MAX_CHARS) {
    return { text: text.slice(0, CASE_TEXT_MAX_CHARS).trimEnd(), missing: false, truncated: true };
  }
  return { text, missing: false, truncated: false };
}

function parseContext(value: Prisma.JsonValue | null): EncounterContext | null {
  const parsed = encounterContextSchema.safeParse(value);
  if (!parsed.success) return null;
  const { hasCT, isSus, hasLab, hasICU } = parsed.data;
  return { hasCT, isSus, hasLab, hasICU };
}

/** Só as bandeiras marcadas, como nos casos do gabarito. */
function parseRedFlags(params: Prisma.JsonValue | null): Record<string, boolean> | null {
  const parsed = redFlagsSchema.safeParse(params);
  if (!parsed.success) return null;
  const marked = Object.entries(parsed.data.redFlags).filter(([, value]) => value);
  return marked.length > 0 ? Object.fromEntries(marked) : null;
}

function reviewChecklist(flags: {
  syndromeSuggested: boolean;
  caseTextMissing: boolean;
  caseTextTruncated: boolean;
}): string {
  const items = [
    'title',
    flags.syndromeSuggested
      ? 'conferir tags[0] (síndrome sugerida pelo entendimento do Copiloto)'
      : `tags[0] (provisória: a análise não registrou a síndrome) e tirar a tag "${PROVISIONAL_SYNDROME_TAG}"`,
    'critical (true exige diagnóstico de nível critical)',
    'expected: syndrome, diagnoses, actions, questions, forbiddenDefinitiveActions e rationale',
    flags.caseTextMissing
      ? 'input.caseText: reescrever o caso a partir da trilha da análise'
      : 'input.caseText: conferir se sobrou identificador (nome, prontuário, leito) e trocar cada [REDACTED_*] por texto neutro',
    ...(flags.caseTextTruncated
      ? [
          `input.caseText: o texto passou de ${CASE_TEXT_MAX_CHARS} caracteres e foi cortado; resumir`,
        ]
      : []),
    'provenance.notes: conferir o comentário do médico antes do commit',
  ];
  return (
    `${TO_FILL} antes do commit — ${items.join('; ')}. ` +
    `Apague esta nota ao terminar: o teste do gabarito recusa caso com "${TO_FILL}".`
  );
}

function provenanceNotes(
  source: EvalCaseDraftSource,
  kindLabel: string,
  reportedOn: string,
): string {
  const { feedback, interaction } = source;
  const coverage = extractRetrievalCoverage(interaction.params);
  const comment = feedback.comment?.trim() ? maskPII(feedback.comment.trim()).redacted : null;
  const hypothesis = mainHypothesis(interaction.rawOutput);

  return [
    `Reporte "${kindLabel}" de ${reportedOn} sobre a rodada ${interaction.turnIndex + 1}` +
      ` (modelo ${interaction.model}${coverage ? `, cobertura da base ${coverage}` : ''}).`,
    comment ? `Comentário do médico (mascarado): "${comment}".` : 'Sem comentário do médico.',
    hypothesis
      ? `Hipótese principal do Copiloto: ${hypothesis}.`
      : 'O Copiloto não registrou hipótese principal.',
  ].join(' ');
}

function mainHypothesis(rawOutput: Prisma.JsonValue): string | null {
  const parsed = mainHypothesisSchema.safeParse(rawOutput);
  return parsed.success ? (parsed.data.differentials[0]?.hypothesis ?? null) : null;
}
