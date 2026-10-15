import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `rass` do ANY. Níveis e faixas iguais; o valor aparece com sinal
 * ("+3", "-2"), como na escala. Ações como sugestão.
 */
export const RASS: ClassificationCalculator = {
  kind: 'classification',
  id: 'rass',
  name: 'RASS (Richmond Agitation-Sedation Scale)',
  aliases: ['rass', 'richmond', 'sedação', 'agitação', 'nível de sedação', 'uti'],
  category: 'Sedação / Dor',
  description: 'Escala padronizada de sedação e agitação para pacientes críticos.',
  reference: {
    why: 'Referência para a titulação de sedativos na UTI e pré-requisito para a avaliação de delirium (CAM-ICU).',
    whenToUse:
      'Avaliação do nível de sedação/agitação em pacientes de UTI, especialmente sob ventilação mecânica.',
    pearlsPitfalls: [
      'RASS 0 = alerta e calmo. Meta habitual: RASS -2 a 0.',
      'RASS -3: necessário para aplicar o CAM-ICU (paciente responde à voz).',
      'RASS -4 e -5: sedação profunda; não aplicar o CAM-ICU.',
      'RASS +1 a +4: agitação; avaliar a causa (dor, delirium, hipóxia) antes de sedar.',
      'Avaliar a cada 4 h ou conforme o protocolo institucional.',
    ],
    citation:
      'Sessler CN et al. The Richmond Agitation-Sedation Scale: validity and reliability in adult intensive care unit patients. Am J Respir Crit Care Med. 2002;166(10):1338-44.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('level', 'Nível de sedação/agitação', [
      ['+4', '+4 Combativo — violento, perigo imediato para a equipe', 4],
      ['+3', '+3 Muito agitado — puxa ou remove tubos/cateteres, agressivo', 3],
      ['+2', '+2 Agitado — movimentos frequentes sem propósito, assincronia com o ventilador', 2],
      ['+1', '+1 Inquieto — ansioso, mas sem movimentos agressivos ou vigorosos', 1],
      ['0', '0 Alerta e calmo', 0],
      [
        '-1',
        '-1 Sonolento — não completamente alerta, mas desperta sustentadamente ao estímulo verbal (> 10 s)',
        -1,
      ],
      [
        '-2',
        '-2 Sedação leve — desperta brevemente ao estímulo verbal, com contato visual (< 10 s)',
        -2,
      ],
      [
        '-3',
        '-3 Sedação moderada — movimento ou abertura ocular ao estímulo verbal, sem contato visual',
        -3,
      ],
      [
        '-4',
        '-4 Sedação profunda — sem resposta ao estímulo verbal; movimento ou abertura ocular ao estímulo físico',
        -4,
      ],
      ['-5', '-5 Não despertável — sem resposta a estímulo verbal ou físico', -5],
    ]),
  ],
  formatValue: (value) => (value > 0 ? `+${value}` : String(value)),
  interpretation: {
    bands: [
      {
        id: 'sedacao-profunda',
        upTo: { value: -4, inclusive: true },
        label: 'Sedação profunda',
        tone: 'critical',
        action:
          'Sedação profunda. Não aplicar o CAM-ICU. Considere reduzir a sedação se não houver indicação de sedação profunda.',
      },
      {
        id: 'sedacao-moderada',
        upTo: { value: -3, inclusive: true },
        label: 'Sedação moderada',
        tone: 'attention',
        action: 'Sedação moderada. CAM-ICU aplicável. Considere reduzir a sedação, se possível.',
      },
      {
        id: 'sedacao-leve',
        upTo: { value: -1, inclusive: true },
        label: 'Sedação leve',
        tone: 'neutral',
        action: 'Sedação leve. Meta habitual para a maioria dos pacientes em VM (-2 a 0).',
      },
      {
        id: 'alerta',
        upTo: { value: 0, inclusive: true },
        label: 'Alerta e calmo',
        tone: 'neutral',
        action: 'Estado ideal na maioria dos cenários. Meta atingida.',
      },
      {
        id: 'agitacao-leve',
        upTo: { value: 2, inclusive: true },
        label: 'Agitação leve',
        tone: 'attention',
        action:
          'Agitação leve a moderada. Considere avaliar a causa e medidas não farmacológicas primeiro.',
      },
    ],
    otherwise: {
      id: 'agitacao-grave',
      label: 'Agitação grave',
      tone: 'critical',
      action:
        'Agitação grave. Considere investigar a causa (dor, delirium, hipóxia, abstinência) e tratá-la antes da sedação.',
    },
  },
};
