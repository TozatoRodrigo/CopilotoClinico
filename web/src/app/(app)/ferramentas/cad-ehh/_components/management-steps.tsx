'use client';

import {
  DEXTROSE_TRIGGER,
  DEXTROSE_VEHICLE_NOTE,
  DISPOSITION,
  DKA_HHS_OVERLAP,
  EUGLYCEMIC_DKA,
  FLUID_PREFERENCE,
  HHS_LIMITS,
  HHS_SODIUM_ALERT,
  HHS_SPEEDS,
  HHS_VOLUME_DEFICIT,
  INITIAL_FLUID,
  MAINTENANCE_FLUID,
  OVERLOAD_ALERT,
  PHOSPHATE,
  POST_EXPANSION_REASSESSMENT,
  SEVERITY_NOTE,
  SEVERITY_TABLE,
  TRACK_OPTIONS,
  UNITS_NOTE,
  VOLEMIC_STATES,
  type DkaSeverity,
} from '@clinical-tools/cad-ehh/content';
import { isHhsTrack } from '@clinical-tools/cad-ehh/roteiro';
import {
  MAINTENANCE_AFTER_LABS,
  MISSING,
  NO_SEVERITY,
  SEVERITY_TONE,
} from '@clinical-tools/cad-ehh/screen-text';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import { formatDecimal } from '@clinical-tools/numbers';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { KetonuriaAlert } from './first-hour';
import { BigValue, Block, BulletList, ChoiceButtons, Hint, Paragraphs, ToneCallout } from './parts';
import type { CadEhhScreenProps } from './step-props';

/** Alertas do EHH (e do misto): velocidades, sódio que sobe e déficit de volume. */
function HhsFluidAlerts({ guidance, weight }: Pick<CadEhhScreenProps, 'guidance' | 'weight'>) {
  const deficit = guidance.hhsVolumeDeficit;
  return (
    <>
      <ToneCallout tone="critical" title="EHH — velocidades de correção">
        <div className="flex flex-col gap-2">
          <Paragraphs texts={HHS_SPEEDS} />
          <BulletList items={HHS_LIMITS} />
        </div>
      </ToneCallout>
      <ToneCallout tone="attention" title="Elevação inicial do sódio">
        {stripSourceTags(HHS_SODIUM_ALERT)}
      </ToneCallout>
      <Block title="EHH — estimativa do déficit de volume">
        <Paragraphs texts={HHS_VOLUME_DEFICIT} />
        {deficit && weight !== null ? (
          <BigValue
            label={`Para ${formatDecimal(weight, 0)} kg`}
            value={`${formatDecimal(deficit.min, 1)} a ${formatDecimal(deficit.max, 1)}`}
            unit="L"
          />
        ) : (
          <Hint>{MISSING.weightForDeficit}</Hint>
        )}
      </Block>
    </>
  );
}

/**
 * Passos 2 e 5 — fluidos. Na primeira hora (fase A) o estado volêmico define
 * o ritmo; depois dos exames (fase B) o sódio corrigido escolhe o soro.
 */
export function FluidsStep({
  phase,
  state,
  dispatch,
  guidance,
  weight,
}: CadEhhScreenProps & { phase: 'inicial' | 'manutencao' }) {
  const chosen = VOLEMIC_STATES.find(({ id }) => id === state.volemicState);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Paragraphs texts={INITIAL_FLUID} />
        <p className="text-[0.9375rem] font-medium text-foreground">{FLUID_PREFERENCE}</p>
      </div>

      {phase === 'inicial' ? (
        <>
          <Block title="Fase A — estado volêmico">
            <ChoiceButtons
              label="Estado volêmico"
              options={VOLEMIC_STATES.map(({ id, label }) => ({ id, label }))}
              value={state.volemicState}
              onChoose={(id) => dispatch({ type: 'estado-volemico', id })}
              columns={1}
            />
            {chosen ? (
              <ToneCallout tone="neutral" title={chosen.label}>
                <div className="flex flex-col gap-1.5">
                  <p>{chosen.conduct}</p>
                  {chosen.extra ? (
                    <p className={cn('font-medium', toneText.orange)}>
                      {stripSourceTags(chosen.extra)}
                    </p>
                  ) : null}
                </div>
              </ToneCallout>
            ) : null}
          </Block>
          <ToneCallout tone="attention" title="Populações de risco">
            {stripSourceTags(OVERLOAD_ALERT)}
          </ToneCallout>
          <Hint>{MAINTENANCE_AFTER_LABS}</Hint>
        </>
      ) : (
        <>
          <Block title="Reavaliação após a expansão">
            <Paragraphs texts={POST_EXPANSION_REASSESSMENT} />
          </Block>
          <Block title="Fase B — manutenção pelo sódio corrigido">
            {guidance.correctedNa !== null && guidance.maintenance !== null ? (
              <ToneCallout
                tone="neutral"
                title={`Sódio corrigido: ${formatDecimal(guidance.correctedNa, 1)} mEq/L`}
              >
                <p className="font-medium">{MAINTENANCE_FLUID[guidance.maintenance]}</p>
              </ToneCallout>
            ) : (
              <Hint>{MISSING.phaseB}</Hint>
            )}
          </Block>
          <Block title="Gatilho da dextrose">
            <Paragraphs texts={DEXTROSE_TRIGGER} />
            <Hint>{DEXTROSE_VEHICLE_NOTE}</Hint>
          </Block>
        </>
      )}

      {isHhsTrack(state.track) ? <HhsFluidAlerts guidance={guidance} weight={weight} /> : null}
    </div>
  );
}

