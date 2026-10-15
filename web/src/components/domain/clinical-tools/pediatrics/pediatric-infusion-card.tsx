'use client';

import { useState } from 'react';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import {
  dilutionFor,
  doseDecimals,
  doseRange,
  evaluateInfusionDose,
  evaluateInfusionRate,
  formatConcentration,
  formatRate,
  RATE_RANGE,
  WEIGHT_BAND_LABEL,
  weightBand,
  type PediatricInfusion,
} from '@clinical-tools/pediatrics/infusions';
import { Badge } from '@/components/ui/badge';
import { NumericField } from '../numeric-field';
import { ToolCollapsible } from './tool-collapsible';

export interface PediatricInfusionCardProps {
  infusion: PediatricInfusion;
  /** Peso em uso; `null` sem peso válido. */
  kg: number | null;
  /** Aberta ao entrar (infusão do cenário). */
  defaultOpen?: boolean;
}

function rangeText(infusion: PediatricInfusion): string {
  return `${formatCompact(infusion.range.min)}–${formatCompact(infusion.range.max)} ${infusion.unit}`;
}

/**
 * Infusão contínua pediátrica (CC-319): preparo da faixa de peso, dose → mL/h
 * ao vivo e a conta inversa para a bomba que já está correndo. Dose fora da
 * faixa da droga é erro e não vira vazão (ADR-017); no ANY só aparecia um
 * aviso "fora do range" e a conta seguia.
 */
export function PediatricInfusionCard({
  infusion,
  kg,
  defaultOpen = false,
}: PediatricInfusionCardProps) {
  const [doseText, setDoseText] = useState(() =>
    formatDecimal(infusion.defaultDose, doseDecimals(infusion)),
  );
  const [rateText, setRateText] = useState('');

  const dose = kg === null ? null : evaluateInfusionDose(infusion, kg, doseText);
  const reverse = kg === null ? null : evaluateInfusionRate(infusion, kg, rateText);
  const dilution = kg === null ? null : dilutionFor(infusion, kg);

  return (
    <ToolCollapsible
      headingLevel="h4"
      defaultOpen={defaultOpen}
      title={infusion.name}
      meta={rangeText(infusion)}
      className="rounded-lg border border-border px-1"
    >
      {kg === null || dilution === null ? (
        <p className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground">
          Informe o peso ou a cor de Broselow para ver o preparo e calcular a vazão.
        </p>
      ) : (
        <>
          <section
            aria-label={`Preparo de ${infusion.name}`}
            className="flex flex-col gap-1 rounded-md bg-surface-subtle px-3 py-2 text-[0.8125rem] text-foreground"
          >
            <p className="text-xs text-muted-foreground">
              Preparo para {WEIGHT_BAND_LABEL[weightBand(kg)]}
            </p>
            <p>
              Ampola {infusion.presentation}: {formatCompact(dilution.drugMl)} mL + diluente{' '}
              {formatCompact(dilution.diluentMl)} mL = {formatCompact(dilution.finalVolumeMl)} mL
            </p>
            <p>Concentração: {formatConcentration(dilution.concentration, infusion.unit)}</p>
            {infusion.warning ? (
              <p>
                <Badge variant="warning">{infusion.warning}</Badge>
              </p>
            ) : null}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <NumericField
                label="Dose"
                unit={infusion.unit}
                range={doseRange(infusion)}
                value={doseText}
                onValueChange={setDoseText}
              />
              <p
                role="status"
                aria-live="polite"
                className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-foreground"
              >
                {dose?.status === 'pronto' ? (
                  <>
                    Vazão:{' '}
                    <span className="text-xl font-semibold tabular-nums">
                      {formatRate(dose.rate)}
                    </span>{' '}
                    <span className="text-muted-foreground">mL/h</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Digite a dose dentro de {rangeText(infusion)} para ver a vazão.
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <NumericField
                label="Vazão que já está correndo"
                unit="mL/h"
                range={RATE_RANGE}
                value={rateText}
                onValueChange={setRateText}
                hint="Para saber a dose de uma bomba já ligada."
              />
              {reverse?.status === 'pronto' ? (
                <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-foreground">
                  Dose:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatDecimal(reverse.dose, doseDecimals(infusion))}
                  </span>{' '}
                  <span className="text-muted-foreground">{infusion.unit}</span>
                  {reverse.outsideRange ? (
                    <span className="mt-1 block text-tone-orange-ink">
                      Fora da faixa usual ({rangeText(infusion)}): considere rever a vazão.
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </ToolCollapsible>
  );
}
