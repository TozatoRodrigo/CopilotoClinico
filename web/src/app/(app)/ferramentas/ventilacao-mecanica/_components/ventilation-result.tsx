'use client';

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import { TOOLS } from '@clinical-tools/catalog';
import { toolHref } from '@clinical-tools/links';
import type { VentilationEvaluation } from '@clinical-tools/ventilation/evaluate';
import type { VentilationCalculation } from '@clinical-tools/ventilation/types';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { toneBg, toneInk, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';

type Pending = Extract<VentilationEvaluation, { status: 'pending' }>;

function pendingMessage(evaluation: Pending): string {
  const invalid = Object.keys(evaluation.errors).length;
  if (invalid > 0) {
    return invalid === 1
      ? 'Corrija o campo destacado para ver o resultado.'
      : `Corrija os ${invalid} campos destacados para ver o resultado.`;
  }
  if (evaluation.failedChecks.length > 0) {
    return evaluation.failedChecks.map(({ message }) => message).join(' ');
  }
  const missing = evaluation.missing.length;
  return missing === 1
    ? `Falta 1 resposta: ${evaluation.missing[0]}.`
    : `Faltam ${missing} respostas para ver o resultado.`;
}

/** Atalho só para ferramenta que já abre no Copiloto (a via aérea pode estar "em breve"). */
function relatedHref(calculation: VentilationCalculation, bandId: string | undefined) {
  const related = calculation.related;
  if (!related || !bandId || !related.bandIds.includes(bandId)) return null;
  const tool = TOOLS.find(({ id }) => id === related.toolId);
  if (tool?.status !== 'disponivel') return null;
  return {
    href: toolHref(tool.id, { from: { tool: 'ventilacao-mecanica' } }),
    label: related.label,
  };
}

/**
 * Caixa de resultado de uma conta de ventilação: valor com unidade, faixa no
 * tom do design system, sugestão e as linhas do ANY (volumes por mL/kg, VC
 * calculado, 4 e 5 tau). Ao vivo e anunciada pelo leitor de tela. Resultado
 * só informativo (sem faixa no ANY) fica cinza.
 */
export function VentilationResult({
  calculation,
  evaluation,
}: {
  calculation: VentilationCalculation;
  evaluation: VentilationEvaluation;
}) {
  if (evaluation.status === 'pending') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-state="pending"
        className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
      >
        {pendingMessage(evaluation)}
      </div>
    );
  }

  const { outcome } = evaluation;
  const tone = outcome.band ? RESULT_TONE[outcome.band.tone] : 'gray';
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];
  const related = relatedHref(calculation, outcome.band?.id);
  const { reading } = outcome;

  return (
    <div
      role="status"
      aria-live="polite"
      data-state="complete"
      data-tone={tone}
      className={cn('flex flex-col gap-2 rounded-lg px-4 py-3', toneBg[tone])}
    >
      <div className="flex flex-col gap-0.5">
        {reading.label ? (
          <span className={cn('text-sm font-medium', ink)}>{reading.label}</span>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <span className={cn('text-3xl font-semibold tabular-nums', ink)}>
            {reading.text}
            {reading.unit ? (
              <span className="ml-1.5 text-base font-medium">{reading.unit}</span>
            ) : null}
          </span>
          {outcome.band ? (
            <span className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}>
              {outcome.band.label}
            </span>
          ) : null}
        </div>
      </div>
      {outcome.band?.action ? (
        <p className={cn('text-[0.9375rem] text-pretty', ink)}>{outcome.band.action}</p>
      ) : null}
      {outcome.details.length > 0 ? (
        <ul className={cn('flex flex-col gap-0.5 text-sm tabular-nums', ink)}>
          {outcome.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {related ? (
        <Link
          href={related.href}
          className={cn(
            'inline-flex min-h-10 w-fit items-center gap-1.5 rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            ink,
          )}
        >
          {related.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
