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
  const errors = Object.values(evaluation.errors);
  // Combinação incoerente (31/02, DUM no futuro): a mensagem diz o que conferir.
  const inconsistent = errors.find((error) => error.kind === 'inconsistent');
  if (inconsistent) return inconsistent.message;
  const invalid = errors.length;
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
 * Caixa de resultado (CC-305): valor, faixa no tom do design system, os
 * resultados secundários da mesma conta e a ação sugerida. Atualiza ao vivo e
 * é anunciada pelo leitor de tela (`status`). Enquanto falta resposta ou há
 * campo inválido, não mostra número nenhum. Quando a faixa é o resultado
 * (CAM-ICU, Forrest), o nome da faixa ocupa o lugar do número.
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
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];
  const value = formatResultValue(definition, evaluation.value);
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
        {value === null ? (
          <span className={cn('text-xl font-semibold text-balance', ink)}>
            {evaluation.band.label}
          </span>
        ) : (
          <>
            <span className={cn('text-3xl font-semibold tabular-nums', ink)}>{value}</span>
            <span className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}>
              {evaluation.band.label}
            </span>
          </>
        )}
      </div>
      {evaluation.details.length > 0 ? (
        <dl className={cn('flex flex-col gap-0.5 text-[0.9375rem]', ink)}>
          {evaluation.details.map((detail) => (
            <div key={detail.label} className="flex flex-wrap gap-x-1.5">
              <dt>{detail.label}:</dt>
              <dd className="font-medium tabular-nums">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className={cn('text-[0.9375rem] text-pretty', ink)}>{evaluation.band.action}</p>
    </div>
  );
}
