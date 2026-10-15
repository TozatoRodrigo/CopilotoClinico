'use client';

import { Info } from '@phosphor-icons/react';
import {
  evaluatePerfusion,
  PERFUSION_INPUTS,
  PERFUSION_STANDALONE,
  type PerfusionInputId,
} from '@clinical-tools/shock/perfusion-quadrant';
import { SHOCK_REFERENCES } from '@clinical-tools/shock/sources';
import {
  buildPerfusionChartNote,
  buildVneriChartNote,
} from '@clinical-tools/shock/undifferentiated';
import {
  evaluateVneri,
  VNERI_INPUTS,
  VNERI_STANDALONE,
  type VneriInputId,
} from '@clinical-tools/shock/vneri';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Callout } from '@/components/ui/callout';
import { PerfusionResult } from '../../_components/shock/perfusion-quadrant';
import { VneriResult } from '../../_components/shock/vneri-result';

const cite = (reference: { authors: string; citation: string }) =>
  `${reference.authors} ${reference.citation}`;

/** VNERi avulso (CC-317): PAD, FC e dose de noradrenalina, resultado ao vivo. */
export function VneriPanel({
  values,
  onChange,
}: {
  values: Readonly<Record<VneriInputId, string>>;
  onChange: (field: VneriInputId, raw: string) => void;
}) {
  const evaluation = evaluateVneri(values);
  return (
    <div className="flex flex-col gap-5">
      <Callout tone="gray" icon={<Info />} title={VNERI_STANDALONE.info.title}>
        <p>{VNERI_STANDALONE.info.text}</p>
        <p className="mt-1 text-xs">{VNERI_STANDALONE.info.formula}</p>
      </Callout>
      <div className="grid grid-cols-2 gap-3">
        <NumericField
          label="PAD"
          unit={VNERI_INPUTS.pad.unit}
          range={VNERI_INPUTS.pad}
          value={values.pad}
          onValueChange={(raw) => onChange('pad', raw)}
          placeholder="50"
        />
        <NumericField
          label="FC"
          unit={VNERI_INPUTS.fc.unit}
          range={VNERI_INPUTS.fc}
          value={values.fc}
          onValueChange={(raw) => onChange('fc', raw)}
          placeholder="100"
        />
      </div>
      <NumericField
        label={VNERI_INPUTS.doseNE.label}
        unit={VNERI_INPUTS.doseNE.unit}
        range={VNERI_INPUTS.doseNE}
        value={values.doseNE}
        onValueChange={(raw) => onChange('doseNE', raw)}
        placeholder="0,10"
      />
      <VneriResult evaluation={evaluation} />
      <CopyToChartButton
        text={
          evaluation.status === 'complete'
            ? buildVneriChartNote(evaluation, cite(SHOCK_REFERENCES.goury))
            : null
        }
      />
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {VNERI_STANDALONE.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

/** Gap CO2 × SvcO2 avulso (CC-317): quadrante ao vivo e grade. */
export function PerfusionPanel({
  values,
  onChange,
}: {
  values: Readonly<Record<PerfusionInputId, string>>;
  onChange: (field: PerfusionInputId, raw: string) => void;
}) {
  const evaluation = evaluatePerfusion(values);
  return (
    <div className="flex flex-col gap-5">
      <Callout tone="gray" icon={<Info />} title={PERFUSION_STANDALONE.info.title}>
        {PERFUSION_STANDALONE.info.text}
      </Callout>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(PERFUSION_INPUTS) as PerfusionInputId[]).map((id) => (
          <NumericField
            key={id}
            label={PERFUSION_INPUTS[id].label}
            unit={PERFUSION_INPUTS[id].unit}
            range={PERFUSION_INPUTS[id]}
            value={values[id]}
            onValueChange={(raw) => onChange(id, raw)}
            placeholder={id === 'svco2' ? '65' : '6'}
          />
        ))}
      </div>
      <PerfusionResult evaluation={evaluation} />
      <CopyToChartButton
        text={
          evaluation.status === 'complete'
            ? buildPerfusionChartNote(evaluation, cite(SHOCK_REFERENCES.ltaief))
            : null
        }
      />
      <p className="text-xs text-muted-foreground">{PERFUSION_STANDALONE.note}</p>
    </div>
  );
}
