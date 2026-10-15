'use client';

import { ArrowLeft } from '@phosphor-icons/react';
import { PERC_RULE } from '@clinical-tools/calculators/perc-rule';
import { DIAGNOSIS } from '@clinical-tools/tep/content';
import { D_DIMER_AGE_ADJUSTED, YEARS, YEARS_PREGNANCY } from '@clinical-tools/tep/d-dimer';
import {
  diagnosisActionFor,
  showsDDimer,
  showsPerc,
  type DiagnosisCalculator,
  type TepPathwayState,
} from '@clinical-tools/tep/pathway';
import { WELLS_TEP } from '@clinical-tools/tep/wells';
import type { CalculatorDefinition } from '@clinical-tools/calculator';
import { ChoiceGroup } from '@/components/domain/clinical-tools/choice-group';
import { InlineCalculator } from '@/components/domain/clinical-tools/inline-calculator';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Notice, StepHeader } from './tep-parts';
import type { TepDispatch } from './tep-state';

/** Calculadora recolhível que move o roteiro quando completa (Wells, PERC, D-dímero, YEARS). */
function CalculatorToggle({
  title,
  hint,
  definition,
  calculator,
  dispatch,
}: {
  title: string;
  hint?: string;
  definition: CalculatorDefinition;
  calculator: DiagnosisCalculator;
  dispatch: TepDispatch;
}) {
  return (
    <Disclosure title={title} triggerClassName="min-h-11">
      <InlineCalculator
        definition={definition}
        hint={hint}
        onComplete={(evaluation) => dispatch(diagnosisActionFor(calculator, evaluation))}
      />
    </Disclosure>
  );
}

/** Passo 2: investigação diagnóstica (Wells → PERC → D-dímero, ou YEARS na gestante). */
export function DiagnosisStep({
  state,
  dispatch,
  headingRef,
}: {
  state: TepPathwayState;
  dispatch: TepDispatch;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const { diagnosis } = state;
  const { low, dDimer, pregnant } = DIAGNOSIS;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step="diagnostico" title={DIAGNOSIS.title} headingRef={headingRef} />
      <Notice notice={DIAGNOSIS.anticoagulated} />

      <ChoiceGroup
        label="Gestação"
        options={[
          { value: 'nao-gestante', label: DIAGNOSIS.pregnancy.notPregnant },
          { value: 'gestante', label: DIAGNOSIS.pregnancy.pregnant },
        ]}
        value={diagnosis.pregnant ? 'gestante' : 'nao-gestante'}
        onChange={(value) => dispatch({ type: 'gestante', pregnant: value === 'gestante' })}
      />

      {diagnosis.pregnant ? (
        <section aria-label="Gestante" className="flex flex-col gap-4">
          <Notice notice={pregnant.notice} />
          <ChoiceGroup
            label={pregnant.question}
            options={pregnant.options}
            value={diagnosis.yearsPregnancy}
            onChange={(result) => dispatch({ type: 'years-gestante', result })}
          />
          <Disclosure title={pregnant.calculate} triggerClassName="min-h-11">
            <div className="flex flex-col gap-3">
              <InlineCalculator
                definition={YEARS_PREGNANCY}
                hint={pregnant.calculateHint}
                onComplete={(evaluation) =>
                  dispatch(diagnosisActionFor('yearsPregnancy', evaluation))
                }
              />
              <p className="text-[0.8125rem] text-pretty text-muted-foreground">
                {pregnant.ultrasound}
              </p>
            </div>
          </Disclosure>
          <div aria-live="polite">
            {diagnosis.yearsPregnancy === 'negativo' ? <Notice notice={pregnant.negative} /> : null}
            {diagnosis.yearsPregnancy === 'positivo' ? <Notice notice={pregnant.positive} /> : null}
          </div>
        </section>
      ) : (
        <section aria-label="Não gestante" className="flex flex-col gap-4">
          <ChoiceGroup
            label={DIAGNOSIS.wells.question}
            options={DIAGNOSIS.wells.options}
            value={diagnosis.wells}
            onChange={(level) => dispatch({ type: 'wells', level })}
          />
          <CalculatorToggle
            title={DIAGNOSIS.wells.calculate}
            definition={WELLS_TEP}
            calculator="wells"
            dispatch={dispatch}
          />

          {diagnosis.wells === 'baixa' ? <Notice notice={low.notice} /> : null}
          {diagnosis.wells === 'intermediaria' ? (
            <Notice notice={DIAGNOSIS.moderate.notice} />
          ) : null}

          {showsPerc(diagnosis) ? (
            <div className="flex flex-col gap-3">
              <ChoiceGroup
                label={low.percQuestion}
                options={low.percOptions}
                value={diagnosis.perc}
                onChange={(result) => dispatch({ type: 'perc', result })}
              />
              <CalculatorToggle
                title={low.calculate}
                hint={low.calculateHint}
                definition={PERC_RULE}
                calculator="perc"
                dispatch={dispatch}
              />
              <div aria-live="polite">
                {diagnosis.perc === 'negativo' ? <Notice notice={low.percNegative} /> : null}
                {diagnosis.perc === 'positivo' ? <Notice notice={low.percPositive} /> : null}
              </div>
            </div>
          ) : null}

          {showsDDimer(diagnosis) ? (
            <div className="flex flex-col gap-3">
              <ChoiceGroup
                label={dDimer.question}
                options={dDimer.options}
                value={diagnosis.dDimer}
                onChange={(result) => dispatch({ type: 'd-dimero', result })}
              />
              <CalculatorToggle
                title={dDimer.calculateAge}
                hint={dDimer.calculateAgeHint}
                definition={D_DIMER_AGE_ADJUSTED}
                calculator="dDimer"
                dispatch={dispatch}
              />
              <CalculatorToggle
                title={dDimer.calculateYears}
                hint={dDimer.calculateYearsHint}
                definition={YEARS}
                calculator="years"
                dispatch={dispatch}
              />
              <div aria-live="polite">
                {diagnosis.dDimer === 'negativo' ? <Notice notice={dDimer.negative} /> : null}
                {diagnosis.dDimer === 'positivo' ? <Notice notice={dDimer.positive} /> : null}
              </div>
              <Notice notice={dDimer.imagingDelay} />
            </div>
          ) : null}

          {diagnosis.wells === 'alta' ? (
            <div className="flex flex-col gap-3">
              {DIAGNOSIS.high.notices.map((notice) => (
                <Notice key={`${notice.title ?? ''}${notice.text ?? ''}`} notice={notice} />
              ))}
            </div>
          ) : null}
        </section>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Button
          type="button"
          className="h-11 self-stretch sm:self-start"
          onClick={() => dispatch({ type: 'confirmar-tep' })}
        >
          {DIAGNOSIS.confirm}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => dispatch({ type: 'voltar' })}
        >
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Button>
      </div>
    </div>
  );
}