const SEVERITY_COLUMNS: readonly { id: DkaSeverity; label: string }[] = [
  { id: 'leve', label: 'Leve' },
  { id: 'moderada', label: 'Moder.' },
  { id: 'grave', label: 'Grave' },
];

/** Passo 4 — Classificar: trilha, gravidade e onde internar. */
export function ClassifyStep({ state, dispatch, guidance }: CadEhhScreenProps) {
  const { severity } = guidance;
  return (
    <div className="flex flex-col gap-5">
      {/* Duplicado do passo 1: quem entra direto pela avaliação não passou por lá (ANY). */}
      {guidance.glucoseBelow200 ? (
        <ToneCallout tone="critical" title="Glicemia abaixo de 200 — atenção">
          <Paragraphs texts={EUGLYCEMIC_DKA.slice(0, 3)} />
        </ToneCallout>
      ) : null}

      <Block title="Trilha">
        <ChoiceButtons
          label="Trilha"
          options={TRACK_OPTIONS}
          value={state.track}
          onChoose={(track) => dispatch({ type: 'trilha', track })}
        />
        <Paragraphs texts={DKA_HHS_OVERLAP} />
      </Block>

      {state.ketonuria !== null ? <KetonuriaAlert /> : null}

      <Block title="Gravidade">
        {severity ? (
          <ToneCallout tone={SEVERITY_TONE[severity]} title={`CAD ${severity}`}>
            <p className="text-base font-semibold">{DISPOSITION[severity]}</p>
          </ToneCallout>
        ) : (
          <p className={cn('text-[0.9375rem] font-medium text-pretty', toneText.orange)}>
            {NO_SEVERITY}
          </p>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-[0.8125rem]">
            <caption className="sr-only">Critérios de gravidade da CAD</caption>
            <thead className="bg-surface-subtle text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">Critério</span>
                </th>
                {SEVERITY_COLUMNS.map(({ id, label }) => (
                  <th
                    key={id}
                    scope="col"
                    aria-current={severity === id ? 'true' : undefined}
                    className={cn(
                      'px-2 py-2 font-medium',
                      severity === id && 'bg-tone-blue-bg text-tone-blue-ink',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEVERITY_TABLE.map(({ row, cells }) => (
                <tr key={row} className="border-t border-border align-top">
                  <th scope="row" className="px-2 py-2 text-left font-medium text-muted-foreground">
                    {row}
                  </th>
                  {SEVERITY_COLUMNS.map(({ id }) => (
                    <td
                      key={id}
                      className={cn(
                        'px-2 py-2 text-foreground',
                        severity === id && 'bg-tone-blue-bg font-semibold text-tone-blue-ink',
                      )}
                    >
                      {cells[id]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[0.9375rem] text-pretty text-foreground">
          {stripSourceTags(SEVERITY_NOTE)}
        </p>
        <Hint>{stripSourceTags(UNITS_NOTE)}</Hint>
      </Block>
    </div>
  );
}

/** Passo 8 — Fosfato: raramente indicado. */
export function PhosphateStep() {
  return <Paragraphs texts={PHOSPHATE} />;
}
