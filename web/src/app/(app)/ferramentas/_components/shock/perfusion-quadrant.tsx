'use client';

import type { ResultTone } from '@clinical-tools/tone';
import {
  describePerfusionInputs,
  PERFUSION_QUADRANTS,
  type PerfusionEvaluation,
  type PerfusionQuadrantId,
} from '@clinical-tools/shock/perfusion-quadrant';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { toneBg } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ToneResult } from './tone-result';

const TONE_BORDER: Record<ResultTone, string> = {
  neutral: 'border-l-tone-gray',
  attention: 'border-l-tone-orange',
  critical: 'border-l-tone-red',
};

/**
 * Grade 2 × 2 dos quadrantes gap CO2 × SvcO2 (Ltaief et al. 2021), como a do
 * ANY: o quadrante do paciente fica destacado e marcado, os outros apagados.
 */
export function PerfusionQuadrantGrid({
  activeId,
  className,
}: {
  activeId: PerfusionQuadrantId | null;
  className?: string;
}) {
  return (
    <ul aria-label="Quadrantes gap CO2 × SvcO2" className={cn('grid grid-cols-2 gap-2', className)}>
      {PERFUSION_QUADRANTS.map((quadrant) => {
        const active = quadrant.id === activeId;
        return (
          <li
            key={quadrant.id}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-1 rounded-md border border-l-4 border-border p-2.5 text-xs transition-opacity',
              TONE_BORDER[quadrant.tone],
              active && cn(toneBg[RESULT_TONE[quadrant.tone]], 'font-medium'),
              activeId !== null && !active && 'opacity-60',
            )}
          >
            <span className="text-[0.8125rem] font-semibold text-foreground">
              {quadrant.cell.title}
              {active ? <span className="sr-only"> (quadrante atual)</span> : null}
            </span>
            <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
              {quadrant.cell.criteria}
            </span>
            <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
              {quadrant.cell.hint}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Quadrante ao vivo: nome, valores e conduta sugerida; a grade logo abaixo. */
export function PerfusionResult({
  evaluation,
  className,
}: {
  evaluation: PerfusionEvaluation;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {evaluation.status === 'complete' ? (
        <ToneResult tone={evaluation.quadrant.tone} title={evaluation.quadrant.label}>
          <p>{describePerfusionInputs(evaluation.svco2, evaluation.gapCO2)}</p>
          <p className="mt-1">
            <span className="font-semibold">Conduta sugerida: </span>
            {evaluation.quadrant.conduct}
          </p>
        </ToneResult>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
        >
          {Object.keys(evaluation.errors).length > 0
            ? 'Corrija o campo destacado para ver o quadrante.'
            : 'Informe SvcO2 e gap CO2 para ver o quadrante.'}
        </div>
      )}
      <PerfusionQuadrantGrid
        activeId={evaluation.status === 'complete' ? evaluation.quadrant.id : null}
      />
    </div>
  );
}
