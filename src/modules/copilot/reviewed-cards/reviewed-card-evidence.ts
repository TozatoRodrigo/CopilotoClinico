import type {
  RecommendationReviewedCard,
  ReviewedCardRecord,
} from '../../../shared/contracts/clinical';
import type {
  KnowledgeCardClaimKind,
  KnowledgeCardDose,
  ReviewedCard,
} from '../../../shared/contracts/knowledge-cards';
import { findDoseMentions } from '../guardrails/dose-detector';

/**
 * CC-408 (ADR-019) — cartões revisados como fonte da decisão em etapas: o id
 * que o prompt dá a cada cartão, o bloco do prompt, a autoria ("Revisado
 * por") e a regra que libera a dose — só a dose estruturada do cartão citado.
 */

export const CARD_CITATION_PREFIX = 'card:';

/** "card:1", "card:2"… — curtos como `web:N`: o modelo copia o id sem errar. */
export function cardCitationId(position: number): string {
  return `${CARD_CITATION_PREFIX}${position}`;
}

export function isCardCitationId(id: string): boolean {
  return id.startsWith(CARD_CITATION_PREFIX);
}

/** Um cartão entregue à decisão neste turno. */
export interface ReviewedCardEvidence {
  citationId: string;
  card: ReviewedCard;
  similarity: number;
}

export function toCardEvidence(
  cards: ReadonlyArray<{ card: ReviewedCard; similarity: number }>,
): ReviewedCardEvidence[] {
  return cards.map(({ card, similarity }, index) => ({
    citationId: cardCitationId(index + 1),
    card,
    similarity,
  }));
}

/** dd/mm/aaaa no fuso de Brasília — a data que o revisor viu ao assinar. */
export function formatReviewDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "Revisado por Dr(a). Ana Souza, CRM 123456/SP, em 12/10/2026". */
export function reviewedByLine(card: ReviewedCard): string {
  const { name, crmNumber, crmUf } = card.reviewer;
  const who = name ? `Dr(a). ${name}, CRM ${crmNumber}/${crmUf}` : `CRM ${crmNumber}/${crmUf}`;
  return `Revisado por ${who}, em ${formatReviewDate(card.reviewedAt)}`;
}

const CLAIM_LABEL: Record<KnowledgeCardClaimKind, string> = {
  conduct: 'Conduta',
  criterion: 'Critério',
  alarm_sign: 'Sinal de alarme',
  disposition: 'Destino',
  notification: 'Notificação',
  pitfall: 'Armadilha',
};

