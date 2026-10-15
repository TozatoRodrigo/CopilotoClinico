import type { IntakeAnswerValue, VitalsAnswer } from '../../../shared/contracts/clinical';
import type { IntakeQuestionRecord } from './intake-gate';

/**
 * ADR-014 — a resposta do médico como entra no caso ("P: … R: …"). Sinais
 * vitais saem na notação do plantão: "PA 150×90 mmHg · FC 96 bpm".
 */

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const VITAL_PARTS: Array<{
  read: (vitals: VitalsAnswer) => number | null;
  label: string;
  unit: string;
}> = [
  { read: (vitals) => vitals.heartRate, label: 'FC', unit: 'bpm' },
  { read: (vitals) => vitals.respiratoryRate, label: 'FR', unit: 'irpm' },
  { read: (vitals) => vitals.spo2, label: 'SpO₂', unit: '%' },
  { read: (vitals) => vitals.temperature, label: 'Tax', unit: '°C' },
  { read: (vitals) => vitals.glucose, label: 'Glicemia capilar', unit: 'mg/dL' },
];

function bloodPressureText({ systolicBp, diastolicBp }: VitalsAnswer): string | null {
  if (systolicBp !== null && diastolicBp !== null) {
    return `PA ${NUMBER_FORMAT.format(systolicBp)}×${NUMBER_FORMAT.format(diastolicBp)} mmHg`;
  }
  if (systolicBp !== null) return `PAS ${NUMBER_FORMAT.format(systolicBp)} mmHg`;
  if (diastolicBp !== null) return `PAD ${NUMBER_FORMAT.format(diastolicBp)} mmHg`;
  return null;
}

export function vitalsText(vitals: VitalsAnswer): string {
  const parts = VITAL_PARTS.flatMap(({ read, label, unit }) => {
    const value = read(vitals);
    if (value === null) return [];
    const separator = unit === '%' ? '' : ' ';
    return [`${label} ${NUMBER_FORMAT.format(value)}${separator}${unit}`];
  });
  const bloodPressure = bloodPressureText(vitals);
  return [...(bloodPressure ? [bloodPressure] : []), ...parts].join(' · ');
}

export function intakeAnswerText(
  question: IntakeQuestionRecord | undefined,
  value: IntakeAnswerValue,
): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    const unit = question?.unit ? ` ${question.unit}` : '';
    return `${NUMBER_FORMAT.format(value)}${unit}`;
  }
  return vitalsText(value);
}
