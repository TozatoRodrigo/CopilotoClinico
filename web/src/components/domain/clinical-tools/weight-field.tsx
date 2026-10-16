'use client';

import { describeRange, WEIGHT_RANGES, type WeightPopulation } from '@clinical-tools/ranges';
import { NumericField } from './numeric-field';

export interface WeightFieldProps {
  /** Adulto aceita 40–200 kg; pediátrico, 0,5–50 kg (faixas do ANY). */
  population: WeightPopulation;
  value: string;
  onValueChange: (raw: string) => void;
  label?: string;
  id?: string;
  className?: string;
}

/** Campo de peso com a faixa da população (CC-305). Fora da faixa: erro, sem conta. */
export function WeightField({
  population,
  value,
  onValueChange,
  label = 'Peso',
  id,
  className,
}: WeightFieldProps) {
  const range = WEIGHT_RANGES[population];
  return (
    <NumericField
      id={id}
      label={label}
      unit={range.unit}
      range={range}
      value={value}
      onValueChange={onValueChange}
      placeholder={population === 'adulto' ? '70' : '10'}
      hint={`${range.label}: ${describeRange(range)}.`}
      className={className}
    />
  );
}
