import type {
  KnowledgeCardContent,
  KnowledgeCardDetail,
  KnowledgeCardVersionView,
} from '@contracts/knowledge-cards';
import type {
  KnowledgeCardReviewItem,
  KnowledgeCardSourceText,
} from '@contracts/knowledge-card-review';

/**
 * CC-404 — cartão de teste da tela de revisão. Texto sintético no formato
 * dos trechos da base oficial; não é conteúdo clínico revisado.
 */

export const CARD_ID = '88888888-8888-4888-8888-888888888888';
export const NEXT_CARD_ID = '77777777-7777-4777-8777-777777777777';
const TREATMENT_CHUNK_ID = '11111111-1111-4111-8111-111111111111';
const DIAGNOSIS_CHUNK_ID = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-15T12:00:00.000Z';

export const TREATMENT_TEXT =
  '[PCDT · Meningite bacteriana · 7. TRATAMENTO]\n' +
  'No adulto com suspeita de meningite bacteriana, iniciar antibioticoterapia empírica ' +
  'imediatamente após a coleta do líquor, sem aguardar o resultado. Ceftriaxona 2 g por ' +
  'via intravenosa a cada 12 horas, dose máxima de 4 g/dia.';

const DIAGNOSIS_TEXT =
  '[PCDT · Meningite bacteriana · 6. DIAGNÓSTICO]\n' +
  'A doença meningocócica é de notificação compulsória imediata.';

export const DOSE_QUOTE =
  'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia';

export function reviewContent(): KnowledgeCardContent {
  return {
    question: 'Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?',
    population: 'Adulto no pronto-socorro com suspeita de meningite bacteriana',
    answer: 'Ceftriaxona 2 g IV a cada 12 horas, iniciada logo após a coleta do líquor.',
    answerCitations: [
      { sourceKey: 'S1', quote: 'Ceftriaxona 2 g por via intravenosa a cada 12 horas' },
    ],
    claims: [
      {
        kind: 'conduct',
        text: 'Iniciar a ceftriaxona sem aguardar o resultado do líquor.',
        dose: {
          drug: 'Ceftriaxona',
          amount: '2 g',
          route: 'intravenosa',
          frequency: 'a cada 12 horas',
          maxDose: '4 g/dia',
          citation: { sourceKey: 'S1', quote: DOSE_QUOTE },
        },
        citations: [
          {
            sourceKey: 'S1',
            quote: 'iniciar antibioticoterapia empírica imediatamente após a coleta do líquor',
          },
        ],
      },
      {
        kind: 'notification',
        text: 'A doença meningocócica é de notificação compulsória imediata.',
        dose: null,
        citations: [
          {
            sourceKey: 'S2',
            quote: 'A doença meningocócica é de notificação compulsória imediata',
          },
        ],
      },
    ],
    sources: [
      {
        key: 'S1',
        chunkId: TREATMENT_CHUNK_ID,
        documentId: null,
        title: 'PCDT · Meningite bacteriana',
        sourceVersion: '2024-05',
        section: '7. TRATAMENTO',
        url: 'https://www.gov.br/conitec/pcdt-meningite.pdf',
        chunkSha256: 'a'.repeat(64),
      },
      {
        key: 'S2',
        chunkId: DIAGNOSIS_CHUNK_ID,
        documentId: null,
        title: 'PCDT · Meningite bacteriana',
        sourceVersion: '2024-05',
        section: '6. DIAGNÓSTICO',
        url: null,
        chunkSha256: 'b'.repeat(64),
      },
    ],
  };
}

function rangeOf(text: string, quote: string) {
  const start = text.indexOf(quote);
  return { start, end: start + quote.length };
}

export function sourceTexts(): KnowledgeCardSourceText[] {
  return [
    {
      key: 'S1',
      chunkId: TREATMENT_CHUNK_ID,
      text: TREATMENT_TEXT,
      matchesCitedText: true,
      highlights: [
        rangeOf(
          TREATMENT_TEXT,
          'iniciar antibioticoterapia empírica imediatamente após a coleta do líquor',
        ),
        rangeOf(TREATMENT_TEXT, DOSE_QUOTE),
      ],
    },
    {
      key: 'S2',
      chunkId: DIAGNOSIS_CHUNK_ID,
      text: DIAGNOSIS_TEXT,
      matchesCitedText: false,
      highlights: [
        rangeOf(DIAGNOSIS_TEXT, 'A doença meningocócica é de notificação compulsória imediata'),
      ],
    },
  ];
}

export function versionView(
  version: number,
  overrides: Partial<KnowledgeCardVersionView> = {},
): KnowledgeCardVersionView {
  return {
    id: `9999999${version}-9999-4999-8999-999999999999`,
    version,
    content: reviewContent(),
    contentSha256: 'c'.repeat(64),
    authorKind: 'ai',
    authorPhysician: null,
    draft: null,
    review: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function cardDetail(overrides: Partial<KnowledgeCardDetail> = {}): KnowledgeCardDetail {
  const versions = overrides.versions ?? [versionView(1)];
  return {
    id: CARD_ID,
    institutionId: null,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    status: 'in_review',
    displayStatus: 'in_review',
    currentVersion: versions[0]?.version ?? 1,
    question: reviewContent().question,
    published: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    versions,
    ...overrides,
  };
}

export function reviewItem(card: KnowledgeCardDetail = cardDetail()): KnowledgeCardReviewItem {
  return {
    kind: 'review',
    card,
    version: card.versions[0]?.version ?? 1,
    sourceTexts: sourceTexts(),
  };
}

/** Correção do médico (versão 2) sobre o rascunho da IA (versão 1). */
export function correctedItem(answer: string): KnowledgeCardReviewItem {
  const corrected = reviewContent();
  corrected.answer = answer;
  return reviewItem(
    cardDetail({
      versions: [
        versionView(2, {
          content: corrected,
          authorKind: 'physician',
          authorPhysician: {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Dr. Luiz',
            crmUf: 'SP',
            crmNumber: '123456',
            crmVerified: true,
          },
        }),
        versionView(1),
      ],
    }),
  );
}
