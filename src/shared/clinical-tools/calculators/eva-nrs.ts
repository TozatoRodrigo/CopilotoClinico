import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `evaNrs` do ANY. Escala de 0 a 10 e faixas iguais; o valor aparece
 * sobre 10. A ação da dor intensa dizia "Analgesia imediata"; virou sugestão.
 */
export const EVA_NRS: ClassificationCalculator = {
  kind: 'classification',
  id: 'eva-nrs',
  name: 'EVA/NRS (Escala de Dor)',
  aliases: ['eva', 'nrs', 'escala de dor', 'dor', 'escala visual analógica', 'escala numérica'],
  category: 'Sedação / Dor',
  description: 'Escala numérica de dor autorreferida, de 0 a 10.',
  reference: {
    why: 'Padrão universal para quantificar a dor em pacientes que conseguem se comunicar. Guia o tratamento analgésico.',
    whenToUse: 'Qualquer paciente consciente e orientado com queixa de dor.',
    pearlsPitfalls: [
      '0 = sem dor. 10 = pior dor imaginável.',
      'Dor leve (1–3): analgesia simples (paracetamol, dipirona, AINEs).',
      'Dor moderada (4–6): analgesia combinada; considere opioide fraco.',
      'Dor intensa (7–10): opioide forte; considere bloqueio regional.',
      'Reavaliar após a intervenção. Meta: redução ≥ 2 pontos ou EVA < 4.',
    ],
    citation:
      'Hjermstad MJ et al. Studies comparing Numerical Rating Scales, Visual Analogue Scales, and Verbal Rating Scales for assessment of pain intensity in adults. J Pain Symptom Manage. 2011;41(6):1073-93.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('pain', 'Intensidade da dor (autorreferida)', [
      ['0', '0 — sem dor', 0],
      ['1', '1 — dor muito leve', 1],
      ['2', '2 — dor leve', 2],
      ['3', '3 — dor leve a moderada', 3],
      ['4', '4 — dor moderada', 4],
      ['5', '5 — dor moderada', 5],
      ['6', '6 — dor moderada a intensa', 6],
      ['7', '7 — dor intensa', 7],
      ['8', '8 — dor muito intensa', 8],
      ['9', '9 — dor quase insuportável', 9],
      ['10', '10 — pior dor imaginável', 10],
    ]),
  ],
  formatValue: (value) => `${value}/10`,
  interpretation: {
    bands: [
      {
        id: 'sem-dor',
        upTo: { value: 0, inclusive: true },
        label: 'Sem dor',
        tone: 'neutral',
        action: 'EVA/NRS 0. Sem necessidade de analgesia.',
      },
      {
        id: 'leve',
        upTo: { value: 3, inclusive: true },
        label: 'Dor leve (1–3)',
        tone: 'neutral',
        action:
          'Considere analgesia simples (paracetamol, dipirona ou AINE) e reavaliar em 30–60 min.',
      },
      {
        id: 'moderada',
        upTo: { value: 6, inclusive: true },
        label: 'Dor moderada (4–6)',
        tone: 'attention',
        action:
          'Considere analgesia combinada, opioide fraco (tramadol, codeína) ou bloqueio regional, e reavaliar em 30 min.',
      },
    ],
    otherwise: {
      id: 'intensa',
      label: 'Dor intensa (7–10)',
      tone: 'critical',
      action:
        'Considere analgesia sem demora: opioide forte (morfina, fentanil) e/ou bloqueio regional. Reavaliar em 15–30 min.',
    },
  },
};
