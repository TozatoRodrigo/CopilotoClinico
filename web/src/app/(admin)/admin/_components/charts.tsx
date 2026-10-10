'use client';

/**
 * Gráficos do console no estilo do Notion: série única em `bg-chart-1`,
 * barras finas (≤ 24px) com ponta arredondada de 4px e base reta, grade em
 * linha de 1px cinza, rótulos em `text-xs text-muted-foreground` com
 * algarismos tabulares. Texto nunca usa a cor da série.
 *
 * Feitos com divs (sem lib de gráfico): o volume de dados do console é
 * pequeno (≤ 90 pontos) e assim herdam tokens de tema claro/escuro de graça.
 * Larguras/alturas vêm dos dados via `style` — único uso de inline style.
 */
import { cn } from '@/lib/utils';

export interface ChartDatum {
  key: string;
  /** Rótulo curto do eixo X (ex.: "09/10"). */
  label: string;
  value: number;
}

/** Topo "redondo" do eixo Y e passo das linhas de grade (1, 2, 2,5, 5 × 10ⁿ). */
export function niceScale(max: number, tickCount = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { top: Math.ceil(max / step) * step, step };
}

/**
 * Colunas verticais com eixo Y, grade e tooltip por coluna no hover. A área
 * de hover é a coluna inteira (maior que a barra). Para leitura exata e
 * leitores de tela, acompanhe sempre de uma tabela (ver `figureLabel`).
 */
export function ColumnChart({
  data,
  formatValue,
  formatTick = formatValue,
  figureLabel,
  height = 168,
  compact = false,
  className,
}: {
  data: ChartDatum[];
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Resumo textual do gráfico (aria-label da figura). */
  figureLabel: string;
  height?: number;
  /** Sem eixos nem rótulos (sparkline de cartão). */
  compact?: boolean;
  className?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const { top, step } = niceScale(max);
  const ticks = compact ? [] : Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Rótulos do eixo X: primeiro, meio e último — nunca um por coluna.
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <figure role="img" aria-label={figureLabel} className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex gap-2">
        {!compact && (
          <div className="relative w-12 shrink-0 text-right" style={{ height }} aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 translate-y-1/2 text-xs leading-none text-muted-foreground tabular-nums"
                style={{ bottom: `${(tick / top) * 100}%` }}
              >
                {formatTick(tick)}
              </span>
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1" style={{ height }} aria-hidden="true">
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}
          {compact && <div className="absolute inset-x-0 bottom-0 border-t border-border" />}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {data.map((d) => {
              const pct = top > 0 ? (d.value / top) * 100 : 0;
              return (
                <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                  <div
                    className={cn(
                      'w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity duration-100 group-hover:opacity-80',
                      d.value > 0 && 'min-h-0.5',
                    )}
                    style={{ height: `${pct}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100"
                    style={{ bottom: `${pct}%` }}
                  >
                    <span className="text-muted-foreground">{d.label}</span>{' '}
                    <span className="font-medium tabular-nums">{formatValue(d.value)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!compact && data.length > 0 && (
        // Rótulos do eixo X: primeiro, meio e último, posicionados pelo
        // centro da coluna (as pontas ancoradas nas bordas para não vazar).
        <div className="flex gap-2" aria-hidden="true">
          {/* Mesmo recuo da coluna do eixo Y. */}
          <div className="w-12 shrink-0" />
          <div className="relative h-4 min-w-0 flex-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {[...labelIdx].map((i) => {
              const d = data[i]!;
              const isFirst = i === 0;
              const isLast = i === data.length - 1;
              return (
                <span
                  key={d.key}
                  className={cn('absolute top-0', isFirst ? 'left-0' : isLast ? 'right-0' : '-translate-x-1/2')}
                  style={isFirst || isLast ? undefined : { left: `${((i + 0.5) / data.length) * 100}%` }}
                >
                  {d.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}

/**
 * Funil horizontal: cada etapa é uma barra a partir da mesma base, com o
 * valor na ponta e a conversão em relação à etapa anterior.
 */
export function FunnelBars({
  steps,
  className,
}: {
  steps: { label: string; value: number }[];
  className?: string;
}) {
  const max = Math.max(0, ...steps.map((s) => s.value));
  return (
    <ol className={cn('flex flex-col gap-2.5', className)}>
      {steps.map((step, i) => {
        const pct = max > 0 ? (step.value / max) * 100 : 0;
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const conversion = prev ? Math.round((step.value / prev) * 100) : null;
        return (
          <li
            key={step.label}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_10.5rem]"
          >
            <span className="truncate text-sm text-foreground">{step.label}</span>
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-5 min-w-0 flex-1">
                <div
                  className={cn('h-full rounded-r-[4px] bg-chart-1', step.value > 0 && 'min-w-0.5')}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-medium text-foreground tabular-nums">
                {step.value}
              </span>
            </div>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums max-sm:col-start-2">
              {conversion === null ? 'base do funil' : `${conversion}% da etapa anterior`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Medidor fino de participação (ex.: % do custo total) para células de tabela. */
export function ShareMeter({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-tone-blue-bg" aria-hidden="true">
        <span className="block h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
    </span>
  );
}

/** Medidor de taxa (0–1) em linha, com rótulo — ex.: % de perguntas respondidas. */
export function RateMeter({
  rate,
  tone = 'blue',
  className,
}: {
  rate: number;
  tone?: 'blue' | 'orange';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, rate)) * 100;
  return (
    <div
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full',
        tone === 'orange' ? 'bg-tone-orange-tag' : 'bg-tone-blue-tag',
        className,
      )}
      aria-hidden="true"
    >
      <div
        className={cn('h-full rounded-full', tone === 'orange' ? 'bg-tone-orange' : 'bg-chart-1')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
