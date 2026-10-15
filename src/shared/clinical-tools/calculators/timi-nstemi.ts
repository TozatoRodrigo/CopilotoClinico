import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/** Porte do `timiNstemi` do ANY. Conta, faixas e ações iguais; só acentuação corrigida. */
export const TIMI_NSTEMI: ScoreCalculator = {
  kind: 'score',
  id: 'timi-nstemi',
  name: 'TIMI Risk Score (NSTEMI)',
  aliases: ['timi', 'nstemi', 'iamssst', 'angina instável'],
  category: 'Cardiologia / SCA',
  description: 'Risco de eventos adversos em 14 dias no IAMSSST/angina instável.',
  reference: {
    why: 'Validado nos estudos TIMI 11B e ESSENCE: prediz morte, IAM e revascularização urgente em 14 dias.',
    whenToUse:
      'Pacientes com diagnóstico de IAMSSST ou angina instável. Menos útil como triagem inicial no DE (preferir HEART).',
    pearlsPitfalls: [
      'Derivado de população de ensaio clínico: pode subestimar o risco em populações de DE.',
      'Uso de AAS nos últimos 7 dias é um item: reflete doença crônica.',
      'Estenose ≥ 50% exige conhecimento prévio de cateterismo.',
      'Não inclui função renal nem insuficiência cardíaca, que são preditores independentes.',
    ],
    citation:
      'Antman EM et al. The TIMI risk score for unstable angina/non-ST elevation MI. JAMA. 2000;284(7):835-42.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('age65', 'Idade ≥ 65 anos'),
    yesNoItem(
      'cad',
      '≥ 3 fatores de risco para DAC (HAS, DM, dislipidemia, tabagismo, história familiar)',
    ),
    yesNoItem('stenosis', 'Estenose coronariana conhecida ≥ 50%'),
    yesNoItem('stdev', 'Desvio de ST ≥ 0,5 mm no ECG de admissão'),
    yesNoItem('angina', '≥ 2 episódios de angina nas últimas 24 h'),
    yesNoItem('asa', 'Uso de AAS nos últimos 7 dias'),
    yesNoItem('troponin', 'Elevação de marcadores cardíacos (troponina)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 2, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Risco de evento em 14 dias: 4,7–8,3%. Considere abordagem conservadora.',
      },
      {
        id: 'intermediario',
        upTo: { value: 4, inclusive: true },
        label: 'Risco intermediário',
        tone: 'attention',
        action:
          'Risco de evento em 14 dias: 13,2–19,9%. Considere estratificação não invasiva ou invasiva.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'Risco de evento em 14 dias: 26,2–40,9%. Considere estratificação invasiva precoce.',
    },
  },
};
