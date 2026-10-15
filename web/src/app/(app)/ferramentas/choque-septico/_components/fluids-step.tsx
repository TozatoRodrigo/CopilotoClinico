'use client';

import { Plus } from '@phosphor-icons/react';
import { formatDecimal } from '@clinical-tools/numbers';
import {
  FLUID_RESPONSIVENESS_METHODS,
  FLUIDS,
  PULSE_PRESSURE,
  pulsePressureResult,
  VASOPRESSOR,
  YES_NO_OPTIONS,
} from '@clinical-tools/shock/septic-shock';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ChoiceGroup, choicesFromIds } from '@/components/domain/clinical-tools/choice-group';
import {
  ActionQuestion,
  BlockHint,
  BlockTitle,
  DataChips,
  StepNav,
} from '../../_components/shock/roteiro-parts';
import { ToneResult } from '../../_components/shock/tone-result';
import { withUnit, type SepticStepProps } from './step-props';

/** Passo 2 — fluidos: pressão de pulso, fluidorresponsividade e bolus (Tier 1). */
export function FluidsStep({ state, values, dispatch, now }: SepticStepProps) {
  const pp = values.pulsePressure;
  const method = FLUID_RESPONSIVENESS_METHODS.find(({ id }) => id === state.fluidMethod);
  const atLimit = state.bolusTotalMl >= FLUIDS.bolusMaxMl;
  const toVasopressor = () => dispatch({ type: 'ir-para', step: 'vasopressor' });

  return (
    <div className="flex flex-col gap-6">
      <DataChips
        items={[
          { label: 'TEC', value: withUnit(values.tec, 's') },
          { label: 'Lactato', value: withUnit(values.lactateMmol, 'mmol/L') },
        ]}
      />

      <section aria-labelledby="pp-titulo" className="flex flex-col gap-3">
        <BlockTitle id="pp-titulo">{PULSE_PRESSURE.title}</BlockTitle>
        <BlockHint>{PULSE_PRESSURE.explanation}</BlockHint>
        <ChoiceGroup
          label="Como informar a PP"
          options={choicesFromIds(PULSE_PRESSURE.modes)}
          value={state.pulsePressureMode}
          onChange={(mode) => dispatch({ type: 'modo-da-pressao-de-pulso', mode })}
        />
        {state.pulsePressureMode === 'direto' ? (
          <NumericField
            label={PULSE_PRESSURE.inputs.pp.label}
            unit={PULSE_PRESSURE.inputs.pp.unit}
            range={PULSE_PRESSURE.inputs.pp}
            value={state.fields.pp}
            onValueChange={(raw) => dispatch({ type: 'digitar', field: 'pp', raw })}
            placeholder="40"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NumericField
              label="PAS"
              unit={PULSE_PRESSURE.inputs.pas.unit}
              range={PULSE_PRESSURE.inputs.pas}
              value={state.fields.pas}
              onValueChange={(raw) => dispatch({ type: 'digitar', field: 'pas', raw })}
              placeholder="90"
            />
            <NumericField
              label="PAD"
              unit={VASOPRESSOR.inputs.pad.unit}
              range={VASOPRESSOR.inputs.pad}
              value={state.fields.pad}
              onValueChange={(raw) => dispatch({ type: 'digitar', field: 'pad', raw })}
              placeholder="50"
            />
          </div>
        )}
        {state.pulsePressureMode === 'calculado' && pp !== null ? (
          <p className="text-sm font-medium text-foreground tabular-nums">
            PP = {formatDecimal(pp, 0)} mmHg
          </p>
        ) : null}
        {values.pulsePressureInvalid ? (
          <p className="text-sm font-medium text-destructive">{PULSE_PRESSURE.invalidDifference}</p>
        ) : null}
        {pp !== null ? (
          <ToneResult tone={pulsePressureResult(pp).tone} title={pulsePressureResult(pp).title}>
            {pulsePressureResult(pp).text}
          </ToneResult>
        ) : null}
      </section>

      {pp !== null && pp < PULSE_PRESSURE.lowerThan ? (
        <section aria-label="Fluidorresponsividade" className="flex flex-col gap-4">
          <ChoiceGroup
            label={FLUIDS.methodsTitle}
            options={choicesFromIds(FLUID_RESPONSIVENESS_METHODS)}
            value={state.fluidMethod}
            onChange={(id) => dispatch({ type: 'metodo-de-fluidorresponsividade', method: id })}
          />
          {method ? (
            <Callout tone="gray" title={method.title}>
              {method.text}
            </Callout>
          ) : null}
          <ChoiceGroup
            label={FLUIDS.responsiveQuestion}
            options={choicesFromIds(YES_NO_OPTIONS)}
            value={state.fluidResponsive}
            onChange={(answer) => dispatch({ type: 'responsivo-a-fluidos', answer })}
          />

          {state.fluidResponsive === 'sim' ? (
            <div className="flex flex-col gap-4">
              <Callout tone="gray" title={FLUIDS.bolus.title}>
                {FLUIDS.bolus.text}
              </Callout>
              <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                <div className="flex-1">
                  <p className="text-2xl font-semibold text-foreground tabular-nums">
                    {state.bolusTotalMl} mL
                  </p>
                  <p className="text-xs text-muted-foreground">Total administrado neste passo</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={atLimit}
                  aria-label={atLimit ? undefined : `Somar bolus de ${FLUIDS.bolusStepMl} mL`}
                  onClick={() => dispatch({ type: 'adicionar-bolus', at: now() })}
                >
                  {atLimit ? (
                    `Limite de ${FLUIDS.bolusMaxMl} mL`
                  ) : (
                    <>
                      <Plus aria-hidden="true" />
                      {FLUIDS.bolusStepMl} mL
                    </>
                  )}
                </Button>
              </div>
              <ActionQuestion
                id="tec-apos-fluidos"
                question={FLUIDS.tecNormalizedQuestion}
                answers={[
                  {
                    label: 'Sim',
                    onSelect: () =>
                      dispatch({ type: 'tec-apos-fluidos', normalized: true, at: now() }),
                  },
                  {
                    label: 'Não',
                    onSelect: () =>
                      dispatch({ type: 'tec-apos-fluidos', normalized: false, at: now() }),
                  },
                ]}
              />
            </div>
          ) : null}

          {state.fluidResponsive === 'nao' ? (
            <ToneResult
              tone={FLUIDS.notResponsive.tone}
              title={FLUIDS.notResponsive.title}
              action={
                <Button type="button" onClick={toVasopressor}>
                  {FLUIDS.toVasopressor}
                </Button>
              }
            >
              {FLUIDS.notResponsive.text}
            </ToneResult>
          ) : null}
        </section>
      ) : null}

      {pp !== null && pp >= PULSE_PRESSURE.lowerThan ? (
        <Button type="button" className="self-start" onClick={toVasopressor}>
          {FLUIDS.toVasopressor}
        </Button>
      ) : null}

      <StepNav
        back={{
          label: 'Passo 1',
          onClick: () => dispatch({ type: 'ir-para', step: 'reconhecimento' }),
        }}
        next={{ label: 'Passo 3', onClick: () => dispatch({ type: 'avancar', at: now() }) }}
      />
    </div>
  );
}
