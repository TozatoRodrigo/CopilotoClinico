import { requireValue, type ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `gcs` do ANY. Componentes e faixas iguais; a ação da faixa grave
 * passou para a forma de sugestão. Os componentes saem como detalhe
 * ("E3V4M6"), como a pérola pede.
 */
export const GCS: ScoreCalculator = {
  kind: 'score',
  id: 'gcs',
  name: 'Escala de Coma de Glasgow (GCS)',
  aliases: ['gcs', 'glasgow', 'coma', 'consciência', 'tce', 'trauma'],
  category: 'Neurologia',
  description: 'Avaliação padronizada do nível de consciência.',
  reference: {
    why: 'Escala universal para comunicação rápida sobre nível de consciência entre equipes.',
    whenToUse: 'Todo paciente com alteração de consciência: trauma, AVC, intoxicação, pós-PCR.',
    pearlsPitfalls: [
      'Sempre reportar os componentes individuais (ex.: E3V4M6 = 13).',
      'GCS ≤ 8 = via aérea desprotegida: considere intubação.',
      'A resposta motora é o componente com maior valor prognóstico isolado.',
      'Fatores confundidores: intoxicação, sedação, paralisia, afasia, edema palpebral.',
      'A reatividade pupilar deve ser avaliada em conjunto (GCS-P).',
    ],
    citation:
      'Teasdale G, Jennett B. Assessment of coma and impaired consciousness. Lancet. 1974;2(7872):81-4.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('eye', 'Abertura ocular (E)', [
      ['e1', 'E1 — nenhuma', 1],
      ['e2', 'E2 — à pressão/dor', 2],
      ['e3', 'E3 — à voz', 3],
      ['e4', 'E4 — espontânea', 4],
    ]),
    choiceItem('verbal', 'Resposta verbal (V)', [
      ['v1', 'V1 — nenhuma', 1],
      ['v2', 'V2 — sons incompreensíveis', 2],
      ['v3', 'V3 — palavras inapropriadas', 3],
      ['v4', 'V4 — confuso', 4],
      ['v5', 'V5 — orientado', 5],
    ]),
    choiceItem('motor', 'Resposta motora (M)', [
      ['m1', 'M1 — nenhuma', 1],
      ['m2', 'M2 — extensão à dor (descerebração)', 2],
      ['m3', 'M3 — flexão anormal (decorticação)', 3],
      ['m4', 'M4 — retirada à dor', 4],
      ['m5', 'M5 — localização da dor', 5],
      ['m6', 'M6 — obedece a comandos', 6],
    ]),
  ],
  details: (_value, values) => [
    {
      label: 'Componentes',
      value: `E${requireValue(values, 'eye')}V${requireValue(values, 'verbal')}M${requireValue(values, 'motor')}`,
    },
  ],
  interpretation: {
    bands: [
      {
        id: 'grave',
        upTo: { value: 8, inclusive: true },
        label: 'Grave (GCS 3–8)',
        tone: 'critical',
        action:
          'Via aérea desprotegida: considere intubação. Considere investigar a causa e imagem de urgência.',
      },
      {
        id: 'moderado',
        upTo: { value: 12, inclusive: true },
        label: 'Moderado (GCS 9–12)',
        tone: 'attention',
        action: 'Monitoramento próximo. Considere TC e causa reversível.',
      },
    ],
    otherwise: {
      id: 'leve',
      label: 'Leve (GCS 13–15)',
      tone: 'neutral',
      action: 'Nível de consciência levemente rebaixado ou preservado.',
    },
  },
};
