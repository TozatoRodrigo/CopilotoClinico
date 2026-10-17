import type {
  KnowledgeCardContent,
  KnowledgeCardContentInput,
} from '../../src/shared/contracts/knowledge-cards';
import {
  prepareCardContent,
  type SourceChunk,
} from '../../src/modules/knowledge-cards/card-sources';

/**
 * CC-402/CC-403 — trechos de diretriz e um cartão válido para os testes.
 * Texto sintético no formato dos chunks da base oficial (cabeçalho
 * `[PCDT · título · seção]`); não é conteúdo clínico revisado.
 */

export const TREATMENT_CHUNK_ID = '11111111-1111-4111-8111-111111111111';
export const DIAGNOSIS_CHUNK_ID = '22222222-2222-4222-8222-222222222222';
export const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

export const TREATMENT_TEXT =
  '[PCDT · Meningite bacteriana · 7. TRATAMENTO]\n' +
  'No adulto com suspeita de meningite bacteriana, iniciar antibioticoterapia empírica ' +
  'imediatamente após a coleta do líquor, sem aguardar o resultado. Ceftriaxona 2 g por ' +
  'via intravenosa a cada 12 horas, dose máxima de 4 g/dia. Associar dexametasona ' +
  '0,15 mg/kg IV a cada 6 horas por 4 dias, iniciada antes ou junto da primeira dose do antibiótico.';

export const DIAGNOSIS_TEXT =
  '[PCDT · Meningite bacteriana · 6. DIAGNÓSTICO]\n' +
  'A punção lombar deve ser adiada e a tomografia de crânio realizada antes quando houver ' +
  'déficit neurológico focal, crise convulsiva recente ou rebaixamento do nível de consciência. ' +
  'A doença meningocócica é de notificação compulsória imediata.';

export function sourceChunk(overrides: Partial<SourceChunk> = {}): SourceChunk {
  return {
    id: TREATMENT_CHUNK_ID,
    source: 'PCDT · Meningite bacteriana',
    sourceVersion: '2024-05',
    text: TREATMENT_TEXT,
    status: 'official_unreviewed',
    institutionId: null,
    documentId: DOCUMENT_ID,
    metadata: { section: '7. TRATAMENTO', url: 'https://www.gov.br/conitec/pcdt-meningite.pdf' },
    validTo: null,
    ...overrides,
  };
}

export function sourceChunks(): Map<string, SourceChunk> {
  return new Map([
    [TREATMENT_CHUNK_ID, sourceChunk()],
    [
      DIAGNOSIS_CHUNK_ID,
      sourceChunk({
        id: DIAGNOSIS_CHUNK_ID,
        text: DIAGNOSIS_TEXT,
        metadata: {
          section: '6. DIAGNÓSTICO',
          url: 'https://www.gov.br/conitec/pcdt-meningite.pdf',
        },
      }),
    ],
  ]);
}

/** Cartão que passa na checagem: toda afirmação e toda dose com trecho literal. */
export function validCardInput(): KnowledgeCardContentInput {
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
          citation: {
            sourceKey: 'S1',
            quote: 'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia',
          },
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
      { key: 'S1', chunkId: TREATMENT_CHUNK_ID },
      { key: 'S2', chunkId: DIAGNOSIS_CHUNK_ID },
    ],
  };
}

/** Texto integral de cada fonte do cartão válido, pela chave. */
export function validSourceTexts(): Map<string, string> {
  return new Map([
    ['S1', TREATMENT_TEXT],
    ['S2', DIAGNOSIS_TEXT],
  ]);
}

/**
 * CC-406/CC-408 — o conteúdo do cartão válido como fica gravado na versão
 * (fontes resolvidas a partir dos chunks), com o hash que o revisor assina.
 */
export function storedCardContent(): { content: KnowledgeCardContent; contentSha256: string } {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture de cartão inválida');
  return { content: prepared.content, contentSha256: prepared.contentSha256 };
}
