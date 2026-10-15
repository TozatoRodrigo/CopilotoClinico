'use client';

import { formatDecimal } from '@clinical-tools/numbers';
import { describeLactate, LACTATE_RANGES, LACTATE_UNITS } from '@clinical-tools/shock/lactate';
import { hasHypoperfusion, tecReevaluations } from '@clinical-tools/shock/septic-roteiro';
import {
  capillaryRefillResult,
  CAPILLARY_REFILL,
  RECOGNITION_CRITERIA,
  RECOGNITION_CRITERIA_HINT,
} from '@clinical-tools/shock/septic-shock';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Button } from '@/components/ui/button';
import { ChoiceQuestion } from '../../_components/shock/choice-question';
import { formatClock } from '../../_components/shock/format-time';
import { BlockHint, BlockTitle, CheckItem } from '../../_components/shock/roteiro-parts';
import { ToneResult } from '../../_components/shock/tone-result';
import type { SepticStepProps } from './step-props';
import { TecReevaluation } from './tec-reevaluation';

const UNIT_OPTIONS = LACTATE_UNITS.map((unit) => ({ id: unit, label: unit }));

/** Passo 1 — reconhecimento: critérios, peso, lactato e TEC. */
export function RecognitionStep({
  state,
  values,
  dispatch,
  now,
  weight,
  onWeightChange,
}: SepticStepProps & { weight: string; onWeightChange: (raw: string) => void }) {
  const tec = values.tec;
  const lastReevaluation =
    state.tec?.source === 'reavaliacao' ? tecReevaluations(state).at(-1) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-base font-semibold text-foreground">
          Critérios de reconhecimento
        </legend>
        <BlockHint>{RECOGNITION_CRITERIA_HINT}</BlockHint>
        {RECOGNITION_CRITERIA.map((criterion) => (
          <CheckItem
            key={criterion.id}
            label={criterion.label}
            checked={state.criteria[criterion.id]}
            onToggle={() => dispatch({ type: 'marcar-criterio', criterion: criterion.id })}
          />
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <WeightField
          population="adulto"
          label="Peso estimado"
          value={weight}
          onValueChange={onWeightChange}
        />
        <div className="flex flex-col gap-3">
          <NumericField
            label="Lactato"
            unit={state.lactateUnit}
            range={LACTATE_RANGES[state.lactateUnit]}
            value={state.fields.lactate}
            onValueChange={(raw) => dispatch({ type: 'digitar', field: 'lactate', raw })}
            hint={
              values.lactateMmol === null
                ? undefined
                : describeLactate(values.lactateMmol, state.lactateUnit)
            }
            placeholder={state.lactateUnit === 'mmol/L' ? '2,0' : '18'}
          />
          <ChoiceQuestion
            id="unidade-lactato"
            label="Unidade do lactato"
            options={UNIT_OPTIONS}
            value={state.lactateUnit}
            onChange={(unit) => dispatch({ type: 'unidade-do-lactato', unit })}
          />
        </div>
      </div>

      <section aria-labelledby="tec-titulo" className="flex flex-col gap-3">
        <BlockTitle id="tec-titulo">{CAPILLARY_REFILL.title}</BlockTitle>
        <BlockHint>{CAPILLARY_REFILL.technique}</BlockHint>
        <ChoiceQuestion
          id="tec-faixa"
          label="TEC por faixa"
          options={CAPILLARY_REFILL.modes}
          value={state.tecMode}
          onChange={(mode) => dispatch({ type: 'tec-por-faixa', mode })}
        />
        <NumericField
          label="ou TEC medido"
          unit={CAPILLARY_REFILL.input.unit}
          range={CAPILLARY_REFILL.input}
          value={state.tecRaw}
          onValueChange={(raw) => dispatch({ type: 'tec-digitado', raw })}
          placeholder="Segundos"
        />
        {lastReevaluation && tec !== null ? (
          <p className="text-sm text-muted-foreground">
            TEC em vigor: {formatDecimal(tec, 1)} s (reavaliação das{' '}
            {formatClock(lastReevaluation.at)}).
          </p>
        ) : null}

        {tec !== null ? (
          <ToneResult
            tone={capillaryRefillResult(tec).tone}
            title={capillaryRefillResult(tec).title}
          >
            {capillaryRefillResult(tec).text}
          </ToneResult>
        ) : null}

        {tec !== null && hasHypoperfusion(state) ? (
          <Button
            type="button"
            size="lg"
            onClick={() => dispatch({ type: 'iniciar-tier-1', at: now() })}
          >
            {CAPILLARY_REFILL.startTier1}
          </Button>
        ) : null}

        {tec !== null && !hasHypoperfusion(state) ? (
          <section aria-labelledby="reavaliacao-passo-1" className="flex flex-col gap-2">
            <BlockTitle id="reavaliacao-passo-1">Reavaliação do TEC</BlockTitle>
            <TecReevaluation state={state} dispatch={dispatch} now={now} />
          </section>
        ) : null}
      </section>
    </div>
  );
}
