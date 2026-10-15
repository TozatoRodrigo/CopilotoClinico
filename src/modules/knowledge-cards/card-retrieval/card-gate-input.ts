import { maskPII } from '../../copilot/guardrails/pii-filter';
import type { CardRelevanceContext, RelevanceCard } from './card-relevance-gate';

/**
 * CC-407 — o que um portão que lê texto (Jev, reranker) recebe: o
 * entendimento da Etapa 1 e o cartão, nunca o texto do caso.
 *
 * O entendimento já foi escrito pelo modelo a partir do caso redigido, e a
 * pergunta rápida chega mascarada; a máscara roda de novo aqui porque o Jev
 * fica fora da VPS. Os tetos de tamanho limitam o custo por token e evitam o
 * 400 de entrada longa demais.
 */

const MAX_UNDERSTANDING_CHARS = 1500;
const MAX_HYPOTHESES = 8;
const MAX_HYPOTHESIS_CHARS = 200;
const MAX_CARD_FIELD_CHARS = 1000;
const MAX_CLAIMS = 8;

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function masked(text: string, max: number): string {
  return clip(maskPII(text).redacted, max);
}

export interface GateSituation {
  sindrome: string | null;
  hipoteses: string[];
  entendimento: string | null;
}

export interface GateCard {
  tema: string;
  sindrome: string | null;
  pergunta: string;
  populacao: string | null;
  resposta: string;
  afirmacoes: string[];
}

export function gateSituation(context: CardRelevanceContext): GateSituation {
  return {
    sindrome: context.syndrome,
    hipoteses: context.hypotheses
      .slice(0, MAX_HYPOTHESES)
      .map((hypothesis) => masked(hypothesis, MAX_HYPOTHESIS_CHARS))
      .filter(Boolean),
    entendimento: context.problemRepresentation
      ? masked(context.problemRepresentation, MAX_UNDERSTANDING_CHARS)
      : null,
  };
}

/** Sem dose estruturada, fontes nem revisor: só o que diz de que situação o cartão trata. */
export function gateCard(card: RelevanceCard): GateCard {
  return {
    tema: clip(card.topic, MAX_CARD_FIELD_CHARS),
    sindrome: card.syndrome,
    pergunta: clip(card.content.question, MAX_CARD_FIELD_CHARS),
    populacao: card.content.population ? clip(card.content.population, MAX_CARD_FIELD_CHARS) : null,
    resposta: clip(card.content.answer, MAX_CARD_FIELD_CHARS),
    afirmacoes: card.content.claims
      .slice(0, MAX_CLAIMS)
      .map((claim) => clip(claim.text, MAX_CARD_FIELD_CHARS)),
  };
}

/** A situação como consulta do reranker. */
export function gateSituationText(situation: GateSituation): string {
  return [
    ...(situation.sindrome ? [`Síndrome: ${situation.sindrome}`] : []),
    ...(situation.hipoteses.length > 0 ? [`Hipóteses: ${situation.hipoteses.join('; ')}`] : []),
    ...(situation.entendimento ? [`Situação: ${situation.entendimento}`] : []),
  ].join('\n');
}

/** O cartão como documento do reranker. */
export function gateCardText(card: GateCard): string {
  return [
    `Tema: ${card.tema}`,
    ...(card.sindrome ? [`Síndrome: ${card.sindrome}`] : []),
    `Pergunta: ${card.pergunta}`,
    ...(card.populacao ? [`População: ${card.populacao}`] : []),
    `Resposta: ${card.resposta}`,
    ...card.afirmacoes.map((claim) => `- ${claim}`),
  ].join('\n');
}
