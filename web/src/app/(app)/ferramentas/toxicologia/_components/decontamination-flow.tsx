'use client';

import { useReducer, useState } from 'react';
import { ArrowCounterClockwise, ArrowLeft, Info, WarningCircle } from '@phosphor-icons/react';
import { validateNumber } from '@clinical-tools/ranges';
import {
  activatedCharcoalDose,
  buildDecontaminationChartNote,
  CHARCOAL_NOTE,
  CHARCOAL_RULE_TEXT,
  decontaminationFlowReducer,
  decontaminationProgress,
  decontaminationView,
  DECONTAMINATION_INTRO,
  INITIAL_DECONTAMINATION_FLOW,
  REDUCED_BENEFIT_TEXT,
  TOX_WEIGHT_RANGE,
} from '@clinical-tools/toxicology/decontamination';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Progress } from '@/components/ui/progress';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { toneBg, toneInk } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { FlowOptionButton, PoisonCenterCallButton } from './toxicology-shell';

/** Peso digitado, já validado na faixa do roteiro; `null` enquanto vazio ou inválido. */
function useWeightInput(): [string, (raw: string) => void, number | null] {
  const [raw, setRaw] = useState('');
  const checked = validateNumber(raw, TOX_WEIGHT_RANGE);
  return [raw, setRaw, checked.ok ? checked.value : null];
}

/**
 * Descontaminação GI (CC-323): abertura, 5 passos e o resultado, com a dose
 * de carvão ativado pelo peso quando ele pode ser considerado. A regra mora
 * no reducer do motor.
 */
export function DecontaminationFlow() {
  const [state, dispatch] = useReducer(decontaminationFlowReducer, INITIAL_DECONTAMINATION_FLOW);
  const [rawWeight, setRawWeight, weight] = useWeightInput();
  const view = decontaminationView(state);

  return (
    <div className="flex flex-col gap-5">
      <Progress value={decontaminationProgress(state)} aria-label="Progresso da avaliação" />

      {view.kind === 'intro' ? (
        <section aria-labelledby="descontaminacao-abertura" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="descontaminacao-abertura"
              className="text-xl font-semibold text-balance text-foreground"
            >
              {DECONTAMINATION_INTRO.title}
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground">{DECONTAMINATION_INTRO.text}</p>
          </div>
          <Callout tone="gray" icon={<Info />} title={DECONTAMINATION_INTRO.principle.title}>
            {DECONTAMINATION_INTRO.principle.text}
          </Callout>
          <Callout tone="orange" icon={<WarningCircle />}>
            {DECONTAMINATION_INTRO.caution}
          </Callout>
          <Button
            type="button"
            className="h-12 self-stretch text-base sm:self-start"
            onClick={() => dispatch({ type: 'start' })}
          >
            Iniciar avaliação
          </Button>
        </section>
      ) : null}

      {view.kind === 'question' ? (
        <section aria-labelledby="descontaminacao-passo" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Passo {view.step.id} de 5</p>
            <h2
              id="descontaminacao-passo"
              className="text-xl font-semibold text-balance text-foreground"
            >
              {view.step.question}
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground">{view.step.hint}</p>
          </div>
          <div className="flex flex-col gap-2">
            {view.step.options.map((option) => (
              <FlowOptionButton
                key={option.value}
                onClick={() => dispatch({ type: 'answer', value: option.value })}
              >
                {option.label}
              </FlowOptionButton>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => dispatch({ type: 'back' })}
          >
            <ArrowLeft aria-hidden="true" />
            Passo anterior
          </Button>
        </section>
      ) : null}

      {view.kind === 'result' ? (
        <section aria-label="Resultado" className="flex flex-col gap-4">
          <div
            role="status"
            aria-live="polite"
            data-tone={RESULT_TONE[view.result.tone]}
            className={cn(
              'flex flex-col gap-1 rounded-lg px-4 py-3',
              toneBg[RESULT_TONE[view.result.tone]],
            )}
          >
            <p
              className={cn(
                'text-lg font-semibold',
                view.result.tone === 'neutral'
                  ? 'text-foreground'
                  : toneInk[RESULT_TONE[view.result.tone]],
              )}
            >
              {view.result.title}
            </p>
            <p
              className={cn(
                'text-[0.9375rem]',
                view.result.tone === 'neutral'
                  ? 'text-foreground'
                  : toneInk[RESULT_TONE[view.result.tone]],
              )}
            >
              {view.reducedBenefit ? REDUCED_BENEFIT_TEXT : view.result.text}
            </p>
          </div>

          {view.result.id === 'indicado' ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
              <h3 className="text-base font-semibold text-foreground">Dose de carvão ativado</h3>
              <NumericField
                label="Peso do paciente"
                unit={TOX_WEIGHT_RANGE.unit}
                range={TOX_WEIGHT_RANGE}
                value={rawWeight}
                onValueChange={setRawWeight}
                placeholder="70"
              />
              <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
                {weight === null ? (
                  <p className="text-sm text-muted-foreground">
                    Informe o peso para calcular a dose ({CHARCOAL_RULE_TEXT}).
                  </p>
                ) : (
                  <>
                    <p className="text-3xl font-semibold text-foreground tabular-nums">
                      {activatedCharcoalDose(weight)} g
                    </p>
                    <p className="text-sm text-muted-foreground">{CHARCOAL_RULE_TEXT}</p>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{CHARCOAL_NOTE}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-start gap-2">
            <PoisonCenterCallButton />
            <CopyToChartButton text={buildDecontaminationChartNote(state, weight)} />
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'back' })}>
              <ArrowLeft aria-hidden="true" />
              Passo anterior
            </Button>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'restart' })}>
              <ArrowCounterClockwise aria-hidden="true" />
              Recomeçar avaliação
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
