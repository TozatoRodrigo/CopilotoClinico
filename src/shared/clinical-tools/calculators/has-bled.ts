import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/**
 * Porte do `hasBled` do ANY. Conta e faixas iguais; as ações das faixas 2 e
 * 3+ passaram para a forma de sugestão (ADR-017).
 */
export const HAS_BLED: ScoreCalculator = {
  kind: 'score',
  id: 'has-bled',
  name: 'HAS-BLED',
  aliases: ['hasbled', 'sangramento', 'anticoagulação', 'risco hemorrágico'],
  category: 'Cardiologia / SCA',
  description: 'Risco de sangramento maior em pacientes anticoagulados com FA.',
  reference: {
    why: 'Identifica fatores de risco modificáveis de sangramento. Não deve ser usado isoladamente para contraindicar anticoagulação.',
    whenToUse:
      'Em conjunto com o CHA2DS2-VASc, para avaliar o risco-benefício da anticoagulação em FA.',
    pearlsPitfalls: [
      'Escore alto NÃO contraindica anticoagulação; indica necessidade de monitoramento mais próximo.',
      'Fatores modificáveis: HAS não controlada, INR lábil, uso de AINEs/antiplaquetários, etilismo.',
      'Corrigir fatores modificáveis pode reduzir significativamente o risco de sangramento.',
      'Aplicável a pacientes com FA não valvar; validação limitada em valvopatas.',
    ],
    citation:
      'Pisters R et al. A novel user-friendly score (HAS-BLED) to assess 1-year risk of major bleeding in patients with atrial fibrillation. Chest. 2010;138(5):1093-100.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-14',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('htn', 'Hipertensão não controlada (PAS > 160 mmHg) (H)'),
    yesNoItem('renal', 'Insuficiência renal (diálise, transplante, Cr > 2,26 mg/dL) (A)'),
    yesNoItem(
      'liver',
      'Insuficiência hepática (cirrose, bilirrubina > 2x, transaminases > 3x) (A)',
    ),
    yesNoItem('stroke', 'AVC prévio (S)'),
    yesNoItem('bleeding', 'História de sangramento maior ou predisposição (B)'),
    yesNoItem('inr', 'INR lábil (tempo na faixa terapêutica < 60%) (L)'),
    yesNoItem('age', 'Idade > 65 anos (E)'),
    yesNoItem('drugs', 'Uso de antiplaquetários ou AINEs (D)'),
    yesNoItem('alcohol', 'Etilismo (≥ 8 doses/semana) (D)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 1, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Risco de sangramento maior em 1 ano: 1,02–1,88%. Anticoagulação segura.',
      },
      {
        id: 'moderado',
        upTo: { value: 2, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action:
          'Risco de sangramento maior em 1 ano: 1,88–3,74%. Considere monitorar de perto e corrigir fatores modificáveis.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action:
        'Risco de sangramento maior em 1 ano: ≥ 3,74%. Considere monitoramento frequente e correção dos fatores modificáveis. O escore isolado não contraindica anticoagulação.',
    },
  },
};
