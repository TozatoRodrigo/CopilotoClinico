import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, type OptionTuple } from './items';

const ZERO_TO_SEVEN = (labels: readonly string[]): OptionTuple[] =>
  labels.map((label, points) => [String(points), `${points} — ${label}`, points]);

const HALLUCINATIONS = [
  'alucinações moderadamente graves',
  'alucinações graves',
  'alucinações muito graves',
  'alucinações contínuas',
];

/**
 * Porte do `ciwaAr` do ANY. Itens, pontos e faixas iguais: os cinco primeiros
 * itens têm só 4 opções (0, 2, 5 e 7), como lá (achado para a revisão
 * clínica, CC-310). O id "náusea" virou "nausea". Também existe no roteiro de
 * Toxicologia do ANY: o link aparece quando o roteiro abrir no Copiloto.
 */
export const CIWA_AR: ScoreCalculator = {
  kind: 'score',
  id: 'ciwa-ar',
  name: 'CIWA-Ar',
  aliases: ['ciwa', 'abstinência', 'alcoolismo', 'delirium tremens', 'síndrome de abstinência'],
  category: 'Toxicologia',
  description:
    'Gravidade da síndrome de abstinência alcoólica e guia de tratamento com benzodiazepínicos.',
  pathway: { toolId: 'toxicologia' },
  reference: {
    why: 'Permite tratamento guiado por protocolo com benzodiazepínicos baseado em sintomas, evitando sub ou sobretratamento.',
    whenToUse:
      'Pacientes com síndrome de abstinência alcoólica confirmada ou suspeitada, para guiar as doses de benzodiazepínicos.',
    pearlsPitfalls: [
      'Avaliar a cada 1–2 h durante o tratamento ativo.',
      'CIWA ≥ 8: considere benzodiazepínico.',
      'CIWA ≥ 20: abstinência grave, com risco de convulsão e delirium tremens.',
      'Não é aplicável em pacientes intubados ou não cooperativos.',
      'Diazepam ou lorazepam são as opções mais comuns para tratar.',
    ],
    citation:
      'Sullivan JT et al. Assessment of alcohol withdrawal: the revised Clinical Institute Withdrawal Assessment for Alcohol scale (CIWA-Ar). Br J Addict. 1989;84(11):1353-7.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('nausea', 'Náusea e vômitos', [
      ['0', 'Sem náusea ou vômitos (0)', 0],
      ['2', 'Náusea leve sem vômitos (1–3)', 2],
      ['5', 'Náusea intermitente com ânsia (4–6)', 5],
      ['7', 'Náusea constante, ânsia e vômitos (7)', 7],
    ]),
    choiceItem('tremor', 'Tremor (braços estendidos, dedos separados)', [
      ['0', 'Sem tremor (0)', 0],
      ['2', 'Não visível, sentido nos dedos (1–3)', 2],
      ['5', 'Moderado, com braços estendidos (4–6)', 5],
      ['7', 'Grave, mesmo sem braços estendidos (7)', 7],
    ]),
    choiceItem('sweat', 'Sudorese paroxística', [
      ['0', 'Sem sudorese visível (0)', 0],
      ['2', 'Sudorese leve, palmas úmidas (1–3)', 2],
      ['5', 'Sudorese visível na fronte (4–6)', 5],
      ['7', 'Sudorese profusa (7)', 7],
    ]),
    choiceItem('anxiety', 'Ansiedade', [
      ['0', 'Sem ansiedade, tranquilo (0)', 0],
      ['2', 'Levemente ansioso (1–3)', 2],
      ['5', 'Moderadamente ansioso ou inquieto (4–6)', 5],
      ['7', 'Pânico, ansiedade grave (7)', 7],
    ]),
    choiceItem('agitation', 'Agitação', [
      ['0', 'Atividade normal (0)', 0],
      ['2', 'Atividade um pouco acima do normal (1–3)', 2],
      ['5', 'Moderadamente inquieto e agitado (4–6)', 5],
      ['7', 'Deambula durante a entrevista ou agitação constante (7)', 7],
    ]),
    choiceItem(
      'tactile',
      'Alterações táteis (prurido, queimação, dormência, formigamento)',
      ZERO_TO_SEVEN([
        'nenhuma',
        'prurido/dormência muito leve',
        'leve',
        'moderada',
        ...HALLUCINATIONS,
      ]),
    ),
    choiceItem(
      'auditory',
      'Alterações auditivas (sons ásperos, assustadores)',
      ZERO_TO_SEVEN(['ausente', 'muito leve', 'leve', 'moderada', ...HALLUCINATIONS]),
    ),
    choiceItem(
      'visual',
      'Alterações visuais (sensibilidade à luz, cores, formas)',
      ZERO_TO_SEVEN(['ausente', 'muito leve', 'leve', 'moderada', ...HALLUCINATIONS]),
    ),
    choiceItem(
      'headache',
      'Cefaleia, sensação de cabeça pesada',
      ZERO_TO_SEVEN([
        'ausente',
        'muito leve',
        'leve',
        'moderada',
        'moderadamente grave',
        'grave',
        'muito grave',
        'extremamente grave',
      ]),
    ),
    choiceItem('orientation', 'Orientação e turvação da consciência', [
      ['0', 'Orientado, capaz de fazer soma seriada (0)', 0],
      ['1', 'Incerto sobre a data (1)', 1],
      ['2', 'Desorientado na data (< 2 dias) (2)', 2],
      ['3', 'Desorientado na data (> 2 dias) (3)', 3],
      ['4', 'Desorientado em pessoa e/ou lugar (4)', 4],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'leve',
        upTo: { value: 8, inclusive: false },
        label: 'Abstinência leve',
        tone: 'neutral',
        action:
          'CIWA < 8. Considere monitoramento a cada 4–8 h. Benzodiazepínico geralmente não necessário.',
      },
      {
        id: 'moderada',
        upTo: { value: 16, inclusive: false },
        label: 'Abstinência moderada',
        tone: 'attention',
        action:
          'CIWA 8–15. Considere benzodiazepínico (ex.: diazepam 5–10 mg VO) e reavaliar a cada 1–2 h.',
      },
      {
        id: 'moderada-grave',
        upTo: { value: 20, inclusive: false },
        label: 'Abstinência moderada-grave',
        tone: 'critical',
        action:
          'CIWA 16–19. Benzodiazepínico recomendado. Considere monitoramento próximo: risco de convulsão.',
      },
    ],
    otherwise: {
      id: 'grave',
      label: 'Abstinência grave',
      tone: 'critical',
      action:
        'CIWA ≥ 20. Alto risco de delirium tremens e convulsão. Considere benzodiazepínico IV e UTI.',
    },
  },
};
