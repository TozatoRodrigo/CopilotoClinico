'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  describeRange,
  validateNumber,
  type NumericFieldError,
  type NumericRange,
} from '@clinical-tools/ranges';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const UNBOUNDED = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };

/**
 * Quando mostrar o erro enquanto o médico digita. Acima do máximo, texto
 * inválido e milhar ambíguo aparecem na hora: mais dígitos não consertam.
 * Abaixo do mínimo espera sair do campo, porque "4" ainda pode virar "40".
 */
function visibleError(
  error: NumericFieldError | null,
  raw: string,
  left: boolean,
): NumericFieldError | null {
  if (!error || error.kind === 'empty') return null;
  if (left) return error;
  if (error.kind !== 'out-of-range') return error;
  const typed = Number(raw.trim().replace(',', '.'));
  return typed > error.range.max ? error : null;
}

export interface NumericFieldProps {
  label: string;
  /** Unidade sempre visível dentro do campo ("kg", "bpm"); vazia em contagem e data. */
  unit: string;
  /** Faixa aceita. Fora dela o campo mostra erro e a conta não roda. */
  range?: Omit<NumericRange, 'unit'>;
  value: string;
  onValueChange: (raw: string) => void;
  /** Texto de apoio abaixo do campo; sem ele, mostra a faixa aceita. */
  hint?: ReactNode;
  /**
   * Problema que o campo sozinho não vê: a combinação com os outros campos
   * não fecha (31/02, DUM no futuro). Aparece como erro, sem esperar sair do campo.
   */
  issue?: string;
  placeholder?: string;
  id?: string;
  className?: string;
}

/**
 * Campo numérico das Ferramentas (CC-305): aceita vírgula ou ponto, mostra a
 * unidade sempre e valida a faixa. É `type="text"` com teclado decimal porque
 * o `type="number"` recusa a vírgula em vários navegadores.
 */
export function NumericField({
  label,
  unit,
  range,
  value,
  onValueChange,
  hint,
  issue,
  placeholder,
  id,
  className,
}: NumericFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `numeric-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [left, setLeft] = useState(false);

  const fullRange: NumericRange = { ...(range ?? UNBOUNDED), unit };
  const checked = validateNumber(value, fullRange);
  const error = visibleError(checked.ok ? null : checked.error, value, left)?.message ?? issue;
  const hintText = hint ?? (range ? `Faixa aceita: ${describeRange(fullRange)}.` : null);
  // O erro substitui a dica: as mensagens de faixa já repetem a faixa.
  const showHint = Boolean(hintText) && !error;
  const describedBy = [showHint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div data-slot="numeric-field" className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-[0.8125rem] font-medium text-muted-foreground">
        {label}
        {/* A unidade visível fica dentro do campo; aqui ela entra no nome acessível. */}
        {unit ? (
          <>
            {' '}
            <span className="sr-only">({unit})</span>
          </>
        ) : null}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          onBlur={() => setLeft(true)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'h-11 pl-3 text-base font-medium tabular-nums placeholder:font-normal max-sm:h-11 md:text-base',
            unit ? 'pr-16' : 'pr-3',
          )}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
          >
            {unit}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        {showHint ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hintText}
          </p>
        ) : null}
        {/* Sempre na árvore: região live que aparece só na hora do erro não é anunciada. */}
        <p id={errorId} aria-live="polite" className="text-xs font-medium text-destructive">
          {error ?? ''}
        </p>
      </div>
    </div>
  );
}
