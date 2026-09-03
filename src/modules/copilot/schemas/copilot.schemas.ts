import { z } from 'zod';

export const analyzeSchema = z.object({
  caseText: z.string().min(10, 'Case text must be at least 10 characters'),
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
});

export type StreamQuery = z.infer<typeof streamQuerySchema>;

export const respondSchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.union([z.string(), z.number(), z.boolean()]),
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
