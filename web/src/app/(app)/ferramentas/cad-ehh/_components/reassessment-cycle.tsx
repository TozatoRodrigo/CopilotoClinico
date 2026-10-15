'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowsClockwise, Check } from '@phosphor-icons/react';
import {
  AFTER_250,
  BHB_UNAVAILABLE_NOTE,
  DO_NOT_USE_FOR_RESOLUTION,
  FALL_CEILING,
  HHS_LIMITS,
  HHS_RESOLUTION_CHECKLIST,
  HHS_RESOLUTION_TEXT,
  INSUFFICIENT_FALL_INTRO,
  INSUFFICIENT_FALL_STEPS,
  LAB_CADENCE,
  LAB_FIELDS,
  MAINTENANCE_FLUID,
  POTASSIUM_BANDS,
  TRANSITION_OVERLAP,
  TRANSITION_OVERLAP_NOTE,
  TRANSITION_SPLIT_NOTE,
  TRANSITION_TEXTS,
} from '@clinical-tools/cad-ehh/content';
import { CYCLE_FIELDS, isHhsTrack, readCycle } from '@clinical-tools/cad-ehh/roteiro';
import {
  ADEQUATE_FALL,
  DELTA_DELTA_TEXT,
  DELTA_DELTA_TONE,
  FALL_TONE,
  MISSING,
  NOT_RESOLVED_TEXT,
  POTASSIUM_TONE,
  RESOLUTION_CRITERIA,
  RESOLVED_TEXT,
  elapsedLabel,
  glucoseFallTitle,
  insulinRateText,
  shortIntervalText,
  transitionDoseText,
} from '@clinical-tools/cad-ehh/screen-text';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import { calculatorHref } from '@clinical-tools/links';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/utils';
import {
  Block,
  BulletList,
  ChoiceButtons,
  CheckItem,
  Hint,
  LabInput,
  Paragraphs,
  SimpleTable,
  ToneCallout,
} from './parts';
import type { CadEhhScreenProps } from './step-props';

const FIELD = new Map(LAB_FIELDS.map((field) => [field.id, field]));

/**
 * Redesenha a tela a cada 30 s, para o "há X min" e a queda por hora andarem
 * com o relógio mesmo sem ninguém digitar. A hora em si vem de `now()`, lida
 * a cada desenho (injetável no teste).
 */
function useTick(intervalMs = 30_000): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function Criterion({ ok, label, weight }: { ok: boolean; label: string; weight: string }) {
  return (
    <li className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded border',
          ok ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {ok ? <Check weight="bold" className="size-3.5" /> : null}
      </span>
      <span
        className={cn('flex-1 text-sm', ok ? 'font-medium text-foreground' : 'text-foreground')}
      >
        {label}
        <span className="sr-only">{ok ? ': atendido' : ': não atendido'}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{weight}</span>
    </li>
  );
}

/**
 * Ciclo de reavaliação: não é passo, é tela reentrante. As mesmas variáveis a
 * cada rodada, o que mudou desde a anterior, os ajustes que decorrem e o
 * critério de saída (resolução e transição para a subcutânea).
 */