/** "Ceftriaxona 2 g · intravenosa · a cada 12 horas · máximo 4 g/dia". */
export function formatCardDose(dose: KnowledgeCardDose): string {
  return [
    `${dose.drug} ${dose.amount}`,
    dose.route,
    dose.frequency,
    dose.maxDose ? `máximo ${dose.maxDose}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** Texto do cartão (escrito pela IA, revisado por médico) não fecha a tag do bloco. */
function escapeCardText(text: string): string {
  return text.replace(/</g, '&lt;');
}

function cardEntry({ citationId, card }: ReviewedCardEvidence): string {
  const { content } = card;
  const lines = [
    `[ID: ${citationId}] [${reviewedByLine(card)} — versão ${card.version}]`,
    `Pergunta: ${content.question}`,
    ...(content.population ? [`População: ${content.population}`] : []),
    `Resposta: ${content.answer}`,
    ...content.claims.flatMap((claim) => [
      `- ${CLAIM_LABEL[claim.kind]}: ${claim.text}`,
      ...(claim.dose ? [`  Dose: ${formatCardDose(claim.dose)}`] : []),
    ]),
  ];
  return escapeCardText(lines.join('\n'));
}

/**
 * Regra do bloco, na mensagem do usuário — o system prompt da decisão fica
 * byte a byte igual. Com a flag desligada ou sem cartão aplicável, o bloco
 * não existe e a mensagem também fica igual.
 */
const REVIEWED_CARDS_NOTE = `
The <reviewed_cards> were written from official guidelines and signed by a physician with a verified CRM: the most trusted evidence here. Each card applies only to the situation in its question and population — cite one only when it addresses THIS presentation, with its id in "citationChunkId" and "basis": "source". A recommendation that follows a card may state a dose only when that dose is in one of the card's "Dose" lines, written exactly as there (drug, amount, route, frequency, maximum); never state a dose the card does not give.
`;

export function buildReviewedCardsBlock(evidence: readonly ReviewedCardEvidence[]): string {
  if (evidence.length === 0) return '';
  return `${REVIEWED_CARDS_NOTE}
<reviewed_cards type="PHYSICIAN_REVIEWED_SOURCE">
${evidence.map(cardEntry).join('\n\n---\n\n')}
</reviewed_cards>
`;
}

function normalized(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "0,5 mg" e "0,5mg" são a mesma dose; "0.5 mg" não (pede a escrita do cartão). */
function doseKey(mention: string): string {
  return normalized(mention).replace(/\s+/g, '');
}

/**
 * O fármaco da dose estruturada é o da recomendação: toda palavra de 4+
 * letras do nome (fora o que vem entre parênteses) aparece no texto dela.
 * "Adrenalina (epinefrina)" casa com "adrenalina IM"; "Sulfato de magnésio"
 * não casa com "sulfato ferroso". Sem isso, a dose de um fármaco do cartão
 * liberaria o mesmo número para outro (o erro da dexametasona no `verify`).
 */
function drugNamedIn(drug: string, recommendationText: string): boolean {
  const name = normalized(drug).replace(/\([^)]*\)/g, ' ');
  const words = name.split(/[^a-z]+/).filter((word) => word.length >= 4);
  if (words.length === 0) return recommendationText.includes(name.trim());
  return words.every((word) => recommendationText.includes(word));
}

/**
 * CC-408 — doses no texto da recomendação que o cartão citado NÃO libera.
 *
 * Só a dose estruturada libera (cada campo dela conferido letra a letra com
 * o trecho da fonte pela checagem de citação do CC-403), e só para o fármaco
 * dela. Dose na resposta em texto livre do cartão não basta. Vazio = toda
 * dose da recomendação está no cartão (ou não há dose).
 */
export function unsupportedCardDoses(recommendationText: string, card: ReviewedCard): string[] {
  const mentions = findDoseMentions(recommendationText);
  if (mentions.length === 0) return [];
  const text = normalized(recommendationText);
  const released = new Set<string>();
  for (const claim of card.content.claims) {
    const dose = claim.dose;
    if (!dose || !drugNamedIn(dose.drug, text)) continue;
    for (const field of [dose.amount, dose.maxDose, dose.frequency, dose.route]) {
      if (!field) continue;
      for (const mention of findDoseMentions(field)) released.add(doseKey(mention));
    }
  }
  return mentions.filter((mention) => !released.has(doseKey(mention)));
}

/** O "Revisado por" da conduta, como a tela do plano o mostra. */
export function toRecommendationReviewedCard(card: ReviewedCard): RecommendationReviewedCard {
  return {
    cardId: card.cardId,
    version: card.version,
    question: card.content.question,
    reviewer: {
      name: card.reviewer.name,
      crmNumber: card.reviewer.crmNumber,
      crmUf: card.reviewer.crmUf,
    },
    reviewedAt: card.reviewedAt,
    validUntil: card.validUntil,
  };
}

/** O que fica na trilha (`rawOutput.reviewedCards`): versão, hash assinado e revisor. */
export function toReviewedCardRecord(evidence: ReviewedCardEvidence): ReviewedCardRecord {
  return {
    citationId: evidence.citationId,
    cardId: evidence.card.cardId,
    versionId: evidence.card.versionId,
    version: evidence.card.version,
    contentSha256: evidence.card.contentSha256,
    reviewerId: evidence.card.reviewer.id,
    similarity: evidence.similarity,
  };
}

/** Página do cartão na web: o link do "Revisado por". */
export function cardPagePath(cardId: string): string {
  return `/cartoes/${cardId}`;
}
