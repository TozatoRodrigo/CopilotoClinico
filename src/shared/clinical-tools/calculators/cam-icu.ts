import { byRule, type ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, binaryItem } from './items';

const PRESENCE = ['Ausente', 'Presente'] as const;

/**
 * Porte do `camIcu` do ANY. A soma não decide: positivo exige F1 e F2 e (F3
 * ou F4), a mesma regra de lá. As ações passaram para a forma de sugestão.
 */
export const CAM_ICU: ScoreCalculator = {
  kind: 'score',
  id: 'cam-icu',
  name: 'CAM-ICU',
  aliases: ['cam', 'delirium', 'confusão', 'agitação', 'uti', 'rebaixamento'],
  category: 'Neurologia',
  description: 'Diagnóstico de delirium em pacientes críticos (intubados ou não).',
  reference: {
    why: 'Delirium é subdiagnosticado na UTI e associado a aumento de mortalidade e do tempo de internação. O CAM-ICU tem sensibilidade de 80% e especificidade de 96%.',
    whenToUse:
      'Avaliação diária de delirium em pacientes internados em UTI, especialmente sob sedação ou ventilação mecânica.',
    pearlsPitfalls: [
      'Requer RASS ≥ -3 para aplicação (paciente com alguma resposta à voz).',
      'Feature 1 (início agudo) E Feature 2 (inatenção) devem estar presentes.',
      'Além disso, Feature 3 (pensamento desorganizado) OU Feature 4 (nível de consciência alterado) deve estar presente.',
      'Testar inatenção com o teste de letras: "Aperte minha mão quando eu disser a letra A" — SAVEAHAART.',
      'Delirium hipoativo é mais comum que o hiperativo e frequentemente não diagnosticado.',
    ],
    citation:
      'Ely EW et al. Evaluation of delirium in critically ill patients: validation of the Confusion Assessment Method for the Intensive Care Unit (CAM-ICU). Crit Care Med. 2001;29(7):1370-9.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    binaryItem('f1', 'Feature 1: início agudo ou curso flutuante', PRESENCE),
    binaryItem('f2', 'Feature 2: inatenção (erro ≥ 2 no teste de letras)', PRESENCE),
    binaryItem(
      'f3',
      'Feature 3: pensamento desorganizado (erro ≥ 1 em perguntas simples ou não segue comandos)',
      PRESENCE,
    ),
    binaryItem('f4', 'Feature 4: nível de consciência alterado (RASS diferente de 0)', PRESENCE),
  ],
  formatValue: bandIsResult,
  interpretation: byRule(
    [
      {
        id: 'positivo',
        label: 'CAM-ICU positivo — delirium presente',
        tone: 'critical',
        action:
          'Delirium confirmado. Considere investigar causas reversíveis (infecção, distúrbio metabólico, drogas) e medidas não farmacológicas.',
      },
      {
        id: 'negativo',
        label: 'CAM-ICU negativo — delirium ausente',
        tone: 'neutral',
        action: 'Sem critérios de delirium no momento. Considere reavaliar diariamente.',
      },
    ],
    (_value, values) =>
      values.f1 && values.f2 && (values.f3 || values.f4) ? 'positivo' : 'negativo',
  ),
};