export function ReassessmentCycle({
  state,
  dispatch,
  weight,
  weightRaw,
  onWeightChange,
  now,
}: CadEhhScreenProps & { now: () => number }) {
  const [showSteps, setShowSteps] = useState(false);
  useTick();
  const reading = readCycle(state, weight, now());
  const { previous } = state.cycle;
  const { fall, deltaDelta, transition } = reading;
  const hhs = isHhsTrack(state.track);
  const reducedRate =
    reading.reducedInsulinRate !== null ? insulinRateText(reading.reducedInsulinRate) : null;
  const doses = transition ? transitionDoseText(transition) : null;
  const overlap = TRANSITION_OVERLAP.find(({ id }) => id === state.subcutaneous);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Reavaliação {state.cycle.round}
          {reading.minutes !== null ? (
            <span className="ml-2 font-normal text-muted-foreground">
              · anterior {elapsedLabel(reading.minutes)}
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11"
          onClick={() => {
            setShowSteps(false);
            dispatch({ type: 'nova-rodada', at: now() });
          }}
        >
          <ArrowsClockwise aria-hidden="true" />
          Nova rodada
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CYCLE_FIELDS.map((id) => {
          const field = FIELD.get(id);
          if (!field) return null;
          const before = previous?.values[id] ?? null;
          return (
            <LabInput
              key={id}
              label={field.label}
              unit={field.unit}
              range={field}
              value={state.cycle.current[id]}
              onChange={(raw) => dispatch({ type: 'digitar-rodada', field: id, raw })}
              hint={
                before !== null
                  ? `Anterior: ${formatCompact(before)}${field.unit ? ` ${field.unit}` : ''}`
                  : undefined
              }
            />
          );
        })}
      </div>

      <section aria-label="O que decorre" className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-foreground">O que decorre</h3>
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          {fall && reading.minutes !== null && !fall.extrapolable ? (
            <ToneCallout tone="neutral" title={glucoseFallTitle(fall)}>
              {shortIntervalText(reading.minutes)}
            </ToneCallout>
          ) : null}
          {fall?.extrapolable ? (
            <ToneCallout tone={FALL_TONE[fall.reading]} title={glucoseFallTitle(fall)}>
              {fall.reading === 'adequada' ? ADEQUATE_FALL : null}
              {fall.reading === 'rapida' ? stripSourceTags(FALL_CEILING) : null}
              {fall.reading === 'insuficiente' ? (
                <div className="flex flex-col gap-2">
                  <p>{stripSourceTags(INSUFFICIENT_FALL_INTRO)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 self-start"
                    aria-expanded={showSteps}
                    onClick={() => setShowSteps((open) => !open)}
                  >
                    {showSteps ? 'Fechar' : 'O que fazer'}
                  </Button>
                  {showSteps ? (
                    <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                      {INSUFFICIENT_FALL_STEPS.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
            </ToneCallout>
          ) : null}

          {reading.glucoseBelow250 ? (
            <ToneCallout tone="neutral" title="Glicemia abaixo de 250 mg/dL">
              <div className="flex flex-col gap-2">
                <Paragraphs texts={AFTER_250} />
                {reducedRate ? (
                  <p className="font-semibold">
                    Insulina a 0,05 U/kg/h = {reducedRate.unitsPerHour} = {reducedRate.mlPerHour}
                  </p>
                ) : null}
              </div>
            </ToneCallout>
          ) : null}

          {reading.correctedNa !== null && reading.maintenance !== null ? (
            <ToneCallout
              tone="neutral"
              title={`Sódio corrigido ${formatDecimal(reading.correctedNa, 1)} mEq/L`}
            >
              {MAINTENANCE_FLUID[reading.maintenance]}
            </ToneCallout>
          ) : null}

          {reading.values.potassio !== null && reading.potassiumBand !== null ? (
            <ToneCallout
              tone={POTASSIUM_TONE[reading.potassiumBand]}
              title={`Potássio ${formatDecimal(reading.values.potassio, 1)} mEq/L`}
            >
              {POTASSIUM_BANDS.find(({ id }) => id === reading.potassiumBand)?.conduct}
            </ToneCallout>
          ) : null}

          {hhs ? (
            <ToneCallout tone="attention" title="EHH — limites de correção">
              <BulletList items={HHS_LIMITS} />
            </ToneCallout>
          ) : null}

          {deltaDelta && reading.anionGap !== null ? (
            <ToneCallout
              tone={DELTA_DELTA_TONE[deltaDelta.reading]}
              title={`Ânion-gap ${reading.anionGap} · razão delta/delta ${formatDecimal(deltaDelta.ratio, 2)}`}
            >
              <div className="flex flex-col gap-1.5">
                <p>{DELTA_DELTA_TEXT[deltaDelta.reading]}</p>
                {deltaDelta.reading === 'hipercloremica' ? (
                  <p className="opacity-90">{stripSourceTags(DO_NOT_USE_FOR_RESOLUTION[2])}</p>
                ) : null}
                <p className="text-xs">
                  Delta gap {formatDecimal(deltaDelta.deltaGap, 1)} · fórmula em{' '}
                  <Link
                    href={calculatorHref('delta-gap', { from: { tool: 'cad-ehh' } })}
                    className="text-link underline"
                  >
                    Delta Gap e Razão Delta/Delta
                  </Link>
                  .
                </p>
              </div>
            </ToneCallout>
          ) : null}
        </div>

        <Disclosure title="Cadência de exames">
          <div className="flex flex-col gap-2">
            <SimpleTable
              caption="Cadência de exames"
              rows={LAB_CADENCE.map(({ parameter, frequency }) => [
                stripSourceTags(parameter),
                stripSourceTags(frequency),
              ])}
            />
            <Hint>{BHB_UNAVAILABLE_NOTE}</Hint>
          </div>
        </Disclosure>
      </section>

      <Block title="Critérios de resolução">
        <ul className="rounded-md border border-border">
          <Criterion
            ok={reading.resolution.required}
            label={RESOLUTION_CRITERIA.required.label}
            weight={RESOLUTION_CRITERIA.required.weight}
          />
          <Criterion
            ok={reading.resolution.desirable}
            label={RESOLUTION_CRITERIA.desirable.label}
            weight={RESOLUTION_CRITERIA.desirable.weight}
          />
        </ul>
        {reading.resolution.resolved ? (
          <ToneCallout tone="neutral" title="Critério obrigatório atendido">
            {RESOLVED_TEXT}
          </ToneCallout>
        ) : (
          <Hint>{NOT_RESOLVED_TEXT}</Hint>
        )}
        <ToneCallout tone="critical" title="O que NÃO usar como critério de resolução">
          <Paragraphs texts={DO_NOT_USE_FOR_RESOLUTION} />
        </ToneCallout>
      </Block>

      <div className="flex flex-col gap-1">
        {hhs ? (
          <Disclosure title="Resolução do EHH">
            <div className="flex flex-col gap-2">
              <p className="text-[0.9375rem] text-pretty text-foreground">
                {stripSourceTags(HHS_RESOLUTION_TEXT)}
              </p>
              <BulletList items={HHS_RESOLUTION_CHECKLIST} />
            </div>
          </Disclosure>
        ) : null}
        <Disclosure
          title="Transição para insulina subcutânea"
          meta={reading.resolution.resolved ? 'liberada' : undefined}
        >
          <div className="flex flex-col gap-3">
            <Paragraphs texts={TRANSITION_TEXTS} />
            <ChoiceButtons
              label="Insulina subcutânea iniciada"
              options={TRANSITION_OVERLAP.map(({ id, type }) => ({ id, label: type }))}
              value={state.subcutaneous}
              onChoose={(id) => dispatch({ type: 'insulina-subcutanea', id })}
              columns={2}
            />
            {overlap ? (
              <ToneCallout tone="neutral" title={`Manter a infusão EV por ${overlap.time}`}>
                {stripSourceTags(TRANSITION_OVERLAP_NOTE)}
              </ToneCallout>
            ) : null}
            <CheckItem
              label="Risco de hipoglicemia"
              description="Insuficiência renal, fragilidade"
              checked={state.hypoglycemiaRisk}
              onToggle={() => dispatch({ type: 'risco-hipoglicemia' })}
            />
            {doses ? (
              <dl className="flex flex-col gap-1.5 rounded-md bg-surface-subtle px-4 py-3">
                <div className="flex justify-between gap-3">
                  <dt className="text-sm text-muted-foreground">Dose diária total</dt>
                  <dd className="text-sm font-semibold text-foreground tabular-nums">
                    {doses.totalDaily}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sm text-muted-foreground">Insulina basal</dt>
                  <dd className="text-sm font-semibold text-foreground tabular-nums">
                    {doses.basal}
                  </dd>
                </div>
              </dl>
            ) : (
              <>
                <Hint>{MISSING.weightForTransition}</Hint>
                <WeightField population="adulto" value={weightRaw} onValueChange={onWeightChange} />
              </>
            )}
            <Hint>{TRANSITION_SPLIT_NOTE}</Hint>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
