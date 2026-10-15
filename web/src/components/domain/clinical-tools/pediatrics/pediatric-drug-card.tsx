'use client';

import { useId } from 'react';
import { Warning } from '@phosphor-icons/react';
import {
  computeBolus,
  describeCap,
  describeFloor,
  type BolusDrug,
  type BolusResult,
} from '@clinical-tools/pediatrics/bolus';
import { PREPARATIONS } from '@clinical-tools/pediatrics/bolus-drugs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ToolCollapsible } from './tool-collapsible';

export interface PediatricDrugCardProps {
  drug: BolusDrug;
  /** Peso em uso; `null` sem peso válido. */
  kg: number | null;
  /** Idade em anos; `null` sem idade. */
  ageYears: number | null;
  /** A idade digitada está fora da faixa: a droga que depende de idade pede correção. */
  ageInvalid?: boolean;
  /** Droga em destaque (a do cenário aberto, ou o destaque fixo do ANY). */
  emphasized?: boolean;
  className?: string;
}

function Amount({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-1 text-xl font-semibold text-foreground tabular-nums">
        <span>{value}</span>
        <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}

function pendingMessage(
  kg: number | null,
  result: BolusResult | null,
  ageInvalid: boolean,
): string {
  if (kg === null) return 'Informe o peso ou a cor de Broselow para calcular.';
  if (result?.status === 'falta-idade') {
    return ageInvalid
      ? 'Corrija a idade (0 a 18 anos) para calcular.'
      : 'Informe a idade para calcular.';
  }
  return '';
}

/**
 * Cartão de uma droga em bolus (CC-319): dose, volume e teto pelo peso, com o
 * selo e o aviso de "não rotineiro" e o preparo quando o ANY tem. A conta é
 * do motor (`computeBolus`); o cartão só desenha.
 */
export function PediatricDrugCard({
  drug,
  kg,
  ageYears,
  ageInvalid = false,
  emphasized = false,
  className,
}: PediatricDrugCardProps) {
  const titleId = useId();
  const result = kg === null ? null : computeBolus(drug, { kg, ageYears });
  const cap = describeCap(drug);
  const floor = describeFloor(drug);
  const preparation = drug.preparation ? PREPARATIONS[drug.preparation] : null;
  const emphasis = emphasized || drug.highlight;

  return (
    <article
      aria-labelledby={titleId}
      data-slot="pediatric-drug-card"
      data-drug={drug.id}
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border px-3 py-3',
        emphasis ? 'border-foreground/40' : 'border-border',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4
            id={titleId}
            className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            {drug.name}
            {drug.notRoutine ? <Badge variant="warning">Não rotineiro</Badge> : null}
          </h4>
          <p className="text-xs text-muted-foreground">{drug.presentation}</p>
        </div>
        <span className="shrink-0 rounded-[3px] bg-surface-subtle px-1.5 py-0.5 text-xs text-foreground tabular-nums">
          {drug.doseLabel}
        </span>
      </header>

      {drug.notRoutine ? (
        <p className="flex items-start gap-1.5 rounded-md bg-tone-orange-bg px-2.5 py-1.5 text-xs text-tone-orange-ink">
          <Warning className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Sem indicação de rotina: considere só na indicação específica descrita abaixo.
          </span>
        </p>
      ) : null}

      {result?.status === 'pronto' ? (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <Amount label="Dose" value={result.dose} unit={result.unit} />
            {result.volumeKind === 'infusao' ? (
              <Amount label="Infusão" value={result.volume ?? '—'} unit="mL/h" />
            ) : (
              <Amount
                label="Volume"
                value={result.volume ?? '—'}
                unit={result.volume ? 'mL' : ''}
              />
            )}
          </dl>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {result.note ? <li>{result.note}</li> : null}
            {drug.calculatedAt ? <li>Calculado a {drug.calculatedAt}</li> : null}
            {cap ? (
              <li className="flex flex-wrap items-center gap-1.5">
                <span>Teto: {cap}</span>
                {result.capped ? <Badge variant="warning">teto atingido</Badge> : null}
              </li>
            ) : null}
            {floor ? (
              <li className="flex flex-wrap items-center gap-1.5">
                <span>Mínimo: {floor}</span>
                {result.floored ? <Badge variant="warning">mínimo aplicado</Badge> : null}
              </li>
            ) : null}
          </ul>
        </>
      ) : result?.status === 'nao-recomendado' ? (
        <p className="rounded-md bg-tone-orange-bg px-2.5 py-1.5 text-sm text-tone-orange-ink">
          {result.message}
        </p>
      ) : (
        <p className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
          {pendingMessage(kg, result, ageInvalid)}
        </p>
      )}

      <p className="text-[0.8125rem] text-pretty text-foreground/90">{drug.instruction}</p>

      {preparation ? (
        <ToolCollapsible headingLevel="none" title={`Como preparar: ${preparation.title}`}>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground">
            {preparation.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </ToolCollapsible>
      ) : null}
    </article>
  );
}
