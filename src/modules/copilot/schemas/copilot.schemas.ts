import { z } from 'zod';
import {
  copilotFeedbackStatusValues,
  recommendationDecisionValues,
} from '../../../shared/contracts/clinical';

/**
 * Teto do relato do caso. Um ditado de 5 minutos dá uns 5 mil caracteres; o
 * teto é o mesmo do texto de anexo. Acima disso não é relato de plantão, e o
 * custo e o tempo da análise crescem com o tamanho.
 */
export const MAX_CASE_TEXT_CHARS = 20_000;

export const analyzeSchema = z.object({
  caseText: z
    .string()
    .min(10, 'Case text must be at least 10 characters')
    .max(MAX_CASE_TEXT_CHARS, `Case text must be at most ${MAX_CASE_TEXT_CHARS} characters`),
  context: z
    .object({
      hasCT: z.boolean().default(false),
      isSus: z.boolean().default(false),
      hasLab: z.boolean().default(false),
      hasICU: z.boolean().default(false),
    })
    .default({}),
  // S20-CLIN-01 — red flags explícitas marcadas pelo médico na captura.
  // .optional() sem .default() — o tipo fica Record<string, boolean> | undefined,
  // evitando erros de tipo em todos os mocks de teste. O orchestrator já
  // trata undefined com fallback ?? {} na persistência e buildPrompt.
  redFlags: z.record(z.string(), z.boolean()).optional(),
  // F5 — marca o caso-norte / demo para segmentar o funil (LGPD-safe: tag opaca, sem conteúdo clínico).
  demoCase: z.string().trim().max(64).optional(),
});

// z.output garante que redFlags e context sempre presentes após parse (default {}).
// Locais que criam AnalyzeInput sem redFlags devem incluir redFlags: {} explicitamente.
export type AnalyzeInput = z.output<typeof analyzeSchema>;

const boolParam = z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false);

// UX-06 — mesmas 6 chaves canônicas de RED_FLAG_LABELS (prompt-builder.ts) /
// RED_FLAG_CHIPS (capture/page.tsx), como parâmetros booleanos individuais
// em vez de um objeto serializado — EventSource só faz GET com querystring,
// então segue o mesmo estilo já usado para hasCT/isSus/hasLab/hasICU em vez
// de introduzir JSON-em-query-param. Sem isto, o caminho de streaming
// perderia silenciosamente as red flags que o médico confirmou (S20-CLIN-01)
// — a análise por streaming ficaria clinicamente mais pobre que a por POST.
export const streamQuerySchema = z.object({
  caseText: z.string().min(10, 'Case text must be at least 10 characters'),
  hasCT: boolParam,
  isSus: boolParam,
  hasLab: boolParam,
  hasICU: boolParam,
  immunosuppressed: boolParam,
  pregnant: boolParam,
  anticoagulant: boolParam,
  pediatric: boolParam,
  elderly65: boolParam,
  allergy: boolParam,
  // F0-C — paridade de `params` com POST /analyze: a tag de funil (F5) é
  // gravada também quando a análise vem pelo streaming.
  demoCase: z.string().trim().max(64).optional(),
});

export type StreamQuery = z.infer<typeof streamQuerySchema>;

export const respondSchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        // O mesmo teto do relato: a resposta pode ser um complemento ditado
        // no compositor da conversa, não só "sim" ou um número.
        answer: z.union([z.string().max(MAX_CASE_TEXT_CHARS), z.number(), z.boolean()]),
      }),
    )
    .min(1, 'At least one answer is required'),
});

export type RespondInput = z.infer<typeof respondSchema>;

/**
 * F7 — Feedback estruturado do médico sobre uma análise.
 *
 * Origem: os dois erros clínicos que motivaram o KB-005/KB-006 chegaram por
 * mensagem de WhatsApp, dias depois, sem o `interactionId` nem os chunks
 * recuperados. Sem isso, reproduzir um caso depende de alguém lembrar o que
 * foi digitado. Com o botão, cada reporte já nasce com o rastro técnico
 * necessário para virar caso de regressão.
 */
export const feedbackKindValues = [
  /** O Copiloto conduziu para o cenário clínico errado. */
  'wrong_scenario',
  /** O cenário estava certo, mas a base não tinha diretriz para ele. */
  'missing_coverage',
  /** Recomendação incorreta ou perigosa dentro do cenário certo. */
  'wrong_recommendation',
  /** Análise útil — serve de contraste na calibração do piso de relevância. */
  'helpful',
] as const;

export const copilotFeedbackSchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
  kind: z.enum(feedbackKindValues),
  /** O que o médico esperava. Opcional, mas é o campo mais útil na triagem. */
  comment: z.string().max(2000).optional(),
});

export type CopilotFeedbackInput = z.infer<typeof copilotFeedbackSchema>;

/** F0-D — fila de triagem: filtros opcionais por status e tipo (sem filtro = todos). */
export const listCopilotFeedbackQuerySchema = z.object({
  status: z.enum(copilotFeedbackStatusValues).optional(),
  kind: z.enum(feedbackKindValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCopilotFeedbackQuery = z.infer<typeof listCopilotFeedbackQuerySchema>;

export const updateCopilotFeedbackTriageSchema = z.object({
  status: z.enum(copilotFeedbackStatusValues),
  triageNote: z.string().max(2000).nullable().optional(),
});

export type UpdateCopilotFeedbackTriageInput = z.infer<typeof updateCopilotFeedbackTriageSchema>;

/** F0-D — mesmo teto do comentário de feedback: nota clínica, não prontuário. */
export const RECOMMENDATION_NOTE_MAX_CHARS = 2000;

export const upsertRecommendationDecisionSchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
  recommendationIndex: z.number().int().min(0),
  decision: z.enum(recommendationDecisionValues),
  note: z.string().max(RECOMMENDATION_NOTE_MAX_CHARS).nullable().optional(),
});

export type UpsertRecommendationDecisionInput = z.infer<typeof upsertRecommendationDecisionSchema>;

export const listRecommendationDecisionsQuerySchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
});

export type ListRecommendationDecisionsQuery = z.infer<
  typeof listRecommendationDecisionsQuerySchema
>;
