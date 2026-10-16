import { z } from 'zod';
import {
  CITATION_ORIGINS,
  PS_SYNDROMES,
  type CitationOrigin,
  type PsSyndrome,
} from '../../shared/contracts/clinical';
import { maskPII } from '../copilot/guardrails/pii-filter';
import { redactPatientRef } from '../copilot/guardrails/clinical-text-screening';
import type { ReviewCardMaterial } from './card-material';
import {
  MAX_REVIEW_ANALYSES,
  MAX_REVIEW_SOURCES,
  MAX_SOURCES_PER_ANALYSIS,
} from './shift-review.settings';

/**
 * CC-801 — o material da revisão: das análises do médico na semana, o que o
 * modelo lê (entendimento, decisão) e as fontes que cada análise citou.
 *
 * Tudo que sai daqui já passou pela máscara de PII e pela redação do
 * patientRef do caso, como o texto do caso antes da análise. O texto do caso
 * em si não entra: as perguntas nascem do raciocínio e das fontes.
 */

/**
 * Fonte gravada na pergunta (`shift_review_questions.source`). `kind` separa a
 * citação da análise do cartão revisado (ver card-material.ts).
 */
export type ShiftReviewStoredSource =
  | {
      kind: 'analysis_citation';
      chunkId: string;
      title: string;
      version: string | null;
      origin: CitationOrigin | null;
      url: string | null;
      excerpt: string;
    }
  | {
      kind: 'knowledge_card';
      cardId: string;
      versionId: string;
      title: string;
      version: null;
      origin: null;
      url: null;
      excerpt: string;
    };

/** Uma fonte citável no prompt, pela chave (`F1`, `F2`…). */
export interface ReviewSource {
  key: string;
  analysisKey: string;
  interactionId: string;
  encounterId: string;
  syndrome: PsSyndrome | null;
  stored: ShiftReviewStoredSource;
}

export interface ReviewRecommendation {
  action: string;
  rationale: string | null;
  /** Chave da fonte que a conduta citou; `null` sem fonte citável. */
  sourceKey: string | null;
}

/** Uma análise como entra no prompt (`A1`, `A2`…), já mascarada. */
export interface ReviewAnalysis {
  key: string;
  interactionId: string;
  encounterId: string;
  syndrome: PsSyndrome | null;
  syndromeNote: string | null;
  problemRepresentation: string | null;
  cannotMiss: string[];
  likely: string[];
  redFlags: Array<{ finding: string; action: string }>;
  recommendations: ReviewRecommendation[];
  sources: ReviewSource[];
}

export interface ReviewMaterial {
  analyses: ReviewAnalysis[];
  /** Todas as fontes citáveis, pela chave. */
  sources: ReadonlyMap<string, ReviewSource>;
  /** patientRef dos casos: nunca podem aparecer numa pergunta. */
  patientRefs: string[];
}

/** Uma análise lida do banco: `ai_interactions` com o patientRef do encontro. */
export interface ReviewAnalysisRow {
  interactionId: string;
  encounterId: string;
  patientRef: string | null;
  createdAt: Date;
  rawOutput: unknown;
}

const MAX_LINE_CHARS = 300;
const MAX_EXCERPT_CHARS = 900;
const MAX_TITLE_CHARS = 200;
const MAX_HYPOTHESES = 5;
const MAX_RED_FLAGS = 4;
const MAX_RECOMMENDATIONS = 8;

/**
 * Proveniência que não vira pergunta: conhecimento geral do modelo não tem
 * trecho, e o anexo do médico não passou por curadoria nem garante que o
 * texto não traga dado do caso.
 */
const UNCITABLE_ORIGINS: ReadonlySet<CitationOrigin> = new Set([
  'model_knowledge',
  'physician_attachment',
]);

const optionalText = z
  .string()
  .nullish()
  .catch(null)
  .transform((value) => value?.trim() || null);

/**
 * Leitura estrutural tolerante do `raw_output` gravado: análises de várias
 * versões do prompt, e a falha de validação (sem `recommendations`) não passa.
 */
const StoredRecommendationSchema = z.object({
  action: z.string().trim().min(1),
  rationale: optionalText,
  chunkId: optionalText,
  citationChunkId: optionalText,
  source: optionalText,
  sourceVersion: optionalText,
  sourceText: optionalText,
  sourceUrl: optionalText,
  origin: z.enum(CITATION_ORIGINS).nullish().catch(null),
});

const StoredUnderstandingSchema = z.object({
  problemRepresentation: optionalText,
  syndrome: z.enum(PS_SYNDROMES).nullish().catch(null),
  syndromeNote: optionalText,
  cannotMiss: z.array(z.object({ hypothesis: z.string() })).catch([]),
  likely: z.array(z.object({ hypothesis: z.string() })).catch([]),
});

const StoredAnalysisSchema = z.object({
  recommendations: z.array(StoredRecommendationSchema),
  redFlags: z.array(z.object({ finding: z.string(), action: z.string() })).catch([]),
  differentials: z.array(z.object({ hypothesis: z.string() })).catch([]),
  understanding: StoredUnderstandingSchema.nullish().catch(null),
});

type StoredAnalysis = z.output<typeof StoredAnalysisSchema>;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Máscara de PII e redação do patientRef, as mesmas camadas do texto do caso. */
export function redactReviewText(text: string, patientRef: string | null): string {
  return redactPatientRef(maskPII(text).redacted, patientRef);
}

