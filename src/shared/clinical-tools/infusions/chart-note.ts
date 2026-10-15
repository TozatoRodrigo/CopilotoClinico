import { formatCompact } from '../numbers';
import {
  formatConcentration,
  formatDose,
  formatRate,
  type DoseSettings,
  type DoseStatusDetail,
} from './dose';
import type { InfusionDrug } from './drugs';

export interface InfusionNoteInput {
  drug: InfusionDrug;
  settings: DoseSettings;
  dose: number;
  mlh: number;
  detail: DoseStatusDetail;
  /** Só entra na nota quando a droga é por peso. */
  weightKg: number | null;
  /** Preparo por extenso ("16 mg (4 amp…) = 250 mL", "Minha diluição: 5 ampolas…"). */
  dilution: string;
  concentration: number;
  /** "14 mg", quando o modo tem bolus por peso. */
  patientBolus: string | null;
}

/**
 * Texto para o prontuário: dose, velocidade, situação da dose, peso, diluição
 * e faixa. Sem nome de paciente nem horário — o prontuário carimba os dois.
 */
export function buildInfusionNote(input: InfusionNoteInput): string {
  const { drug, settings } = input;
  const lines = [
    `${drug.name}: ${formatDose(input.dose, settings)} ${drug.doseUnit} = ${formatRate(input.mlh)} mL/h — ${input.detail.label}.`,
  ];
  if (drug.usesWeight && input.weightKg !== null) {
    lines.push(`- Peso: ${formatCompact(input.weightKg, 1)} kg`);
  }
  if (settings.mode && (drug.modes?.length ?? 0) > 1) lines.push(`- Modo: ${settings.mode.label}`);
  lines.push(
    `- Diluição: ${input.dilution} (${formatConcentration(input.concentration)} ${drug.concentrationUnit})`,
    `- Faixa terapêutica: ${settings.rangeLabel}`,
  );
  if (input.patientBolus) lines.push(`- Bolus para este peso: ${input.patientBolus}`);
  return lines.join('\n');
}
