'use client';

import { useId } from 'react';
import type { AirwayDrugView } from '@clinical-tools/airway/derive';
import {
  formatDose,
  formatRate,
  INDUCTION_DOSE_REDUCTION,
  type AirwayDrug,
} from '@clinical-tools/airway/drugs';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import { cn } from '@/lib/utils';

function volume(ml: number): string {
  return `${formatDecimal(ml, 1)} mL`;
}

/** "53 a 74 mg (1,1 a 1,5 mL)". */
function reducedText(drug: AirwayDrug, view: AirwayDrugView): string | null {
  if (!view.reduced) return null;
  const { from, to } = view.reduced;
  return `${formatCompact(from.dose, drug.doseDecimals)} a ${formatDose(drug, to.dose)} (${formatDecimal(from.volumeMl, 1)} a ${volume(to.volumeMl)})`;
}

export interface DoseCardProps {
  view: AirwayDrugView;
  onToggle: () => void;
  onRateChange: (rate: number) => void;
}

/**
 * Cartão de uma medicação da intubação (CC-315): seleção, régua de dose por
 * kg, dose total e volume ao vivo e, em instável ou idoso, a faixa com a
 * redução sugerida de 30–50% ao lado da dose cheia (que é a do ANY). Sem peso
 * válido não mostra dose nenhuma.
 */
export function DoseCard({ view, onToggle, onRateChange }: DoseCardProps) {
  const { drug, ratePerKg, selected, dose } = view;
  const rangeId = useId();
  const rate = formatRate(drug, ratePerKg);
  const reduced = reducedText(drug, view);

  return (
    <li
      data-slot="dose-card"
      data-drug={drug.id}
      className={cn(
        'flex flex-col gap-3 rounded-md border px-3 py-3 transition-colors duration-100',
        selected ? 'border-primary bg-tone-blue-bg' : 'border-border bg-background',
      )}
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-[0.9375rem] font-semibold',
              selected ? 'text-tone-blue-ink' : 'text-foreground',
            )}
          >
            {drug.name}
          </span>
          <span
            className={cn(
              'block text-xs',
              selected ? 'text-tone-blue-ink' : 'text-muted-foreground',
            )}
          >
            {drug.presentation}
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <label htmlFor={rangeId} className={cn(selected && 'text-tone-blue-ink')}>
            Dose por kg
          </label>
          <output
            htmlFor={rangeId}
            className={cn(
              'text-sm font-semibold tabular-nums',
              selected ? 'text-tone-blue-ink' : 'text-foreground',
            )}
          >
            {rate}
          </output>
        </div>
        <input
          id={rangeId}
          type="range"
          min={drug.rate.min}
          max={drug.rate.max}
          step={drug.rate.step}
          value={ratePerKg}
          aria-valuetext={rate}
          onChange={(event) => onRateChange(Number(event.target.value))}
          className="h-10 w-full cursor-pointer accent-primary"
        />
        <div
          aria-hidden="true"
          className={cn(
            'flex justify-between text-xs tabular-nums',
            selected ? 'text-tone-blue-ink' : 'text-muted-foreground',
          )}
        >
          <span>{formatRate(drug, drug.rate.min)}</span>
          <span>{formatRate(drug, drug.rate.max)}</span>
        </div>
      </div>

      {dose ? (
        <p
          className={cn(
            'flex flex-wrap items-baseline gap-x-3 tabular-nums',
            selected ? 'text-tone-blue-ink' : 'text-foreground',
          )}
        >
          <span className="text-xl font-semibold">{formatDose(drug, dose.dose)}</span>
          <span className="text-sm">= {volume(dose.volumeMl)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Informe o peso para calcular a dose.</p>
      )}

      {reduced ? (
        <p className="rounded-sm bg-tone-orange-bg px-2 py-1.5 text-sm text-tone-orange-ink">
          {`Com redução de ${INDUCTION_DOSE_REDUCTION.minPercent}–${INDUCTION_DOSE_REDUCTION.maxPercent}%: `}
          <span className="font-semibold tabular-nums">{reduced}</span>
        </p>
      ) : null}

      {selected && drug.alert ? (
        <p className="rounded-sm bg-tone-orange-bg px-2 py-1.5 text-xs text-tone-orange-ink">
          {drug.alert}
        </p>
      ) : null}
    </li>
  );
}
