'use client';

import { Drop, Syringe } from '@phosphor-icons/react';
import {
  buildHeparinNote,
  describeHeparinStatus,
  formatUnits,
  heparinAdjustment,
  heparinNomogramRow,
  heparinStart,
  HEPARIN_INPUT_RANGES,
  HEPARIN_PROTOCOL,
  type HeparinIndication,
} from '@clinical-tools/infusions/heparin';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import { validateNumber } from '@clinical-tools/ranges';
import { ChoiceGroup } from '@/components/domain/clinical-tools/choice-group';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Callout } from '@/components/ui/callout';
import type { HeparinScreenState, ProtocolPhase } from './infusion-state';
import { DilutionBlock, ProtocolTable, ResultPair } from './protocol-parts';

const PHASES = [
  { value: 'inicio', label: 'Início' },
  { value: 'ajuste', label: 'Ajuste (TTPa)' },
] as const;

const INDICATIONS = (Object.keys(HEPARIN_PROTOCOL.indications) as HeparinIndication[]).map(
  (id) => ({ value: id, label: HEPARIN_PROTOCOL.indications[id].label }),
);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Heparina em infusão (CC-312): início por peso e indicação, e ajuste pelo
 * nomograma de TTPa. Toda conta e todo texto vêm do motor (heparin.ts).
 */
export function HeparinPanel({
  state,
  onChange,
  weightKg,
}: {
  state: HeparinScreenState;
  onChange: (next: HeparinScreenState) => void;
  weightKg: number | null;
}) {
  const content = HEPARIN_PROTOCOL.indications[state.indication];
  const ratio = validateNumber(state.ratio, HEPARIN_INPUT_RANGES.ratio);
  const dose =
    state.currentDose.trim() === ''
      ? null
      : validateNumber(state.currentDose, HEPARIN_INPUT_RANGES.currentDose);
  const currentDose = dose?.ok ? dose.value : null;

  const start = weightKg !== null ? heparinStart(weightKg, state.indication) : null;
  const adjustment =
    state.phase === 'ajuste' && weightKg !== null && ratio.ok && (dose === null || dose.ok)
      ? heparinAdjustment(weightKg, state.indication, ratio.value, currentDose)
      : null;
  const status = adjustment && ratio.ok ? describeHeparinStatus(ratio.value) : null;
  const row = state.phase === 'ajuste' && ratio.ok ? heparinNomogramRow(ratio.value) : null;

  const note =
    weightKg === null
      ? null
      : state.phase === 'inicio' && start
        ? buildHeparinNote({ indication: state.indication, weightKg, start })
        : adjustment && ratio.ok
          ? buildHeparinNote({
              indication: state.indication,
              weightKg,
              adjustment: { ratio: ratio.value, result: adjustment },
            })
          : null;

  const pending =
    weightKg === null
      ? 'Informe o peso do paciente para calcular.'
      : state.ratio.trim() === ''
        ? 'Informe o TTPa (relação paciente/controle) para ver o ajuste.'
        : 'Corrija o campo destacado para ver o ajuste.';

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceGroup<ProtocolPhase>
          label="Fase"
          options={PHASES}
          value={state.phase}
          onChange={(phase) => onChange({ ...state, phase })}
        />
        <ChoiceGroup<HeparinIndication>
          label="Indicação"
          options={INDICATIONS}
          value={state.indication}
          onChange={(indication) => onChange({ ...state, indication })}
        />
      </div>

      {state.phase === 'inicio' ? (
        <>
          <Callout tone="orange" icon={<Syringe />} title={content.bolusTitle}>
            <dl className="flex flex-col gap-1">
              <Row label="Dose de bolus" value={content.bolusText} />
              {start ? <Row label="Este paciente" value={formatUnits(start.bolusUnits)} /> : null}
              <Row label="Infusão inicial" value={content.infusionText} />
            </dl>
          </Callout>
          <ResultPair
            tone="neutral"
            items={
              start
                ? [
                    { label: 'Velocidade', value: formatDecimal(start.mlh), unit: 'mL/h' },
                    { label: 'Dose', value: formatDecimal(start.unitsPerHour, 0), unit: 'UI/h' },
                  ]
                : null
            }
            status={start ? { label: 'Infusão inicial', text: content.infusionText } : null}
            pending={pending}
          />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField
              label="TTPa atual (relação R)"
              unit={HEPARIN_INPUT_RANGES.ratio.unit}
              range={HEPARIN_INPUT_RANGES.ratio}
              value={state.ratio}
              onValueChange={(raw) => onChange({ ...state, ratio: raw })}
              placeholder="1,5"
              hint="Relação paciente/controle, não o tempo em segundos."
            />
            <NumericField
              label="Dose atual"
              unit={HEPARIN_INPUT_RANGES.currentDose.unit}
              range={HEPARIN_INPUT_RANGES.currentDose}
              value={state.currentDose}
              onValueChange={(raw) => onChange({ ...state, currentDose: raw })}
              placeholder={formatCompact(content.infusionPerKg)}
              hint={`Vazio: ${formatCompact(content.infusionPerKg)} UI/kg/h, a dose inicial.`}
            />
          </div>

          <ProtocolTable
            caption="Nomograma de ajuste por TTPa"
            headers={['TTPa/R', 'Bolus', 'Ajuste']}
            rows={HEPARIN_PROTOCOL.nomogram.map((entry) => ({
              id: entry.id,
              cells: [entry.range, entry.bolusText, entry.actionText],
            }))}
            currentId={row?.id ?? null}
          />

          {adjustment ? (
            <Callout
              tone={adjustment.pauseOneHour ? 'orange' : 'gray'}
              icon={<Drop />}
              title={adjustment.pauseOneHour ? 'TTPa > 3,0' : 'Ajuste'}
            >
              <dl className="flex flex-col gap-1">
                {adjustment.pauseOneHour ? (
                  <Row label="Ação" value="Considere parar a infusão por 1 hora" />
                ) : null}
                <Row
                  label="Bolus adicional"
                  value={
                    adjustment.extraBolusUnits > 0
                      ? `${formatUnits(adjustment.extraBolusUnits)} (${formatDecimal(adjustment.extraBolusMl)} mL)`
                      : '—'
                  }
                />
                <Row
                  label="Nova dose"
                  value={`${formatDecimal(adjustment.newDosePerKg)} UI/kg/h`}
                />
              </dl>
            </Callout>
          ) : null}

          <ResultPair
            tone={status?.tone ?? 'neutral'}
            items={
              adjustment
                ? [
                    { label: 'Velocidade', value: formatDecimal(adjustment.mlh), unit: 'mL/h' },
                    {
                      label: 'Dose',
                      value: formatDecimal(adjustment.unitsPerHour, 0),
                      unit: 'UI/h',
                    },
                  ]
                : null
            }
            status={status ? { label: status.label, text: `faixa ${row?.range ?? ''}` } : null}
            pending={pending}
          />
        </>
      )}

      <DilutionBlock
        preparation={HEPARIN_PROTOCOL.preparation}
        concentration={`${HEPARIN_PROTOCOL.concentration} UI/mL`}
      />

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <CopyToChartButton text={note} />
        <ContentProvenanceNote provenance={HEPARIN_PROTOCOL.provenance} />
      </div>
    </div>
  );
}
