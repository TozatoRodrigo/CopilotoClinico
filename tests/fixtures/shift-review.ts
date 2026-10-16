import type { ReviewAnalysisRow } from '../../src/modules/shift-review/review-material';

/**
 * CC-801 — análises gravadas como o orquestrador grava (`raw_output` da
 * decisão v2 com entendimento), para montar o material da revisão.
 */

export const PHYSICIAN_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_PHYSICIAN_ID = '99999999-9999-4999-8999-999999999999';

/** CPF válido de teste e um patientRef: nenhum dos dois pode chegar ao modelo. */
export const PATIENT_CPF = '529.982.247-25';
export const PATIENT_REF = 'PRN-2026-00731';

export function headacheAnalysis(): Record<string, unknown> {
  return {
    reasoning: 'Cefaleia súbita e intensa: afastar hemorragia subaracnóidea.',
    understanding: {
      problemRepresentation: `Mulher, 34 anos, cefaleia súbita há 2 h (CPF ${PATIENT_CPF}, ${PATIENT_REF}).`,
      syndrome: 'cefaleia',
      syndromeNote: null,
      cannotMiss: [
        { hypothesis: 'Hemorragia subaracnóidea', whyPlausible: 'x', confirmOrRuleOut: 'TC' },
      ],
      likely: [{ hypothesis: 'Enxaqueca', why: 'história prévia' }],
    },
    redFlags: [
      { finding: 'Pior cefaleia da vida', severity: 'critical', action: 'TC de crânio imediata' },
    ],
    differentials: [],
    recommendations: [
      {
        action: 'TC de crânio sem contraste imediata',
        rationale: 'Cefaleia em trovoada exige afastar HSA',
        citationChunkId: 'chunk-hsa-1',
        chunkId: 'chunk-hsa-1',
        source: 'Diretriz de cefaleia na emergência',
        sourceVersion: '2024',
        sourceText:
          'Na cefaleia em trovoada, a TC de crânio sem contraste nas primeiras 6 horas é o exame inicial.',
        sourceUrl: 'https://example.org/cefaleia.pdf',
        origin: 'official_unreviewed',
        layer: 'now',
        basis: 'source',
      },
      {
        action: 'Analgesia',
        rationale: 'Controle da dor',
        citationChunkId: null,
        chunkId: null,
        source: 'Conhecimento geral do modelo',
        sourceVersion: '',
        sourceText: '',
        sourceUrl: '',
        origin: 'model_knowledge',
        basis: 'model_knowledge',
      },
    ],
    clarifyingQuestions: [],
    uncertainty: false,
    uncertaintyReason: null,
  };
}

export function sepsisAnalysis(): Record<string, unknown> {
  return {
    reasoning: 'Febre com hipotensão.',
    understanding: {
      problemRepresentation: 'Homem, 70 anos, febre e hipotensão.',
      syndrome: 'febre-hipotensao',
      syndromeNote: null,
      cannotMiss: [
        { hypothesis: 'Choque séptico', whyPlausible: 'x', confirmOrRuleOut: 'lactato' },
      ],
      likely: [],
    },
    redFlags: [],
    differentials: [],
    recommendations: [
      {
        action: 'Coletar hemoculturas e iniciar antibiótico na primeira hora',
        rationale: 'Sepse com hipotensão',
        chunkId: 'chunk-sepse-1',
        citationChunkId: 'chunk-sepse-1',
        source: 'Protocolo de sepse',
        sourceVersion: '2025',
        sourceText: 'Iniciar antimicrobiano na primeira hora após o reconhecimento da sepse.',
        sourceUrl: '',
        origin: 'curated_unsigned',
      },
      {
        action: 'Ler o anexo do médico',
        rationale: 'Referência anexada',
        chunkId: 'attachment:1',
        citationChunkId: 'attachment:1',
        source: 'anexo.pdf',
        sourceVersion: 'anexo',
        sourceText: `Paciente ${PATIENT_REF} com histórico no anexo.`,
        sourceUrl: '',
        origin: 'physician_attachment',
      },
    ],
    clarifyingQuestions: [],
    uncertainty: false,
    uncertaintyReason: null,
  };
}

let sequence = 0;

export function analysisRow(overrides: Partial<ReviewAnalysisRow> = {}): ReviewAnalysisRow {
  sequence += 1;
  return {
    interactionId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    encounterId: `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    patientRef: PATIENT_REF,
    createdAt: new Date('2026-10-14T12:00:00Z'),
    rawOutput: headacheAnalysis(),
    ...overrides,
  };
}

/** Uma resposta do modelo no formato `shift_review_questions`. */
export function reviewQuestionsWire(
  overrides: Array<Record<string, unknown>> = [],
): Record<string, unknown> {
  const base = [
    {
      sourceKey: 'F1',
      topic: 'Cefaleia em trovoada',
      format: 'multiple_choice',
      stem: 'Em adulto com cefaleia súbita e intensa, qual é o exame inicial?',
      options: [
        'TC de crânio sem contraste',
        'Punção lombar antes da imagem',
        'Ressonância eletiva',
        'Nenhum exame',
      ],
      correctOption: 0,
      explanation: 'A fonte orienta TC sem contraste nas primeiras 6 horas como exame inicial.',
    },
    {
      sourceKey: 'F1',
      topic: 'Hemorragia subaracnóidea',
      format: 'true_false',
      stem: 'Cefaleia em trovoada pode ser conduzida como enxaqueca sem exame de imagem.',
      options: ['Verdadeiro', 'Falso'],
      correctOption: 1,
      explanation: 'A cefaleia em trovoada exige afastar HSA com TC antes de outra hipótese.',
    },
    {
      sourceKey: 'F2',
      topic: 'Sepse',
      format: 'true_false',
      stem: 'Na sepse, o antimicrobiano deve começar na primeira hora após o reconhecimento.',
      options: ['Verdadeiro', 'Falso'],
      correctOption: 0,
      explanation: 'O protocolo citado pede antimicrobiano na primeira hora.',
    },
  ];
  return {
    questions: base.map((question, index) => ({ ...question, ...(overrides[index] ?? {}) })),
  };
}
