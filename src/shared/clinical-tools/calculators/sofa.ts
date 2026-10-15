import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `sofa` do ANY. Seis órgãos, pontos e faixas iguais; ações como
 * sugestão. A pérola "Utero de cada sistema" do ANY saiu corrigida (achado
 * para a revisão clínica, CC-310).
 */
export const SOFA: ScoreCalculator = {
  kind: 'score',
  id: 'sofa',
  name: 'SOFA Score',
  aliases: ['sofa', 'sequential organ failure', 'sepse', 'disfunção orgânica', 'mortalidade uti'],
  category: 'Respiratório / Sepse',
  description: 'Avaliação sequencial de disfunção orgânica: 6 órgãos, 0 a 24 pontos.',
  reference: {
    why: 'Define sepse (Sepsis-3): infecção + aumento ≥ 2 pontos no SOFA. Prediz mortalidade na UTI.',
    whenToUse: 'Pacientes com infecção suspeitada ou confirmada na UTI. Monitorar diariamente.',
    pearlsPitfalls: [
      'Variação do SOFA (delta-SOFA) ≥ 2 em relação ao basal sugere sepse.',
      'O SOFA basal é presumido 0 se não houver disfunção orgânica prévia.',
      'Inclui: PaO₂/FiO₂, plaquetas, bilirrubina, PAM/vasopressores, GCS, creatinina/diurese.',
      'SOFA ≥ 10 = mortalidade > 50%.',
      'Em cada sistema, avaliar o pior valor do dia.',
    ],
    citation:
      'Vincent JL et al. The SOFA (Sepsis-related Organ Failure Assessment) score to describe organ dysfunction/failure. Intensive Care Med. 1996;22(7):707-10.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('resp', 'Respiratório (PaO₂/FiO₂)', [
      ['gte400', '≥ 400', 0],
      ['300-399', '300–399', 1],
      ['200-299', '200–299', 2],
      ['100-199', '100–199 (com suporte ventilatório)', 3],
      ['lt100', '< 100 (com suporte ventilatório)', 4],
    ]),
    choiceItem('coag', 'Coagulação (plaquetas x10³/mm³)', [
      ['gte150', '≥ 150', 0],
      ['100-149', '100–149', 1],
      ['50-99', '50–99', 2],
      ['20-49', '20–49', 3],
      ['lt20', '< 20', 4],
    ]),
    choiceItem('liver', 'Hepático (bilirrubina mg/dL)', [
      ['lt1.2', '< 1,2', 0],
      ['1.2-1.9', '1,2–1,9', 1],
      ['2.0-5.9', '2,0–5,9', 2],
      ['6.0-11.9', '6,0–11,9', 3],
      ['gte12', '≥ 12,0', 4],
    ]),
    choiceItem('cardio', 'Cardiovascular', [
      ['pam-gte70', 'PAM ≥ 70 mmHg', 0],
      ['pam-lt70', 'PAM < 70 mmHg', 1],
      ['dopa-lte5', 'Dopamina ≤ 5 ou dobutamina (qualquer dose)', 2],
      ['dopa-gt5', 'Dopamina > 5, epinefrina ≤ 0,1 ou norepinefrina ≤ 0,1', 3],
      ['dopa-gt15', 'Dopamina > 15, epinefrina > 0,1 ou norepinefrina > 0,1', 4],
    ]),
    choiceItem('neuro', 'Neurológico (GCS)', [
      ['15', '15', 0],
      ['13-14', '13–14', 1],
      ['10-12', '10–12', 2],
      ['6-9', '6–9', 3],
      ['lt6', '< 6', 4],
    ]),
    choiceItem('renal', 'Renal (creatinina mg/dL ou diurese)', [
      ['lt1.2', '< 1,2', 0],
      ['1.2-1.9', '1,2–1,9', 1],
      ['2.0-3.4', '2,0–3,4', 2],
      ['3.5-4.9', '3,5–4,9 ou diurese < 500 mL/dia', 3],
      ['gte5', '≥ 5,0 ou diurese < 200 mL/dia', 4],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'leve',
        upTo: { value: 3, inclusive: true },
        label: 'Disfunção leve',
        tone: 'neutral',
        action: 'Mortalidade < 10%. Considere monitorar e repetir diariamente.',
      },
      {
        id: 'moderada',
        upTo: { value: 6, inclusive: true },
        label: 'Disfunção moderada',
        tone: 'attention',
        action:
          'Mortalidade ~10–20%. Considere investigar e tratar a causa. Sepse se aumento ≥ 2 do basal.',
      },
      {
        id: 'grave',
        upTo: { value: 9, inclusive: true },
        label: 'Disfunção grave',
        tone: 'critical',
        action: 'Mortalidade ~20–50%. Considere suporte orgânico intensivo.',
      },
    ],
    otherwise: {
      id: 'muito-grave',
      label: 'Disfunção muito grave',
      tone: 'critical',
      action: 'Mortalidade > 50%. Considere suporte máximo e, se refratário, cuidados paliativos.',
    },
  },
};
