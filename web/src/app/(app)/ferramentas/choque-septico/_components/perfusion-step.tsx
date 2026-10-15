'use client';

import { formatDecimal } from '@clinical-tools/numbers';
import { evaluatePerfusion, PERFUSION_INPUTS } from '@clinical-tools/shock/perfusion-quadrant';
import {
  ECHO_FINDINGS,
  PERFUSION_STEP,
  SEPTIC_INFUSION_LINKS,
  YES_NO_OPTIONS,
} from '@clinical-tools/shock/septic-shock';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { ChoiceQuestion } from '../../_components/shock/choice-question';
import { InfusionLinks } from '../../_components/shock/infusion-links';
import { PerfusionResult } from '../../_components/shock/perfusion-quadrant';
import {
  BlockHint,
  BlockTitle,
  CheckItem,
  DataChips,
  StepNav,
} from '../../_components/shock/roteiro-parts';
import { withUnit, type SepticStepProps } from './step-props';

/** Passo 4 — perfusão: eco à beira-leito, gap CO2 × SvcO2 e testes adicionais (Tier 2). */
export function PerfusionStep({ state, values, dispatch, now }: SepticStepProps) {
  const perfusion = evaluatePerfusion({
    svco2: state.fields.svco2,
    gapCO2: state.fields.gapCO2,
  });

  return (
    <div className="flex flex-col gap-6">
      <DataChips
        items={[
          { label: 'PAD', value: withUnit(values.pad, 'mmHg', 0) },
          { label: 'FC', value: withUnit(values.fc, 'bpm', 0) },
          { label: 'VNERi', value: values.vneri === null ? null : formatDecimal(values.vneri, 1) },
          { label: 'PP', value: withUnit(values.pulsePressure, 'mmHg', 0) },
        ]}
      />

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-base font-semibold text-foreground">
          {PERFUSION_STEP.echoTitle}
        </legend>
        <BlockHint>{PERFUSION_STEP.echoHint}</BlockHint>
        {ECHO_FINDINGS.map((finding) => (
          <CheckItem
            key={finding.id}
            label={finding.label}
            checked={state.echo[finding.id]}
            onToggle={() => dispatch({ type: 'marcar-eco', finding: finding.id })}
          />
        ))}
      </fieldset>

      <section aria-labelledby="marcadores-titulo" className="flex flex-col gap-3">
        <BlockTitle id="marcadores-titulo">{PERFUSION_STEP.markersTitle}</BlockTitle>
        <BlockHint>{PERFUSION_STEP.markersHint}</BlockHint>
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            label={PERFUSION_INPUTS.svco2.label}
            unit={PERFUSION_INPUTS.svco2.unit}
            range={PERFUSION_INPUTS.svco2}
            value={state.fields.svco2}
            onValueChange={(raw) => dispatch({ type: 'digitar', field: 'svco2', raw })}
            placeholder="65"
          />
          <NumericField
            label={PERFUSION_INPUTS.gapCO2.label}
            unit={PERFUSION_INPUTS.gapCO2.unit}
            range={PERFUSION_INPUTS.gapCO2}
            value={state.fields.gapCO2}
            onValueChange={(raw) => dispatch({ type: 'digitar', field: 'gapCO2', raw })}
            placeholder="6"
          />
        </div>
        <PerfusionResult evaluation={perfusion} />
      </section>

      <Disclosure
        title={PERFUSION_STEP.extraTestsTitle}
        defaultOpen={state.chronicHypertension !== null || state.dobutamineTest !== null}
      >
        <div className="flex flex-col gap-4">
          <ChoiceQuestion
            id="hipertensao-cronica"
            label={PERFUSION_STEP.chronicHypertensionQuestion}
            options={YES_NO_OPTIONS}
            value={state.chronicHypertension}
            onChange={(answer) => dispatch({ type: 'hipertensao-cronica', answer })}
          />
          {state.chronicHypertension === 'sim' ? (
            <>
              <Callout tone="gray" title={PERFUSION_STEP.mapTest.title}>
                {PERFUSION_STEP.mapTest.text}
              </Callout>
              <ChoiceQuestion
                id="teste-pam"
                label={PERFUSION_STEP.mapTestQuestion}
                options={YES_NO_OPTIONS}
                value={state.mapTest}
                onChange={(answer) => dispatch({ type: 'teste-pam', answer, at: now() })}
              />
            </>
          ) : null}
          <Callout tone="gray" title={PERFUSION_STEP.dobutamineTest.title}>
            {PERFUSION_STEP.dobutamineTest.text}
          </Callout>
          <ChoiceQuestion
            id="teste-dobutamina"
            label={PERFUSION_STEP.dobutamineTestQuestion}
            options={YES_NO_OPTIONS}
            value={state.dobutamineTest}
            onChange={(answer) => dispatch({ type: 'teste-dobutamina', answer, at: now() })}
          />
          <InfusionLinks drugs={SEPTIC_INFUSION_LINKS.perfusao} />
        </div>
      </Disclosure>

      <StepNav
        back={{
          label: 'Passo 3',
          onClick: () => dispatch({ type: 'ir-para', step: 'vasopressor' }),
        }}
        next={{ label: 'Resumo', onClick: () => dispatch({ type: 'avancar', at: now() }) }}
      />
    </div>
  );
}
