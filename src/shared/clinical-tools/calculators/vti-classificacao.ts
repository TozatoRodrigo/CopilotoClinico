import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `vtiClassificação` do ANY. Faixas de VTI e ações iguais, como
 * sugestão. Também existe no roteiro de choque do ANY (VTI está no choque
 * indiferenciado, CC-317): o link aparece quando o roteiro abrir no Copiloto.
 */
export const VTI_CLASSIFICACAO: ClassificationCalculator = {
  kind: 'classification',
  id: 'vti-classificacao',
  name: 'Classificação hemodinâmica por VTI (Mercadal 2022)',
  aliases: [
    'vti',
    'classificação hemodinâmica',
    'pocus',
    'eco',
    'débito cardíaco',
    'ecocardiografia',
  ],
  category: 'POCUS / Hemodinâmica',
  description:
    'Classificação hemodinâmica rápida baseada na VTI da VSVE medida por ecocardiografia point-of-care.',
  pathway: { toolId: 'choque-indiferenciado' },
  reference: {
    why: 'A VTI permite avaliar rápida e não invasivamente o débito cardíaco à beira-leito, sem cálculo complexo.',
    whenToUse:
      'Avaliação hemodinâmica rápida de pacientes em choque ou instabilidade hemodinâmica com eco point-of-care.',
    pearlsPitfalls: [
      'VTI < 16 cm: baixo débito cardíaco provável. Considere causas cardiogênicas ou obstrutivas.',
      'VTI 16–20 cm: débito cardíaco borderline. Correlacionar com o contexto clínico.',
      'VTI > 20 cm: débito cardíaco provavelmente adequado ou elevado.',
      'Medir na VSVE com Doppler pulsado em janela apical 5 câmaras.',
      'A VTI independe do diâmetro da VSVE: não é preciso medir o diâmetro para a triagem rápida.',
      'Delta VTI > 12–15% após prova de volume sugere responsividade a fluidos.',
    ],
    citation:
      'Mercadal J et al. Echocardiographic assessment of the hemodynamic profile in critically ill patients. Ann Intensive Care. 2022;12:97.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('vti_range', 'VTI da VSVE (cm)', [
      ['lt16', 'VTI < 16 cm — baixo débito', 1],
      ['16-20', 'VTI 16–20 cm — borderline', 2],
      ['gt20', 'VTI > 20 cm — débito adequado/elevado', 3],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 1, inclusive: true },
        label: 'VTI < 16 cm — baixo débito',
        tone: 'critical',
        action:
          'Débito cardíaco provavelmente reduzido. Considere choque cardiogênico, tamponamento e TEP maciço; avalie a responsividade a volume e, se não responsivo, inotrópico.',
      },
      {
        id: 'borderline',
        upTo: { value: 2, inclusive: true },
        label: 'VTI 16–20 cm — borderline',
        tone: 'attention',
        action:
          'Débito cardíaco limítrofe. Considere correlacionar com a clínica, prova de volume (delta VTI > 12–15% = responsivo) e a causa do choque, se presente.',
      },
    ],
    otherwise: {
      id: 'adequado',
      label: 'VTI > 20 cm — débito adequado/elevado',
      tone: 'neutral',
      action:
        'Débito cardíaco provavelmente adequado ou elevado. Se houver choque, considere distributivo (sepse) ou obstrutivo e avalie a resistência vascular.',
    },
  },
};
