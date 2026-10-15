'use client';

import { useId } from 'react';
import { formatCompact } from '@clinical-tools/numbers';
import type { ScoreItem } from '@clinical-tools/calculator';
import { cn } from '@/lib/utils';

/** Opções curtas (Não/Sim, faixas de idade) ficam lado a lado no celular. */
function isCompact(item: ScoreItem): boolean {
  return item.options.length <= 3 && item.options.every(({ label }) => label.length <= 14);
}

/** Padrão: mostra o ponto, menos quando a opção é parâmetro de fórmula (fator, potência). */
function defaultShowsPoints(item: ScoreItem): boolean {
  return item.role !== 'parameter';
}

export interface ScoreItemListProps {
  items: readonly ScoreItem[];
  /** id do item → id da opção escolhida. */
  answers: Readonly<Record<string, string | undefined>>;
  onAnswer: (itemId: string, optionId: string) => void;
  /**
   * Se o item mostra "+N" ao lado das opções. A calculadora decide
   * (`itemShowsPoints`): classificação e parâmetro de fórmula não mostram.
   */
  showsPoints?: (item: ScoreItem) => boolean;
  className?: string;
}

/**
 * Itens de escore (CC-305): cada item é um grupo de rádio nativo (setas do
 * teclado funcionam, leitor de tela anuncia "1 de 2"), com os pontos da
 * opção à direita. O resultado é ao vivo: quem decide quando calcular é a
 * caixa de resultado, não um botão.
 */
export function ScoreItemList({
  items,
  answers,
  onAnswer,
  showsPoints = defaultShowsPoints,
  className,
}: ScoreItemListProps) {
  const groupId = useId();
  return (
    <div data-slot="score-item-list" className={cn('flex flex-col gap-4', className)}>
      {items.map((item) => {
        const compact = isCompact(item);
        const points = showsPoints(item);
        return (
          <fieldset key={item.id} className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-foreground">{item.label}</legend>
            <div
              className={cn(
                compact
                  ? cn('grid gap-1.5', item.options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')
                  : 'flex flex-col gap-1.5',
              )}
            >
              {item.options.map((option) => {
                const checked = answers[item.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                      checked
                        ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                        : 'border-border bg-background text-foreground hover:bg-hover',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-${item.id}`}
                      value={option.id}
                      checked={checked}
                      onChange={() => onAnswer(item.id, option.id)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {points && option.points !== 0 ? (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {option.points > 0 ? '+' : ''}
                        {formatCompact(option.points)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
