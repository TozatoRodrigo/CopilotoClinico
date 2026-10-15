'use client';

import { caseWeightText, sameAsCase } from '@clinical-tools/case-prefill';
import { describeRange, WEIGHT_RANGES, type WeightPopulation } from '@clinical-tools/ranges';
import { useCaseLink } from './case-link';
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

/**
 * Campo de peso com a faixa da população (CC-305). Fora da faixa: erro, sem
 * conta. Aberto pelo plano com o peso do caso, mostra "vindo do caso" até o
 * médico trocar o valor (CC-332).
 */
export function WeightField({
  population,
  value,
  onValueChange,
  label = 'Peso',
  id,
  className,
}: WeightFieldProps) {
  const range = WEIGHT_RANGES[population];
  const link = useCaseLink();
  const fromCase = link ? sameAsCase(value, caseWeightText(link.facts, population)) : false;
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
      fromCase={fromCase}
    />
  );
}
