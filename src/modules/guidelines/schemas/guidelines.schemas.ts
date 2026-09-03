import { z } from 'zod';

export const ingestGuidelineSchema = z.object({
  text: z.string().min(10),
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  specialty: z.string().min(1),
  evidenceLevel: z.string().optional(),
  institutionId: z.string().uuid().optional(),
});

/**
 * F4 — Sugestão de diretriz enviada por um médico do piloto.
 *
 * Diferenças propositais frente a `ingestGuidelineSchema`:
 * - `sourceVersion` e `specialty` têm default, porque o médico está enviando
 *   um artigo, não preenchendo metadados de curadoria. Exigir front-matter foi
 *   exatamente o que impediu um médico de contribuir com a diretriz de dengue
 *   depois de ver um caso ir para o caminho errado.
 * - `institutionId` não é aceito: sugestão entra sempre como conteúdo global
 *   pendente de curadoria, nunca como protocolo institucional.
 * - `text` tem teto de tamanho — este endpoint é aberto a qualquer médico
 *   autenticado, então o custo de embedding precisa ter limite explícito.
 */
const MAX_SUGGESTION_CHARS = 200_000;

export const suggestGuidelineSchema = z.object({
  text: z.string().min(50, 'Envie ao menos um parágrafo de conteúdo').max(MAX_SUGGESTION_CHARS),
  source: z.string().min(1, 'Informe de onde veio o material').max(300),
  sourceVersion: z.string().min(1).max(120).default('sem versão informada'),
  specialty: z.string().min(1).max(120).default('nao_classificada'),
  evidenceLevel: z.string().max(120).optional(),
  cenario: z.string().max(120).optional(),
  redFlags: z.array(z.string().max(200)).max(20).optional(),
  subtipo: z.string().max(120).optional(),
});

export const deactivateGuidelineSchema = z.object({
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
});

export const rejectGuidelineChunkSchema = z.object({
  reason: z.string().min(1).optional(),
});

export type IngestGuidelineBody = z.infer<typeof ingestGuidelineSchema>;
export type SuggestGuidelineBody = z.infer<typeof suggestGuidelineSchema>;
export type DeactivateGuidelineBody = z.infer<typeof deactivateGuidelineSchema>;
export type RejectGuidelineChunkBody = z.infer<typeof rejectGuidelineChunkSchema>;
