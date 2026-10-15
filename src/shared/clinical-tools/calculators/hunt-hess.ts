import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `huntHess` do ANY. Graus, faixas e ações iguais; o grau é o resultado. */
export const HUNT_HESS: ClassificationCalculator = {
  kind: 'classification',
  id: 'hunt-hess',
  name: 'Escala de Hunt-Hess',
  aliases: ['hunt hess', 'hsa', 'hemorragia subaracnoidea', 'aneurisma'],
  category: 'Neurologia',
  description: 'Classificação clínica de gravidade da hemorragia subaracnoidea.',
  reference: {
    why: 'Prediz mortalidade e desfecho funcional. Guia a urgência do tratamento do aneurisma.',
    whenToUse:
      'Pacientes com HSA confirmada, para estratificar gravidade e comunicar entre equipes.',
    pearlsPitfalls: [
      'Graus I–III geralmente recebem tratamento precoce do aneurisma (< 72 h).',
      'Graus IV–V têm mortalidade > 50%: a decisão de tratamento deve ser individualizada.',
      'A avaliação pode flutuar: reavaliar após estabilização hemodinâmica.',
      'Comorbidades e idade influenciam o prognóstico independentemente do grau.',
    ],
    citation:
      'Hunt WE, Hess RM. Surgical risk as related to time of intervention in the repair of intracranial aneurysms. J Neurosurg. 1968;28(1):14-20.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('grade', 'Apresentação clínica', [
      ['i', 'Grau I — assintomático ou cefaleia mínima, rigidez de nuca leve', 1],
      [
        'ii',
        'Grau II — cefaleia moderada a intensa, rigidez de nuca, sem déficit focal (exceto paralisia de nervo craniano)',
        2,
      ],
      ['iii', 'Grau III — sonolência, confusão ou déficit focal leve', 3],
      [
        'iv',
        'Grau IV — estupor, hemiparesia moderada a grave, possível rigidez de descerebração precoce',
        4,
      ],
      ['v', 'Grau V — coma profundo, rigidez de descerebração, aparência moribunda', 5],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'i',
        upTo: { value: 1, inclusive: true },
        label: 'Grau I',
        tone: 'neutral',
        action: 'Mortalidade cirúrgica ~1%. Tratamento precoce do aneurisma recomendado.',
      },
      {
        id: 'ii',
        upTo: { value: 2, inclusive: true },
        label: 'Grau II',
        tone: 'neutral',
        action: 'Mortalidade cirúrgica ~5%. Tratamento precoce do aneurisma recomendado.',
      },
      {
        id: 'iii',
        upTo: { value: 3, inclusive: true },
        label: 'Grau III',
        tone: 'attention',
        action:
          'Mortalidade cirúrgica ~19%. Tratamento precoce geralmente indicado após estabilização.',
      },
      {
        id: 'iv',
        upTo: { value: 4, inclusive: true },
        label: 'Grau IV',
        tone: 'critical',
        action:
          'Mortalidade cirúrgica ~42%. Decisão individualizada; considere estabilização clínica antes.',
      },
    ],
    otherwise: {
      id: 'v',
      label: 'Grau V',
      tone: 'critical',
      action:
        'Mortalidade cirúrgica ~77%. Prognóstico reservado; tratamento conservador pode ser considerado.',
    },
  },
};
