'use client';

import { Minus, Plus } from '@phosphor-icons/react';
import { formatCompact } from '@clinical-tools/numbers';
import { validateWeight } from '@clinical-tools/ranges';
import { SEPTIC_INFUSION_LINKS, VASOPRESSOR } from '@clinical-tools/shock/septic-shock';
import { evaluateVneri } from '@clinical-tools/shock/vneri';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
import { InfusionLinks } from '../../_components/shock/infusion-links';
import {
  ActionQuestion,
  BlockHint,
  BlockTitle,
  DataChips,
  StepNav,
} from '../../_components/shock/roteiro-parts';
import { ToneResult } from '../../_components/shock/tone-result';
import { VneriResult } from '../../_components/shock/vneri-result';
import { withUnit, type SepticStepProps } from './step-props';

const STEP_LABEL = formatCompact(VASOPRESSOR.doseStep);

/** Passo 3 — vasopressor: PAD, FC, dose de noradrenalina e VNERi (Tier 1). */
export function VasopressorStep({
  state,
  values,
  dispatch,
  now,
  weight,
}: SepticStepProps & { weight: string }) {
  const { inputs } = VASOPRESSOR;
  const vneri = evaluateVneri({
    pad: state.fields.pad,
    fc: state.fields.fc,
    doseNE: state.fields.doseNE,
  });
  const validWeight = validateWeight(weight, 'adulto');

  return (
    <div className="flex flex-col gap-6">
      <DataChips
        items={[
          { label: 'TEC', value: withUnit(values.tec, 's') },
          { label: 'PP', value: withUnit(values.pulsePressure, 'mmHg', 0) },
          { label: 'Fluidos', value: `${state.bolusTotalMl} mL` },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <NumericField
          label="PAD"
          unit={inputs.pad.unit}
          range={inputs.pad}
          value={state.fields.pad}
          onValueChange={(raw) => dispatch({ type: 'digitar', field: 'pad', raw })}
          placeholder="50"
        />
        <NumericField
          label="FC"
          unit={inputs.fc.unit}
          range={inputs.fc}
          value={state.fields.fc}
          onValueChange={(raw) => dispatch({ type: 'digitar', field: 'fc', raw })}
          placeholder="100"
        />
      </div>

      {values.pad !== null && values.pad < VASOPRESSOR.padLowerThan ? (
        <ToneResult tone={VASOPRESSOR.vasoplegia.tone} title={VASOPRESSOR.vasoplegia.title}>
          {VASOPRESSOR.vasoplegia.text}
        </ToneResult>
      ) : null}

      <div className="flex flex-col gap-2">
        <NumericField
          label={inputs.doseNE.label}
          unit={inputs.doseNE.unit}
          range={inputs.doseNE}
          value={state.fields.doseNE}
          onValueChange={(raw) => dispatch({ type: 'digitar', field: 'doseNE', raw })}
          placeholder="0,10"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={`Diminuir a dose em ${STEP_LABEL}`}
            onClick={() =>
              dispatch({ type: 'ajustar-noradrenalina', delta: -VASOPRESSOR.doseStep })
            }
          >
            <Minus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={`Aumentar a dose em ${STEP_LABEL}`}
            onClick={() => dispatch({ type: 'ajustar-noradrenalina', delta: VASOPRESSOR.doseStep })}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Peso:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {validWeight.ok ? `${formatCompact(validWeight.value, 1)} kg` : '-- kg'}
          </span>
          {validWeight.ok ? null : ' (informe no passo 1 para as Infusões)'}
        </p>
      </div>

      <section aria-labelledby="vneri-titulo" className="flex flex-col gap-2">
        <BlockTitle id="vneri-titulo">{VASOPRESSOR.vneriTitle}</BlockTitle>
        <BlockHint>
          {VASOPRESSOR.vneriFormula}. {VASOPRESSOR.vneriSource}.
        </BlockHint>
        <VneriResult evaluation={vneri} />
      </section>

      <InfusionLinks drugs={SEPTIC_INFUSION_LINKS.vasopressor} />

      <ActionQuestion
        id="tec-apos-vasopressor"
        question={VASOPRESSOR.tecNormalizedQuestion}
        answers={[
          {
            label: 'Sim',
            onSelect: () => dispatch({ type: 'tec-apos-vasopressor', normalized: true, at: now() }),
          },
          {
            label: 'Não',
            onSelect: () =>
              dispatch({ type: 'tec-apos-vasopressor', normalized: false, at: now() }),
          },
        ]}
      />

      <StepNav
        back={{ label: 'Passo 2', onClick: () => dispatch({ type: 'ir-para', step: 'fluidos' }) }}
        next={{ label: 'Passo 4', onClick: () => dispatch({ type: 'avancar', at: now() }) }}
      />
    </div>
  );
}
