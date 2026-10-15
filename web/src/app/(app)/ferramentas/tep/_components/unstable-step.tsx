'use client';

import { ArrowCounterClockwise, ArrowLeft } from '@phosphor-icons/react';
import { evaluateCalculator, formatResultValue } from '@clinical-tools/calculator';
import { UNSTABLE } from '@clinical-tools/tep/content';
import { ECHO_RV } from '@clinical-tools/tep/echo';
import type { TepPathwayState } from '@clinical-tools/tep/pathway';
import { CalculatorResult } from '@/components/domain/clinical-tools/calculator-result';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import {
  DrugBlockView,
  Notice,
  OptionList,
  StepBlock,
  StepHeader,
  TepLinkAction,
} from './tep-parts';
import type { TepDispatch } from './tep-state';

const T = UNSTABLE.thrombolysis;

function EchoBlock({ state, dispatch }: { state: TepPathwayState; dispatch: TepDispatch }) {
  const evaluation = evaluateCalculator(ECHO_RV, { items: state.echo });
  return (
    <StepBlock title={UNSTABLE.echo.title}>
      <p className="text-[0.9375rem] text-pretty">{UNSTABLE.echo.text}</p>
      {evaluation.status === 'complete' ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="tep-eco-resumo">
          <span
            className={cn(
              'rounded-[3px] px-1.5 py-0.5 font-medium',
              toneTag[RESULT_TONE[evaluation.band.tone]],
            )}
          >
            {evaluation.band.label}
          </span>
          <span className="text-muted-foreground">
            {formatResultValue(ECHO_RV, evaluation.value)}
          </span>
        </p>
      ) : null}
      <Disclosure title={UNSTABLE.echo.record} triggerClassName="min-h-11">
        <div className="flex flex-col gap-4">
          <ScoreItemList
            items={ECHO_RV.items}
            answers={state.echo}
            showsPoints={() => false}
            onAnswer={(finding, option) =>
              dispatch({ type: 'eco', finding, present: option === 'sim' })
            }
          />
          <CalculatorResult definition={ECHO_RV} evaluation={evaluation} />
        </div>
      </Disclosure>
      <TepLinkAction link={UNSTABLE.echo.reference} />
    </StepBlock>
  );
}

function ThrombolysisBlock({ state, dispatch }: { state: TepPathwayState; dispatch: TepDispatch }) {
  const reassess = (
    <Button
      type="button"
      variant="ghost"
      className="self-start"
      onClick={() => dispatch({ type: 'trombolise', answer: 'reavaliar' })}
    >
      <ArrowCounterClockwise aria-hidden="true" />
      {T.reassess}
    </Button>
  );

  function question(
    text: string,
    detail: string,
    yes: { label: string; answer: 'contraindicada' | 'risco-alto' },
    no: { label: string; answer: 'sem-contraindicacao' | 'risco-padrao' },
  ) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[0.9375rem] font-semibold">{text}</p>
        <p className="text-[0.8125rem] text-pretty text-muted-foreground">{detail}</p>
        <OptionList
          label={text}
          options={[
            { value: yes.answer, label: yes.label },
            { value: no.answer, label: no.label },
          ]}
          onSelect={(answer) => dispatch({ type: 'trombolise', answer })}
        />
      </div>
    );
  }

  let stage;
  switch (state.thrombolysis) {
    case 'contraindicacao':
      stage = question(
        T.contraindication.question,
        T.contraindication.detail,
        { label: T.contraindication.yes, answer: 'contraindicada' },
        { label: T.contraindication.no, answer: 'sem-contraindicacao' },
      );
      break;
    case 'risco-hemorragico':
      stage = question(
        T.bleedingRisk.question,
        T.bleedingRisk.detail,
        { label: T.bleedingRisk.yes, answer: 'risco-alto' },
        { label: T.bleedingRisk.no, answer: 'risco-padrao' },
      );
      break;
    case 'contraindicada':
      stage = (
        <>
          <Notice notice={T.contraindicated} />
          {reassess}
        </>
      );
      break;
    case 'dose-reduzida':
    case 'dose-padrao': {
      const dose = state.thrombolysis === 'dose-reduzida' ? T.reducedDose : T.standardDose;
      stage = (
        <>
          <Notice notice={dose.notice} />
          {dose.blocks.map((block) => (
            <DrugBlockView key={block.name} block={block} />
          ))}
          {reassess}
        </>
      );
      break;
    }
  }

  return (
    <StepBlock title={T.title}>
      <p className="text-[0.9375rem] text-pretty">{T.text}</p>
      <div aria-live="polite" className="flex flex-col gap-3">
        {stage}
      </div>
      <TepLinkAction link={T.contraindications} />
    </StepBlock>
  );
}

/** Desvio do passo 1 para o paciente instável (o `stepUnstable` do ANY). */
export function UnstableStep({
  state,
  dispatch,
  headingRef,
}: {
  state: TepPathwayState;
  dispatch: TepDispatch;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step="instavel"
        eyebrow={UNSTABLE.label}
        title={UNSTABLE.title}
        headingRef={headingRef}
      />
      <Notice notice={UNSTABLE.priority} />

      <StepBlock title={UNSTABLE.immediateActions.title}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem]">
          {UNSTABLE.immediateActions.items.map((item) => (
            <li key={item} className="text-pretty">
              {item}
            </li>
          ))}
        </ul>
      </StepBlock>

      <EchoBlock state={state} dispatch={dispatch} />

      <StepBlock title={UNSTABLE.support.title}>
        {UNSTABLE.support.blocks.map((block) => (
          <DrugBlockView key={block.name} block={block} />
        ))}
      </StepBlock>

      <Notice notice={UNSTABLE.intubation} />

      <StepBlock title={UNSTABLE.anticoagulation.title}>
        <p className="text-[0.9375rem] text-pretty">{UNSTABLE.anticoagulation.text}</p>
        <DrugBlockView block={UNSTABLE.anticoagulation.heparin} />
        <TepLinkAction link={UNSTABLE.anticoagulation.contraindications} />
      </StepBlock>

      <ThrombolysisBlock state={state} dispatch={dispatch} />

      <Notice notice={UNSTABLE.confirmation} />

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{UNSTABLE.classify.title}</h3>
        <OptionList
          label={UNSTABLE.classify.title}
          options={UNSTABLE.classify.options}
          onSelect={(category) => dispatch({ type: 'classificar-instavel', category })}
        />
      </section>

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
  );
}
