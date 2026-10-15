'use client';

import { useState } from 'react';
import { Minus, Plus, Syringe } from '@phosphor-icons/react';
import { buildInfusionNote } from '@clinical-tools/infusions/chart-note';
import {
  doseInputRange,
  doseSettings,
  evaluateInfusion,
  formatConcentration,
  formatDose,
  formatPatientBolus,
  formatRate,
  mlhToDose,
  patientBolus,
  rateInputRange,
  sliderValue,
  stepDose,
} from '@clinical-tools/infusions/dose';
import type { InfusionDrug } from '@clinical-tools/infusions/drugs';
import { validateNumber } from '@clinical-tools/ranges';
import { ChoiceGroup, type ChoiceOption } from '@/components/domain/clinical-tools/choice-group';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useCustomDilution } from '@/lib/custom-dilutions';
import { toneBg, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { CustomDilutionForm } from './custom-dilution-form';
import { resolveDilution, type DilutionChoice, type DrugScreenState } from './infusion-state';

interface Editing {
  field: 'dose' | 'mlh';
  raw: string;
  /** Contexto em que o texto foi digitado; mudou modo, diluição ou peso, ele some. */
  context: string;
}

/** Valor das opções de diluição no grupo de rádio. */
function choiceValue(choice: DilutionChoice): string {
  return choice.kind === 'lista' ? `lista:${choice.concentration}` : choice.kind;
}

export interface DrugPanelProps {
  drug: InfusionDrug;
  state: DrugScreenState;
  onChange: (next: DrugScreenState) => void;
  /** Peso validado; `null` enquanto vazio ou fora da faixa. */
  weightKg: number | null;
}

/**
 * Calculadora de uma droga (CC-311): modo por indicação, dose ↔ mL/h nos dois
 * sentidos com a cor da dose, bolus do modo e a diluição (padrão, alternativas
 * do ANY e a minha). No celular o resultado vem logo depois do modo; a
 * concentração em uso aparece junto dele. Montado com `key={drug.id}`.
 */
export function DrugPanel({ drug, state, onChange, weightKg }: DrugPanelProps) {
  const custom = useCustomDilution(drug);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const settings = doseSettings(drug, state.modeId);
  const dilution = resolveDilution(drug, state.dilution, custom.saved);
  const { concentration } = dilution;
  const context = `${settings.mode?.id ?? ''}|${concentration}|${weightKg ?? ''}`;
  const active = editing?.context === context ? editing : null;

  const doseRange = doseInputRange(drug, settings);
  const canCompute = !drug.usesWeight || weightKg !== null;
  const rateRange = canCompute
    ? rateInputRange(drug, settings, weightKg ?? 0, concentration)
    : null;
  const evaluation = evaluateInfusion(drug, settings, {
    dose: state.dose,
    concentration,
    weightKg,
  });
  const typedInvalid =
    active !== null &&
    !validateNumber(active.raw, active.field === 'dose' ? doseRange : (rateRange ?? doseRange)).ok;
  const ready = evaluation.status === 'ready' && !typedInvalid ? evaluation : null;

  const bolus = settings.bolus && weightKg !== null ? patientBolus(settings.bolus, weightKg) : null;
  const bolusText = bolus ? formatPatientBolus(bolus) : null;
  const tone = ready ? RESULT_TONE[ready.detail.tone] : 'gray';

  function setDose(dose: number) {
    setEditing(null);
    onChange({ ...state, dose });
  }

  function typeDose(raw: string) {
    setEditing({ field: 'dose', raw, context });
    const checked = validateNumber(raw, doseRange);
    if (checked.ok) onChange({ ...state, dose: checked.value });
  }

  function typeRate(raw: string) {
    if (!rateRange) return;
    setEditing({ field: 'mlh', raw, context });
    const checked = validateNumber(raw, rateRange);
    if (checked.ok) {
      onChange({
        ...state,
        dose: mlhToDose(checked.value, weightKg ?? 0, concentration, drug.factor, drug.usesWeight),
      });
    }
  }

  const modeOptions: ChoiceOption<string>[] =
    drug.modes && drug.modes.length > 1
      ? drug.modes.map(({ id, label }) => ({ value: id, label }))
      : [];

  // Diluições oferecidas: as do ANY, a salva no aparelho e a aplicada "só desta vez".
  const dilutionChoices: { choice: DilutionChoice; label: string }[] = [
    ...(drug.dilutions ?? [{ label: 'Padrão', concentration: drug.concentration }]).map(
      ({ label, concentration: value }) => ({
        choice: { kind: 'lista', concentration: value } as const,
        label,
      }),
    ),
    ...(custom.saved
      ? [
          {
            choice: { kind: 'minha' } as const,
            label: `Minha diluição (${formatConcentration(custom.saved.concentration)} ${drug.concentrationUnit})`,
          },
        ]
      : []),
    ...(state.dilution.kind === 'desta-vez' && dilution.kind === 'desta-vez'
      ? [
          {
            choice: state.dilution,
            label: `Só desta vez (${formatConcentration(concentration)} ${drug.concentrationUnit})`,
          },
        ]
      : []),
  ];
  const selectedChoice =
    dilution.kind === 'padrao'
      ? choiceValue({ kind: 'lista', concentration: drug.concentration })
      : choiceValue(state.dilution);

  const note = ready
    ? buildInfusionNote({
        drug,
        settings,
        dose: ready.dose,
        mlh: ready.mlh,
        detail: ready.detail,
        weightKg,
        dilution: dilution.description,
        concentration,
        patientBolus: bolusText,
      })
    : null;

  return (
    <div className="flex flex-col gap-5">
      {modeOptions.length > 0 ? (
        <ChoiceGroup
          label="Indicação"
          options={modeOptions}
          value={settings.mode?.id ?? null}
          onChange={(modeId) => {
            setEditing(null);
            onChange({ ...state, modeId, dose: doseSettings(drug, modeId).defaultDose });
          }}
        />
      ) : null}

      <section aria-label="Dose" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">
            Faixa terapêutica
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {settings.rangeLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={`Diminuir ${formatDose(settings.step, settings)} ${drug.doseUnit}`}
            onClick={() => setDose(stepDose(state.dose, settings, -1))}
          >
            <Minus aria-hidden="true" />
          </Button>
          <input
            type="range"
            min={settings.min}
            max={settings.max}
            step={settings.step}
            value={sliderValue(state.dose, settings)}
            onChange={(event) => setDose(Number(event.target.value))}
            aria-label={`Ajustar a dose (${drug.doseUnit})`}
            aria-valuetext={`${formatDose(state.dose, settings)} ${drug.doseUnit}`}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-primary focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={`Aumentar ${formatDose(settings.step, settings)} ${drug.doseUnit}`}
            onClick={() => setDose(stepDose(state.dose, settings, 1))}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>

        <div
          data-slot="infusion-result"
          data-tone={tone}
          className={cn('flex flex-col gap-3 rounded-lg px-3 py-3', toneBg[tone])}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {rateRange ? (
              <NumericField
                id={`velocidade-${drug.id}`}
                label="Velocidade"
                unit="mL/h"
                range={rateRange}
                value={active?.field === 'mlh' ? active.raw : ready ? formatRate(ready.mlh) : ''}
                onValueChange={typeRate}
                hint=""
                inputClassName="h-12 text-xl font-semibold max-sm:h-12 md:text-xl"
              />
            ) : null}
            <NumericField
              id={`dose-${drug.id}`}
              label="Dose"
              unit={drug.doseUnit}
              range={doseRange}
              value={active?.field === 'dose' ? active.raw : formatDose(state.dose, settings)}
              onValueChange={typeDose}
              hint=""
              inputClassName="h-12 text-xl font-semibold max-sm:h-12 md:text-xl"
            />
          </div>
          <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
            {ready ? (
              <>
                <span className={cn('rounded-[3px] px-1.5 py-0.5 font-medium', toneTag[tone])}>
                  {ready.detail.label}
                </span>
                <span className="text-foreground tabular-nums">
                  {formatDose(ready.dose, settings)} {drug.doseUnit} = {formatRate(ready.mlh)} mL/h
                  {' · '}
                  {formatConcentration(concentration)} {drug.concentrationUnit}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {evaluation.status === 'needs-weight'
                  ? 'Informe o peso do paciente para ver o mL/h.'
                  : 'Corrija o campo destacado para ver o resultado.'}
              </span>
            )}
          </p>
        </div>
      </section>

      {settings.bolus ? (
        <Callout tone="orange" icon={<Syringe />} title={settings.bolus.title}>
          <dl className="flex flex-col gap-1">
            {settings.bolus.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt>{row.label}</dt>
                <dd className="text-right font-medium">{row.value}</dd>
              </div>
            ))}
            {bolusText ? (
              <div className="flex justify-between gap-3 border-t border-current/15 pt-1">
                <dt>Este paciente</dt>
                <dd className="text-right font-semibold tabular-nums">{bolusText}</dd>
              </div>
            ) : null}
          </dl>
        </Callout>
      ) : null}

      <section aria-label="Diluição" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">Diluição</span>
            {dilution.kind === 'minha' ? <Badge variant="blue">Minha diluição</Badge> : null}
            {dilution.kind === 'desta-vez' ? <Badge variant="gray">Só desta vez</Badge> : null}
          </div>
          <p className="text-sm text-foreground">{dilution.description}</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatConcentration(concentration)} {drug.concentrationUnit}
          </p>
        </div>

        {dilutionChoices.length > 1 ? (
          <ChoiceGroup
            label="Concentração em uso"
            options={dilutionChoices.map(({ choice, label }) => ({
              value: choiceValue(choice),
              label,
            }))}
            value={selectedChoice}
            onChange={(value) => {
              const picked = dilutionChoices.find(({ choice }) => choiceValue(choice) === value);
              if (picked) onChange({ ...state, dilution: picked.choice });
            }}
          />
        ) : null}

        {drug.ampoule ? (
          formOpen ? (
            <CustomDilutionForm
              drug={drug}
              initial={custom.saved}
              onApply={(applied) =>
                onChange({
                  ...state,
                  dilution: {
                    kind: 'desta-vez',
                    ampoules: applied.ampoules,
                    volume: applied.volume,
                  },
                })
              }
              onSave={(saved) => {
                custom.save(saved);
                onChange({ ...state, dilution: { kind: 'minha' } });
              }}
              onClose={() => setFormOpen(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                {custom.saved ? 'Editar minha diluição' : 'Usar a diluição do meu serviço'}
              </Button>
              {custom.saved ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    custom.clear();
                    onChange({
                      ...state,
                      dilution: { kind: 'lista', concentration: drug.concentration },
                    });
                  }}
                >
                  Apagar minha diluição
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <CopyToChartButton text={note} />
        <ContentProvenanceNote provenance={drug.provenance} />
      </div>
    </div>
  );
}
