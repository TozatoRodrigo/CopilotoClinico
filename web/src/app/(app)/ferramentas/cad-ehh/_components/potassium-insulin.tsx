'use client';

import { useMemo } from 'react';
import { ArrowRight, LockSimple } from '@phosphor-icons/react';
import {
  BASAL_INSULIN,
  INSULIN_AFTER_REDUCTION,
  INSULIN_BLOCKED,
  INSULIN_DOSES,
  INSULIN_GATE_EMPTY,
  INSULIN_PREPARATION,
  INSULIN_PRIMING,
  INSULIN_PRIMING_NOTE,
  INSULIN_PUMP_RUNNING,
  INSULIN_RATES,
  INSULIN_TEXTS,
  INSULIN_TEXTS_HHS,
  KCL_MONITORING,
  KCL_OSMOTIC_EFFECT,
  KCL_PRESENTATIONS,
  KCL_ROUTES,
  KCL_SPEED,
  LOW_POTASSIUM_ALERT,
  POTASSIUM_BANDS,
  POTASSIUM_INTRO,
  POTASSIUM_MONITORING,
  RENAL_FUNCTION_GATE,
  UNITS_NOTE,
} from '@clinical-tools/cad-ehh/content';
import { isHhsTrack, KCL_FIELD_RANGES, readKcl } from '@clinical-tools/cad-ehh/roteiro';
import {
  INSULIN_LOCKED_REASON,
  KCL_FINAL_VOLUME_NOTE,
  MISSING,
  insulinRateText,
  kclExceedsText,
  kclMirrorNote,
  kclPrescriptionLines,
} from '@clinical-tools/cad-ehh/screen-text';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import { formatDecimal } from '@clinical-tools/numbers';
import { describeRange } from '@clinical-tools/ranges';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/utils';
import {
  BigValue,
  Block,
  ChoiceButtons,
  Hint,
  LabInput,
  Paragraphs,
  SimpleTable,
  ToneCallout,
} from './parts';
import type { CadEhhScreenProps } from './step-props';

