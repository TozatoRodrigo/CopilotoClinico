import type { KnowledgeCardCitation, ReviewedCard } from '../../shared/contracts/knowledge-cards';
import type {
  QuickQuestionCardAnswer,
  QuickQuestionDose,
  QuickQuestionSource,
} from '../../shared/contracts/quick-question';
import { computeWeightBasedDose, type WeightReading } from './weight-dose';

/**
 * CC-501 — o cartão como resposta da pergunta rápida: a resposta, a
 * população e cada dose estruturada exatamente como o revisor assinou, e as
 * fontes com os trechos que elas citam. Nada é reescrito; a única conta é a
 * dose por peso (`computeWeightBasedDose`), ao lado da dose do cartão.
 */
export function toQuickQuestionCardAnswer(
  card: ReviewedCard,
  weight: WeightReading,
): QuickQuestionCardAnswer {
  const { content } = card;
  const doses: QuickQuestionDose[] = content.claims.flatMap((claim) =>
    claim.dose
      ? [
          {
            drug: claim.dose.drug,
            amount: claim.dose.amount,
            route: claim.dose.route,
            frequency: claim.dose.frequency,
            maxDose: claim.dose.maxDose,
            claim: claim.text,
            citation: { ...claim.dose.citation },
            weightBased: computeWeightBasedDose(claim.dose, weight),
          },
        ]
      : [],
  );

  return {
    cardId: card.cardId,
    version: card.version,
    topic: card.topic,
    question: content.question,
    population: content.population,
    answer: content.answer,
    answerQuotes: content.answerCitations.map((citation) => ({ ...citation })),
    doses,
    sources: citedSources(card, [
      ...content.answerCitations,
      ...doses.map((dose) => dose.citation),
    ]),
    reviewer: {
      name: card.reviewer.name,
      crmNumber: card.reviewer.crmNumber,
      crmUf: card.reviewer.crmUf,
    },
    reviewedAt: card.reviewedAt,
    validUntil: card.validUntil,
  };
}

/** As fontes que a resposta e as doses citam, na ordem do cartão, com os trechos sem repetição. */
function citedSources(
  card: ReviewedCard,
  citations: readonly KnowledgeCardCitation[],
): QuickQuestionSource[] {
  const quotesByKey = new Map<string, string[]>();
  for (const { sourceKey, quote } of citations) {
    const quotes = quotesByKey.get(sourceKey) ?? [];
    if (!quotes.includes(quote)) quotes.push(quote);
    quotesByKey.set(sourceKey, quotes);
  }
  return card.content.sources.flatMap((source) => {
    const quotes = quotesByKey.get(source.key);
    return quotes
      ? [
          {
            key: source.key,
            title: source.title,
            section: source.section,
            sourceVersion: source.sourceVersion,
            url: source.url,
            quotes,
          },
        ]
      : [];
  });
}
