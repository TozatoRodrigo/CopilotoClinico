'use client';

import { TrendDown } from '@phosphor-icons/react';
import {
  buildInsulinNote,
  describeInsulinStatus,
  formatInsulinBolus,
  formatInsulinInfusion,
  insulinAdjustment,
  insulinRow,
  insulinStart,
  insulinTrend,
  INSULIN_INPUT_RANGES,
  INSULIN_PROTOCOL,
} from '@clinical-tools/infusions/insulin';
import { validateNumber } from '@clinical-tools/ranges';
import { ChoiceGroup } from '@/components/domain/clinical-tools/choice-group';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Callout } from '@/components/ui/callout';
import type { InsulinScreenState, ProtocolPhase } from './infusion-state';
import { DilutionBlock, ProtocolTable, ResultPair } from './protocol-parts';

const PHASES = [
  { value: 'inicio', label: 'Início' },
  { value: 'ajuste', label: 'Ajuste (glicemia)' },
] as const;

/** Campo opcional: vazio vale `null`; preenchido, só se estiver na faixa. */
function optional(raw: string, range: typeof INSULIN_INPUT_RANGES.glucose) {
  if (raw.trim() === '') return { ok: true as const, value: null };
  const checked = validateNumber(raw, range);
  return checked.ok ? { ok: true as const, value: checked.value } : { ok: false as const };
}

/**
 * Insulina regular em infusão (CC-312): tabela por glicemia no início e, no
 * ajuste, a tabela corrigida pela queda da última hora. Toda conta e todo
 * texto vêm do motor (insulin.ts).
 */
export function InsulinPanel({
  state,
  onChange,
}: {
  state: InsulinScreenState;
  onChange: (next: InsulinScreenState) => void;
}) {
  const glucoseRange = INSULIN_INPUT_RANGES.glucose;
  const initial = validateNumber(state.initial, glucoseRange);
  const current = validateNumber(state.current, glucoseRange);
  const previous = optional(state.previous, glucoseRange);
  const infusion = validateNumber(state.currentInfusion, INSULIN_INPUT_RANGES.currentInfusion);

  const glucose =
    state.phase === 'inicio'
      ? initial.ok
        ? initial.value
        : null
      : current.ok
        ? current.value
        : null;
  const suggestion =
    state.phase === 'inicio'
      ? initial.ok
        ? insulinStart(initial.value)
        : null
      : current.ok && previous.ok && infusion.ok
        ? insulinAdjustment(current.value, previous.value, infusion.value)
        : null;
  const trend =
    state.phase === 'ajuste' && current.ok && previous.ok && previous.value !== null
      ? insulinTrend(current.value, previous.value)
      : null;
  const status = glucose !== null && suggestion ? describeInsulinStatus(glucose) : null;

  const note =
    suggestion && glucose !== null
      ? buildInsulinNote({
          phase: state.phase,
          glucose,
          previous: previous.ok ? previous.value : null,
          currentInfusion: infusion.ok ? infusion.value : null,
          suggestion,
        })
      : null;

  const missing =
    state.phase === 'inicio'
      ? state.initial.trim() === ''
      : state.current.trim() === '' || state.currentInfusion.trim() === '';
  const pending = !missing
    ? 'Corrija o campo destacado para ver a sugestão.'
    : state.phase === 'inicio'
      ? 'Informe a glicemia para ver bolus e infusão.'
      : 'Informe a glicemia atual e a infusão atual para ver o ajuste.';

  return (
    <div className="flex flex-col gap-5">
      <ChoiceGroup<ProtocolPhase>
        label="Fase"
        options={PHASES}
        value={state.phase}
        onChange={(phase) => onChange({ ...state, phase })}
      />

      {state.phase === 'inicio' ? (
        <NumericField
          label="Glicemia inicial"
          unit={glucoseRange.unit}
          range={glucoseRange}
          value={state.initial}
          onValueChange={(raw) => onChange({ ...state, initial: raw })}
          placeholder="250"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField
              label="Glicemia atual"
              unit={glucoseRange.unit}
              range={glucoseRange}
              value={state.current}
              onValueChange={(raw) => onChange({ ...state, current: raw })}
              placeholder="180"
            />
            <NumericField
              label="Glicemia 1 h antes"
              unit={glucoseRange.unit}
              range={glucoseRange}
              value={state.previous}
              onValueChange={(raw) => onChange({ ...state, previous: raw })}
              placeholder="250"
              hint="Opcional: corrige a infusão pela queda."
            />
          </div>
          <NumericField
            label="Infusão atual"
            unit={INSULIN_INPUT_RANGES.currentInfusion.unit}
            range={INSULIN_INPUT_RANGES.currentInfusion}
            value={state.currentInfusion}
            onValueChange={(raw) => onChange({ ...state, currentInfusion: raw })}
            placeholder="2"
            hint="0 se a infusão não está correndo."
          />
          {trend ? (
            <Callout tone="gray" icon={<TrendDown />} title="Variação">
              <dl className="flex flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <dt>Queda em 1 h</dt>
                  <dd className="text-right font-medium tabular-nums">{trend.dropText}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Leitura</dt>
                  <dd className="text-right font-medium">{trend.readingText}</dd>
                </div>
              </dl>
            </Callout>
          ) : null}
        </div>
      )}

      <ResultPair
        tone={status?.tone ?? 'neutral'}
        items={
          suggestion
            ? [
                { label: 'Bolus', value: formatInsulinBolus(suggestion.bolus) },
                { label: 'Infusão', value: formatInsulinInfusion(suggestion.infusion) },
              ]
            : null
        }
        status={
          status ? { label: status.label, text: `faixa ${suggestion?.row.range} mg/dL` } : null
        }
        pending={pending}
      />

      <ProtocolTable
        caption="Tabela de insulina por glicemia"
        headers={['Glicemia (mg/dL)', 'Bolus (UI)', 'Infusão (UI/h)']}
        rows={INSULIN_PROTOCOL.table.map((row) => ({
          id: row.id,
          cells: [row.range, row.bolusText, row.infusionText],
        }))}
        currentId={glucose !== null ? insulinRow(glucose).id : null}
      />

      <DilutionBlock
        preparation={INSULIN_PROTOCOL.preparation}
        concentration={`${INSULIN_PROTOCOL.concentration} UI/mL`}
        note="Com 1 UI/mL, UI/h e mL/h são o mesmo número."
      />

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <CopyToChartButton text={note} />
        <ContentProvenanceNote provenance={INSULIN_PROTOCOL.provenance} />
      </div>
    </div>
  );
}