/** Calculadora de preparo do KCl: mL ↔ mEq, volume da bolsa e velocidade. */
function KclCalculator({ state, dispatch }: Pick<CadEhhScreenProps, 'state' | 'dispatch'>) {
  const reading = useMemo(() => readKcl(state.kcl), [state.kcl]);
  const lines = kclPrescriptionLines(reading);
  const { result } = reading;
  return (
    <Block title="Calculadora de preparo">
      <ChoiceButtons
        label="Apresentação do KCl"
        options={KCL_PRESENTATIONS.map(({ id, label }) => ({ id, label }))}
        value={state.kcl.presentation}
        onChoose={(id) => dispatch({ type: 'kcl-apresentacao', id })}
        columns={2}
      />
      <ChoiceButtons
        label="Via de acesso"
        options={KCL_ROUTES.map(({ id, label }) => ({ id, label }))}
        value={state.kcl.route}
        onChoose={(id) => dispatch({ type: 'kcl-via', id })}
        columns={2}
      />
      <div className="grid grid-cols-2 gap-3">
        <LabInput
          label="KCl a aspirar"
          unit="mL"
          range={KCL_FIELD_RANGES.ml}
          value={state.kcl.mlRaw}
          onChange={(raw) => dispatch({ type: 'kcl-ml', raw })}
          placeholder="15"
        />
        <LabInput
          label="Equivale a"
          unit="mEq"
          range={KCL_FIELD_RANGES.mEq}
          value={state.kcl.mEqRaw}
          onChange={(raw) => dispatch({ type: 'kcl-meq', raw })}
          placeholder="20"
        />
      </div>
      <Hint>{kclMirrorNote(reading.presentation.label, formatDecimal(reading.mEqPerMl, 2))}</Hint>
      <div className="grid grid-cols-2 gap-3">
        <LabInput
          label="Volume final da bolsa"
          unit="mL"
          range={KCL_FIELD_RANGES.volume}
          value={state.kcl.volumeRaw}
          onChange={(raw) => dispatch({ type: 'kcl-volume', raw })}
          placeholder={result ? String(result.preparation.minimumVolumeMl) : '400'}
          hint={`Vazio: o mínimo da via. Faixa aceita: ${describeRange(KCL_FIELD_RANGES.volume)}.`}
        />
        <LabInput
          label="Velocidade"
          unit="mEq/h"
          range={KCL_FIELD_RANGES.rate}
          value={state.kcl.rateRaw}
          onChange={(raw) => dispatch({ type: 'kcl-velocidade', raw })}
          placeholder="10"
        />
      </div>

      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {result ? (
          <>
            <div className="flex flex-col gap-1 rounded-md border-l-[3px] border-primary bg-surface-subtle px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Prescrição</span>
              <dl className="flex flex-col gap-1">
                {lines.map((line, index) => (
                  <div
                    key={line.label}
                    className={cn(
                      'flex items-baseline justify-between gap-3',
                      index === 4 && 'mt-1 border-t border-border pt-2',
                    )}
                  >
                    <dt className="text-sm text-muted-foreground">{line.label}</dt>
                    <dd
                      className={cn(
                        'text-right tabular-nums',
                        line.strong ? 'text-base font-semibold' : 'text-sm font-medium',
                        line.alert ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <Hint>{KCL_FINAL_VOLUME_NOTE}</Hint>
          </>
        ) : null}
        {result?.preparation.exceedsLimit ? (
          <ToneCallout tone="critical" title="Concentração acima do limite da via">
            {kclExceedsText(
              result.preparation.resultingConcentration,
              reading.route.maxMEqPerLiter,
              reading.route.label,
              result.preparation.minimumVolumeMl,
            )}
          </ToneCallout>
        ) : null}
        {reading.osmoticAlert ? (
          <ToneCallout tone="attention" title="Efeito osmótico do potássio">
            <Paragraphs texts={KCL_OSMOTIC_EFFECT} />
          </ToneCallout>
        ) : null}
      </div>
    </Block>
  );
}

/** Passo 6 — Potássio: vem antes da insulina e a libera. */
export function PotassiumStep({ state, dispatch, guidance }: CadEhhScreenProps) {
  const band = guidance.potassiumBand;
  const activeRow = band ? POTASSIUM_BANDS.findIndex(({ id }) => id === band) : null;
  return (
    <div className="flex flex-col gap-5">
      <Disclosure title="Por que o potássio vem antes">
        <Paragraphs texts={POTASSIUM_INTRO} />
      </Disclosure>
      <ToneCallout tone="attention" title="Antes de repor — função renal">
        {stripSourceTags(RENAL_FUNCTION_GATE)}
      </ToneCallout>

      <Block title="Conduta por faixa">
        <SimpleTable
          caption="Conduta por faixa de potássio"
          head={['Potássio', 'Conduta']}
          rows={POTASSIUM_BANDS.map(({ range, conduct }) => [range, conduct])}
          activeRow={activeRow}
        />
        {band === null ? <Hint>Informe o potássio no passo 3 para destacar a faixa.</Hint> : null}
      </Block>
      {band === 'baixo' ? (
        <ToneCallout tone="critical" title="Potássio abaixo de 3,5 mEq/L">
          <Paragraphs texts={LOW_POTASSIUM_ALERT} />
        </ToneCallout>
      ) : null}

      <div className="flex flex-col gap-1">
        <Disclosure title="Monitorização do potássio">
          <Paragraphs texts={POTASSIUM_MONITORING} />
        </Disclosure>
        <Disclosure title="Preparo e administração">
          <div className="flex flex-col gap-3">
            <SimpleTable
              caption="Apresentações de KCl"
              head={['Apresentação', 'Conteúdo por ampola de 10 mL']}
              rows={KCL_PRESENTATIONS.map(({ label, description }) => [label, description])}
            />
            <SimpleTable
              caption="Concentração máxima por via"
              head={['Via', 'Concentração máxima']}
              rows={KCL_ROUTES.map(({ label, maxMEqPerLiter }) => [
                label,
                `${maxMEqPerLiter} mEq/L`,
              ])}
            />
            <Paragraphs texts={KCL_SPEED} />
            <p className="text-[0.9375rem] font-medium text-foreground">{KCL_MONITORING}</p>
          </div>
        </Disclosure>
      </div>

      <KclCalculator state={state} dispatch={dispatch} />
      <Hint>{stripSourceTags(UNITS_NOTE)}</Hint>
    </div>
  );
}

/**
 * Passo 7 — Insulina: travada até o potássio ser informado (critério de
 * aceite do CC-326). Com potássio < 3,5 abre com o alerta de bloqueio, como
 * no ANY.
 */
export function InsulinStep({
  state,
  dispatch,
  guidance,
  weightRaw,
  onWeightChange,
  go,
}: CadEhhScreenProps) {
  if (guidance.insulinGate === 'sem-potassio') {
    return (
      <div className="flex flex-col gap-4" data-insulin-gate="sem-potassio">
        <ToneCallout tone="attention" title="Seção travada" icon={<LockSimple />}>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium">{INSULIN_GATE_EMPTY}</p>
            <p>{INSULIN_LOCKED_REASON}</p>
          </div>
        </ToneCallout>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 self-start"
          onClick={() => go('h3')}
        >
          Informar o potássio (passo 3)
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const rate = guidance.insulinRate;
  const rateText = rate !== null ? insulinRateText(rate) : null;
  return (
    <div className="flex flex-col gap-5" data-insulin-gate={guidance.insulinGate}>
      {guidance.insulinGate === 'bloqueada' ? (
        <ToneCallout tone="critical" title="Insulina bloqueada" icon={<LockSimple />}>
          {stripSourceTags(INSULIN_BLOCKED)}
        </ToneCallout>
      ) : null}

      <p className="text-[0.9375rem] text-pretty text-foreground">{INSULIN_PREPARATION}</p>
      <ToneCallout tone="attention" title="Purga do equipo">
        <div className="flex flex-col gap-2">
          <Paragraphs texts={INSULIN_PRIMING} />
          <p className="font-semibold">{INSULIN_PRIMING_NOTE}</p>
        </div>
      </ToneCallout>

      <Disclosure title="Dose por trilha e referências">
        <div className="flex flex-col gap-3">
          <SimpleTable
            caption="Velocidade da insulina por situação"
            head={['Situação', 'Velocidade']}
            rows={INSULIN_DOSES.map(({ situation, speed }) => [situation, speed])}
          />
          <Paragraphs texts={INSULIN_TEXTS} />
          {isHhsTrack(state.track) ? <Paragraphs texts={INSULIN_TEXTS_HHS} /> : null}
          <Paragraphs texts={[INSULIN_AFTER_REDUCTION]} />
        </div>
      </Disclosure>

      <ToneCallout tone="attention" title="Enquanto a bomba estiver ativa">
        <Paragraphs texts={INSULIN_PUMP_RUNNING} />
      </ToneCallout>

      <Block title="Calculadora de velocidade">
        <ChoiceButtons
          label="Velocidade da insulina"
          options={INSULIN_RATES.map((id) => ({ id, label: `${formatDecimal(id, 2)} U/kg/h` }))}
          value={state.insulinRate}
          onChoose={(insulinRate) => dispatch({ type: 'taxa-insulina', rate: insulinRate })}
          columns={2}
        />
        <WeightField population="adulto" value={weightRaw} onValueChange={onWeightChange} />
        <div role="status" aria-live="polite">
          {rateText ? (
            <div className="grid grid-cols-2 gap-3">
              <BigValue
                label="Insulina"
                value={rateText.unitsPerHour.replace(' U/h', '')}
                unit="U/h"
              />
              <BigValue
                label="Velocidade (1 U/mL)"
                value={rateText.mlPerHour.replace(' mL/h', '')}
                unit="mL/h"
              />
            </div>
          ) : (
            <Hint>{MISSING.weightForInsulin}</Hint>
          )}
        </div>
      </Block>

      <Disclosure title="Insulina basal durante a infusão">
        <Paragraphs texts={BASAL_INSULIN} />
      </Disclosure>
      <Hint>{stripSourceTags(UNITS_NOTE)}</Hint>
    </div>
  );
}