function sourceOf(
  recommendation: StoredAnalysis['recommendations'][number],
  redact: (text: string, max: number) => string,
): ShiftReviewStoredSource | null {
  const chunkId = recommendation.chunkId ?? recommendation.citationChunkId;
  const origin = recommendation.origin ?? null;
  if (!chunkId || !recommendation.sourceText) return null;
  if (origin && UNCITABLE_ORIGINS.has(origin)) return null;
  return {
    kind: 'analysis_citation',
    chunkId,
    title: redact(recommendation.source ?? 'Fonte citada na análise', MAX_TITLE_CHARS),
    version: recommendation.sourceVersion
      ? redact(recommendation.sourceVersion, MAX_TITLE_CHARS)
      : null,
    origin,
    url: recommendation.sourceUrl,
    excerpt: redact(recommendation.sourceText, MAX_EXCERPT_CHARS),
  };
}

function cardSourceOf(
  card: ReviewCardMaterial,
  redact: (text: string, max: number) => string,
): ShiftReviewStoredSource {
  return {
    kind: 'knowledge_card',
    cardId: card.cardId,
    versionId: card.versionId,
    title: redact(card.title, MAX_TITLE_CHARS),
    version: null,
    origin: null,
    url: null,
    excerpt: redact(card.excerpt, MAX_EXCERPT_CHARS),
  };
}

/** A análise mais recente de cada caso (o último turno traz o plano refinado). */
export function latestValidAnalyses(
  rows: readonly ReviewAnalysisRow[],
): Array<{ row: ReviewAnalysisRow; analysis: StoredAnalysis }> {
  const seen = new Set<string>();
  const latest: Array<{ row: ReviewAnalysisRow; analysis: StoredAnalysis }> = [];
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const row of newestFirst) {
    if (seen.has(row.encounterId)) continue;
    const parsed = StoredAnalysisSchema.safeParse(row.rawOutput);
    if (!parsed.success) continue;
    seen.add(row.encounterId);
    latest.push({ row, analysis: parsed.data });
  }
  return latest;
}

/**
 * Monta o material da revisão. Análise sem fonte citável fica de fora: a
 * pergunta precisa de um trecho que sustente a resposta.
 */
export function buildReviewMaterial(
  rows: readonly ReviewAnalysisRow[],
  cards: readonly ReviewCardMaterial[] = [],
): ReviewMaterial {
  const analyses: ReviewAnalysis[] = [];
  const sources = new Map<string, ReviewSource>();
  const patientRefs = new Set<string>();

  for (const { row, analysis } of latestValidAnalyses(rows)) {
    if (analyses.length >= MAX_REVIEW_ANALYSES || sources.size >= MAX_REVIEW_SOURCES) break;
    const redact = (text: string, max: number) =>
      truncate(redactReviewText(text.trim(), row.patientRef), max);
    const analysisKey = `A${analyses.length + 1}`;
    const understanding = analysis.understanding ?? null;
    const syndrome = understanding?.syndrome ?? null;

    const ownSources: ReviewSource[] = [];
    const keyByChunk = new Map<string, string>();
    const addSource = (stored: ShiftReviewStoredSource): string | null => {
      if (ownSources.length >= MAX_SOURCES_PER_ANALYSIS) return null;
      if (sources.size + ownSources.length >= MAX_REVIEW_SOURCES) return null;
      const key = `F${sources.size + ownSources.length + 1}`;
      ownSources.push({
        key,
        analysisKey,
        interactionId: row.interactionId,
        encounterId: row.encounterId,
        syndrome,
        stored,
      });
      return key;
    };

    const recommendations = analysis.recommendations
      .slice(0, MAX_RECOMMENDATIONS)
      .map((recommendation): ReviewRecommendation => {
        const stored = sourceOf(recommendation, redact);
        let sourceKey: string | null = null;
        if (stored?.kind === 'analysis_citation') {
          sourceKey = keyByChunk.get(stored.chunkId) ?? addSource(stored);
          if (sourceKey) keyByChunk.set(stored.chunkId, sourceKey);
        }
        return {
          action: redact(recommendation.action, MAX_LINE_CHARS),
          rationale: recommendation.rationale
            ? redact(recommendation.rationale, MAX_LINE_CHARS)
            : null,
          sourceKey,
        };
      });
    for (const card of cards) {
      if (card.interactionId === row.interactionId) addSource(cardSourceOf(card, redact));
    }
    if (ownSources.length === 0) continue;

    const hypotheses = (items: Array<{ hypothesis: string }>) =>
      items.slice(0, MAX_HYPOTHESES).map(({ hypothesis }) => redact(hypothesis, MAX_LINE_CHARS));
    analyses.push({
      key: analysisKey,
      interactionId: row.interactionId,
      encounterId: row.encounterId,
      syndrome,
      syndromeNote: understanding?.syndromeNote
        ? redact(understanding.syndromeNote, MAX_LINE_CHARS)
        : null,
      problemRepresentation: understanding?.problemRepresentation
        ? redact(understanding.problemRepresentation, MAX_LINE_CHARS)
        : null,
      cannotMiss: hypotheses(understanding?.cannotMiss ?? []),
      // Sem entendimento (análise v1), os diferenciais fazem o papel das hipóteses.
      likely: hypotheses(understanding ? understanding.likely : analysis.differentials),
      redFlags: analysis.redFlags.slice(0, MAX_RED_FLAGS).map((flag) => ({
        finding: redact(flag.finding, MAX_LINE_CHARS),
        action: redact(flag.action, MAX_LINE_CHARS),
      })),
      recommendations,
      sources: ownSources,
    });
    for (const source of ownSources) sources.set(source.key, source);
    if (row.patientRef) patientRefs.add(row.patientRef);
  }

  return { analyses, sources, patientRefs: [...patientRefs] };
}
