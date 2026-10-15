import type { ReviewedCard } from '../../src/shared/contracts/knowledge-cards';
import { reviewedCard } from './reviewed-cards';

/**
 * CC-501 — cartão de dose por peso para a pergunta rápida. Texto sintético,
 * não é conteúdo clínico revisado: só exercita a conta e a forma da resposta.
 */
export const ANAPHYLAXIS_CARD_ID = '88888888-8888-4888-8888-888888888888';

const ANAPHYLAXIS_QUOTE =
  'Adrenalina 0,01 mg/kg por via intramuscular, dose máxima de 0,5 mg, repetir a cada 5 a 15 minutos';

export function anaphylaxisCard(overrides: Partial<ReviewedCard> = {}): ReviewedCard {
  return reviewedCard({
    cardId: ANAPHYLAXIS_CARD_ID,
    topic: 'Anafilaxia: adrenalina IM',
    syndrome: null,
    content: {
      question: 'Qual a dose de adrenalina IM na anafilaxia?',
      population: 'Criança ou adulto com anafilaxia no pronto-socorro',
      answer: 'Adrenalina 0,01 mg/kg IM na face lateral da coxa, até 0,5 mg por dose.',
      answerCitations: [{ sourceKey: 'S1', quote: ANAPHYLAXIS_QUOTE }],
      claims: [
        {
          kind: 'conduct',
          text: 'Aplicar adrenalina IM assim que reconhecer a anafilaxia.',
          dose: {
            drug: 'Adrenalina',
            amount: '0,01 mg/kg',
            route: 'intramuscular',
            frequency: 'a cada 5 a 15 minutos',
            maxDose: '0,5 mg',
            citation: { sourceKey: 'S1', quote: ANAPHYLAXIS_QUOTE },
          },
          citations: [{ sourceKey: 'S1', quote: ANAPHYLAXIS_QUOTE }],
        },
        {
          kind: 'pitfall',
          text: 'Anti-histamínico não substitui a adrenalina.',
          dose: null,
          citations: [{ sourceKey: 'S2', quote: 'O anti-histamínico não substitui a adrenalina' }],
        },
      ],
      sources: [
        {
          key: 'S1',
          chunkId: '99999999-9999-4999-8999-999999999991',
          documentId: null,
          title: 'Protocolo de anafilaxia',
          sourceVersion: '2025-03',
          section: '3. Tratamento',
          url: 'https://example.org/anafilaxia.pdf',
          chunkSha256: 'a'.repeat(64),
        },
        {
          key: 'S2',
          chunkId: '99999999-9999-4999-8999-999999999992',
          documentId: null,
          title: 'Protocolo de anafilaxia',
          sourceVersion: '2025-03',
          section: '4. Armadilhas',
          url: null,
          chunkSha256: 'b'.repeat(64),
        },
      ],
    },
    contentSha256: 'c'.repeat(64),
    ...overrides,
  });
}
