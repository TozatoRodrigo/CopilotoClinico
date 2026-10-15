import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `news2` do ANY. Parâmetros, pontos e faixas iguais. As ações do
 * ANY começavam com "NEWS2: <escore>."; o escore já aparece como valor, então
 * saiu do texto, e o resto virou sugestão.
 */
export const NEWS2: ScoreCalculator = {
  kind: 'score',
  id: 'news2',
  name: 'NEWS2 (National Early Warning Score)',
  aliases: ['news', 'news2', 'alerta precoce', 'deterioracao clínica', 'triagem', 'early warning'],
  category: 'Respiratório / Sepse',
  description: 'Escore de alerta precoce para deterioração clínica em pacientes internados.',
  reference: {
    why: 'Detecta precocemente pacientes em risco de deterioração clínica, permitindo intervenção rápida.',
    whenToUse:
      'Avaliação rotineira de pacientes internados em enfermaria. Monitoramento de pacientes com risco de deterioração.',
    pearlsPitfalls: [
      'Inclui 7 parâmetros: FR, SpO₂, O2 suplementar, temperatura, PAS, FC, consciência (ACVPU).',
      'NEWS ≥ 5 (ou 3 em parâmetro único): considere revisão médica urgente.',
      'NEWS ≥ 7: emergência clínica; considere transferência para UTI.',
      'Escala 2 de SpO₂ para pacientes com insuficiência respiratória hipercápnica crônica (meta SpO₂ 88–92%).',
      'A frequência de monitoramento deve aumentar conforme o escore.',
    ],
    citation:
      'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('rr', 'Frequência respiratória (irpm)', [
      ['lte8', '≤ 8', 3],
      ['9-11', '9–11', 1],
      ['12-20', '12–20', 0],
      ['21-24', '21–24', 2],
      ['gte25', '≥ 25', 3],
    ]),
    choiceItem('spo2', 'SpO₂ (escala 1 — padrão)', [
      ['lte91', '≤ 91%', 3],
      ['92-93', '92–93%', 2],
      ['94-95', '94–95%', 1],
      ['gte96', '≥ 96%', 0],
    ]),
    choiceItem('o2', 'O2 suplementar', [
      ['ar', 'Ar ambiente', 0],
      ['o2', 'O2 suplementar em uso', 2],
    ]),
    choiceItem('temp', 'Temperatura (graus Celsius)', [
      ['lte35', '≤ 35,0', 3],
      ['35.1-36', '35,1–36,0', 1],
      ['36.1-38', '36,1–38,0', 0],
      ['38.1-39', '38,1–39,0', 1],
      ['gte39.1', '≥ 39,1', 2],
    ]),
    choiceItem('sbp', 'Pressão arterial sistólica (mmHg)', [
      ['lte90', '≤ 90', 3],
      ['91-100', '91–100', 2],
      ['101-110', '101–110', 1],
      ['111-219', '111–219', 0],
      ['gte220', '≥ 220', 3],
    ]),
    choiceItem('hr', 'Frequência cardíaca (bpm)', [
      ['lte40', '≤ 40', 3],
      ['41-50', '41–50', 1],
      ['51-90', '51–90', 0],
      ['91-110', '91–110', 1],
      ['111-130', '111–130', 2],
      ['gte131', '≥ 131', 3],
    ]),
    choiceItem('consciousness', 'Nível de consciência', [
      ['a', 'Alerta (A)', 0],
      ['c', 'Confusão nova (C)', 3],
      ['v', 'Responde à voz (V)', 3],
      ['p', 'Responde à dor (P)', 3],
      ['u', 'Não responsivo (U)', 3],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 4, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action:
          'Considere monitoramento de rotina (no mínimo a cada 12 h) e manter a vigilância clínica.',
      },
      {
        id: 'medio',
        upTo: { value: 6, inclusive: true },
        label: 'Risco médio',
        tone: 'attention',
        action: 'Considere monitoramento a cada 4–6 h e revisão médica urgente.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action:
        'Emergência clínica. Considere revisão médica sem demora, transferência para UTI e monitoramento contínuo.',
    },
  },
};
