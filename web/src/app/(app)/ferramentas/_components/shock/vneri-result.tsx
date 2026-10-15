'use client';

import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import {
  vneriBarPosition,
  vneriBarSegments,
  VNERI_ZONES,
  type VneriEvaluation,
} from '@clinical-tools/shock/vneri';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { toneBg, toneInk, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ToneTag } from './tone-result';

/** Cortes da barra (2,6, 6,7 e 10,8), tirados das zonas do motor. */
const CUTS = VNERI_ZONES.flatMap((zone) => (zone.upTo ? [zone.upTo.value] : []));

/**
 * Barra de 0 a 15 com as quatro zonas e o marcador no valor, como no ANY.
 * Só reforço visual: o número e o nome da zona estão escritos ao lado.
 */
function VneriBar({ value, inkClass }: { value: number; inkClass: string }) {
  const segments = vneriBarSegments();
  const position = vneriBarPosition(value);
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-1 text-[0.6875rem]', inkClass)}>
      <div className="flex items-end">
        {segments.map(({ zone, width }) => (
          <span
            key={zone.id}
            className="px-0.5 text-center leading-tight"
            style={{ width: `${width}%` }}
          >
            {zone.barLabel}
          </span>
        ))}
      </div>
      <div className="relative h-3">
        <div className="flex h-full overflow-hidden rounded-sm">
          {segments.map(({ zone, width }) => (
            <span
              key={zone.id}
              className={cn('h-full', toneTag[RESULT_TONE[zone.tone]])}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        <span
          className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="relative h-4 tabular-nums">
        {CUTS.map((cut) => (
          <span
            key={cut}
            className="absolute -translate-x-1/2"
            style={{ left: `${vneriBarPosition(cut)}%` }}
          >
            {formatCompact(cut, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

function pendingMessage(evaluation: Extract<VneriEvaluation, { status: 'pending' }>): string {
  return Object.keys(evaluation.errors).length > 0
    ? 'Corrija o campo destacado para calcular o VNERi.'
    : 'Informe PAD, FC e dose de noradrenalina para calcular.';
}

/**
 * VNERi ao vivo (CC-316 e CC-317): número, zona, mortalidade, barra e a
 * conduta sugerida. Enquanto falta campo, nenhum número aparece.
 */
export function VneriResult({
  evaluation,
  className,
}: {
  evaluation: VneriEvaluation;
  className?: string;
}) {
  if (evaluation.status === 'pending') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
      >
        {pendingMessage(evaluation)}
      </div>
    );
  }
  const { value, zone, conduct } = evaluation;
  const tone = RESULT_TONE[zone.tone];
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={tone}
      className={cn('flex flex-col gap-3 rounded-lg px-4 py-3', toneBg[tone], className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className={cn('text-3xl font-semibold tabular-nums', ink)}>
          <span className="sr-only">VNERi </span>
          {formatDecimal(value, 1)}
        </span>
        <ToneTag tone={zone.tone}>{zone.label}</ToneTag>
        <span className={cn('text-sm', ink)}>Mortalidade: {zone.mortality}</span>
      </div>
      <VneriBar value={value} inkClass={ink} />
      <p className={cn('text-[0.9375rem] text-pretty', ink)}>{conduct.text}</p>
    </div>
  );
}
