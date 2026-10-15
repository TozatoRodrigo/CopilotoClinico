import type { ContentProvenance } from '../provenance';
import type { NumericRange } from '../ranges';

/**
 * Conteúdo clínico do roteiro de parada (ACLS) portado do `AclsGuide` do ANY
 * (ADR-017): tempos, medicações, textos do card "Agora", lembretes e o ritmo
 * do metrônomo. Nenhum desses números mora em componente; a tela só desenha.
 *
 * Paridade com o ANY é a regra: o que pareceu inconsistente está em
 * docs/ferramentas/revisao-clinica/acls.md para a revisão clínica (CC-310),
 * não corrigido aqui. Só mudou acentuação, ordinal ("3º") e imperativo
 * trocado por sugestão; a lista do que mudou está no mesmo arquivo.
 */

export const ACLS_PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · AclsGuide.tsx e MetronomeContext.tsx (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export const ACLS_REFERENCE_CITATION =
  'American Heart Association. Diretrizes de 2025 para RCP e atendimento cardiovascular de emergência (AHA 2025).';

/** Ciclo de RCP entre checagens de ritmo (ANY: `setCycleRemaining(120)`). */
export const ACLS_CYCLE_SECONDS = 120;

/** Intervalos de epinefrina oferecidos pelo ANY; 4 min é o sugerido. */
export const EPINEPHRINE_INTERVALS_SECONDS = [180, 240, 300] as const;
export type EpinephrineIntervalSeconds = (typeof EPINEPHRINE_INTERVALS_SECONDS)[number];
export const DEFAULT_EPINEPHRINE_INTERVAL_SECONDS: EpinephrineIntervalSeconds = 240;

/** Meta de fração de compressão torácica (FCT): acima de 80%. */
export const COMPRESSION_FRACTION_TARGET_PERCENT = 80;

/**
 * Metrônomo do ANY (`MetronomeContext`): 110 compressões/min, tique de 880 Hz;
 * com via aérea avançada, um bipe duplo de ventilação a cada 6 s. O alerta de
 * fim de ciclo são dois bipes graves de 600 Hz.
 */
export const ACLS_METRONOME = {
  compressionsPerMinute: 110,
  ventilationIntervalSeconds: 6,
  click: { frequencyHz: 880, durationSeconds: 0.08, gain: 0.5, wave: 'sine' },
  ventilation: {
    frequenciesHz: [1200, 1500],
    toneSeconds: 0.15,
    gapSeconds: 0.18,
    gain: 0.6,
    wave: 'sine',
  },
  alert: {
    frequencyHz: 600,
    beeps: 2,
    toneSeconds: 0.15,
    gapSeconds: 0.2,
    gain: 0.5,
    wave: 'square',
  },
} as const;

/** ETCO2 opcional na checagem de ritmo. O ANY não tinha faixa; esta é só contra erro de digitação. */
export const ETCO2_RANGE: NumericRange = { min: 0, max: 100, unit: 'mmHg' };

export const ACLS_RHYTHMS = ['shockable', 'nonshockable'] as const;
export type AclsRhythm = (typeof ACLS_RHYTHMS)[number];

export const RHYTHM_CONTENT: Record<
  AclsRhythm,
  { label: string; detail: string; initialEvent: string; checkEvent: string }
> = {
  shockable: {
    label: 'Chocável',
    detail: 'FV / TV sem pulso',
    initialEvent: 'FV/TV sem pulso',
    checkEvent: 'Ritmo chocável',
  },
  nonshockable: {
    label: 'Não chocável',
    detail: 'AESP / Assistolia',
    initialEvent: 'AESP/Assistolia',
    checkEvent: 'Ritmo não chocável',
  },
};

export const ACLS_MEDICATION_GROUPS = [
  { id: 'vasopressor', label: 'Vasopressor' },
  { id: 'antiarritmicos', label: 'Antiarrítmicos' },
  { id: 'eletrolitos', label: 'Eletrólitos e outros' },
] as const;
export type AclsMedicationGroupId = (typeof ACLS_MEDICATION_GROUPS)[number]['id'];

export const ACLS_MEDICATION_IDS = [
  'epinefrina',
  'amiodarona-300',
  'amiodarona-150',
  'lidocaina',
  'sulfato-magnesio',
  'gluconato-calcio',
  'bicarbonato',
] as const;
export type AclsMedicationId = (typeof ACLS_MEDICATION_IDS)[number];

export interface AclsMedication {
  id: AclsMedicationId;
  /** Nome e dose, como vai para a linha do tempo e o relatório. */
  name: string;
  /** Quando usar, embaixo do nome. */
  hint: string;
  group: AclsMedicationGroupId;
}

/** As 7 medicações do ANY, na mesma ordem e com o mesmo texto. */
export const ACLS_MEDICATIONS: readonly AclsMedication[] = [
  {
    id: 'epinefrina',
    name: 'Epinefrina 1 mg IV/IO',
    hint: 'A cada 3-5 min',
    group: 'vasopressor',
  },
  {
    id: 'amiodarona-300',
    name: 'Amiodarona 300 mg IV',
    hint: '1ª dose (após 3º choque)',
    group: 'antiarritmicos',
  },
  { id: 'amiodarona-150', name: 'Amiodarona 150 mg IV', hint: '2ª dose', group: 'antiarritmicos' },
  {
    id: 'lidocaina',
    name: 'Lidocaína 100 mg IV',
    hint: 'Alternativa: 1-1,5 mg/kg',
    group: 'antiarritmicos',
  },
  {
    id: 'sulfato-magnesio',
    name: 'Sulfato de magnésio 2 g IV',
    hint: 'Torsades de Pointes',
    group: 'eletrolitos',
  },
  {
    id: 'gluconato-calcio',
    name: 'Gluconato de cálcio 3 g IV',
    hint: 'Hipercalemia / bloq. cálcio',
    group: 'eletrolitos',
  },
  {
    id: 'bicarbonato',
    name: 'Bicarbonato de sódio 1 mEq/kg IV',
    hint: 'Acidose / hipercalemia',
    group: 'eletrolitos',
  },
];

const MEDICATION_BY_ID = new Map(ACLS_MEDICATIONS.map((medication) => [medication.id, medication]));

export function aclsMedication(id: AclsMedicationId): AclsMedication {
  const medication = MEDICATION_BY_ID.get(id);
  if (!medication) throw new Error(`Medicação de ACLS desconhecida: ${id}`);
  return medication;
}

/**
 * Card "Agora" do ANY (`getGuide`). A amiodarona aparece pelo número de
 * choques registrados, com os mesmos limiares do ANY (ver a revisão clínica:
 * o ANY já sugere a 1ª dose depois do 2º choque, com o texto "após 3º
 * choque").
 */
export const AMIODARONE_GUIDE_THRESHOLDS = {
  /** `shockCount >= 2 && !amio300Given` no ANY. */
  firstDoseFromShock: 2,
  /** `shockCount >= 4 && amio300Given && !amio150Given` no ANY. */
  secondDoseFromShock: 4,
} as const;

export const GUIDE_TEXT = {
  cpr: 'RCP de alta qualidade',
  cprPrepareShock: 'RCP de alta qualidade + preparar choque',
  amiodarone300: 'Considere amiodarona 300 mg IV',
  amiodarone300Detail: 'Após 3º choque sem sucesso',
  amiodarone150: 'Considere amiodarona 150 mg IV',
  amiodarone150Detail: 'Dose adicional',
  /** "Mantenha epinefrina a cada N min" no ANY. */
  epinephrineEvery: (minutes: number) => `Epinefrina a cada ${minutes} min`,
} as const;

/** Lembretes do ANY (`getNudges`), na ordem de prioridade; no máximo 2 na tela. */
export const MAX_VISIBLE_NUDGES = 2;

export const NUDGE_TEXT = {
  epinephrine: 'Considere epinefrina 1 mg IV/IO',
  ivAccess: 'Considere priorizar acesso IV; IO se IV não viável.',
  advancedAirway: 'Considere via aérea avançada',
  reversibleCauses: "Revisou causas reversíveis? (H's e T's)",
} as const;

/** Limiares dos lembretes, como no ANY. */
export const NUDGE_THRESHOLDS = {
  /** Lembrete de acesso só no 1º ciclo e nos primeiros 3 min. */
  ivAccessUntilSeconds: 180,
  /** Via aérea avançada a partir do 2º ciclo completo. */
  advancedAirwayFromCycle: 2,
  /** H's e T's a partir do 4º ciclo completo. */
  reversibleCausesFromCycle: 4,
  /** Chocável: 1ª epinefrina sugerida depois do 1º ciclo completo. */
  shockableFirstEpinephrineFromCycle: 1,
} as const;

/** Textos que vão para a linha do tempo (iguais aos do ANY, para o relatório bater). */
export const EVENT_TEXT = {
  started: 'Código iniciado',
  cycleCompleted: (cycle: number) => `Ciclo ${cycle} completo`,
  shock: (shock: number) => `Choque ${shock}`,
  advancedAirway: 'Via aérea avançada confirmada',
  compressionsPaused: 'Pausa nas compressões',
  compressionsResumed: (pauseSeconds: number) => `Compressões retomadas (pausa: ${pauseSeconds}s)`,
  etco2: (formatted: string) => `ETCO2: ${formatted} mmHg`,
  rosc: 'RCE obtido',
  death: 'Óbito declarado',
} as const;

export const RHYTHM_CHECK_TEXT = {
  title: 'Checar ritmo',
  hint: 'Pausa menor que 10 segundos. Considere trocar compressor.',
} as const;
