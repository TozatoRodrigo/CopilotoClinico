'use client';

import {
  formatResultValue,
  type CalculatorDefinition,
  type CalculatorEvaluation,
} from '@clinical-tools/calculator';
import { toneBg, toneInk, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { RESULT_TONE } from './result-tone';

function pendingMessage(evaluation: Extract<CalculatorEvaluation, { status: 'pending' }>): string {
  const invalid = Object.keys(evaluation.errors).length;
  if (invalid > 0) {
    return invalid === 1
      ? 'Corrija o campo destacado para ver o resultado.'
      : `Corrija os ${invalid} campos destacados para ver o resultado.`;
  }
  const missing = evaluation.missing.length;
  return missing === 1
    ? `Falta 1 resposta: ${evaluation.missing[0]}.`
    : `Faltam ${missing} respostas para ver o resultado.`;
}

export interface CalculatorResultProps {
  definition: CalculatorDefinition;
  evaluation: CalculatorEvaluation;
  className?: string;
}

/**
 * Caixa de resultado (CC-305): valor, faixa no tom do design system e a ação
 * sugerida. Atualiza ao vivo e é anunciada pelo leitor de tela (`status`).
 * Enquanto falta resposta ou há campo inválido, não mostra número nenhum.
 */
export function CalculatorResult({ definition, evaluation, className }: CalculatorResultProps) {
  if (evaluation.status === 'pending') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-slot="calculator-result"
        data-state="pending"
        className={cn(
          'rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
      >
        {pendingMessage(evaluation)}
      </div>
    );
  }

  const tone = RESULT_TONE[evaluation.band.tone];
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="calculator-result"
      data-state="complete"
      data-tone={tone}
      className={cn('flex flex-col gap-2 rounded-lg px-4 py-3', toneBg[tone], className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span
          className={cn(
            'text-3xl font-semibold tabular-nums',
            tone === 'gray' ? 'text-foreground' : toneInk[tone],
          )}
        >
          {formatResultValue(definition, evaluation.value)}
        </span>
        <span className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}>
          {evaluation.band.label}
        </span>
      </div>
      <p
        className={cn(
          'text-[0.9375rem] text-pretty',
          tone === 'gray' ? 'text-foreground' : toneInk[tone],
        )}
      >
        {evaluation.band.action}
      </p>
    </div>
  );
}
