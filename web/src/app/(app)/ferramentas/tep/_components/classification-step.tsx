'use client';

import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import type { CalculatorDefinition } from '@clinical-tools/calculator';
import { CLASSIFICATION } from '@clinical-tools/tep/content';
import {
  classificationAnswerFor,
  type ClassificationCalculator,
  type TepPathwayState,
} from '@clinical-tools/tep/pathway';
import { HESTIA, PESI, SPESI } from '@clinical-tools/tep/severity';
import { InlineCalculator } from '@/components/domain/clinical-tools/inline-calculator';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { OptionList, StepHeader } from './tep-parts';
import type { TepDispatch } from './tep-state';

/**
 * Calculadora da classificação com o "Prosseguir" do ANY: o resultado decide
 * a resposta (sPESI 0 ou PESI I–II → baixo risco; Hestia sem critério →
 * negativo), mas é o médico quem toca para seguir.
 */
function ProceedCalculator({
  title,
  hint,
  definition,
  calculator,
  proceedLabel,
  dispatch,
}: {
  title: string;
  hint?: string;
  definition: CalculatorDefinition;
  calculator: ClassificationCalculator;
  proceedLabel: (answer: ReturnType<typeof classificationAnswerFor>) => string;
  dispatch: TepDispatch;
}) {
  return (
    <Disclosure title={title} triggerClassName="min-h-11">
      <InlineCalculator
        definition={definition}
        hint={hint}
        action={(evaluation) => {
          const answer = classificationAnswerFor(calculator, evaluation);
          return (
            <Button
              type="button"
              className="h-11 self-stretch whitespace-normal sm:self-start"
              onClick={() => dispatch({ type: 'responder', answer })}
            >
              {proceedLabel(answer)}
              <ArrowRight aria-hidden="true" />
            </Button>
          );
        }}
      />
    </Disclosure>
  );
}

/** Passo 3: perguntas Q1–Q4 da classificação AHA/ACC, uma de cada vez. */
export function ClassificationStep({
  state,
  dispatch,
  headingRef,
}: {
  state: TepPathwayState;
  dispatch: TepDispatch;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const question = CLASSIFICATION.questions[state.question];
  const { spesi, pesi, hestia, rvCriteria } = CLASSIFICATION;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step="classificacao"
        title={CLASSIFICATION.title}
        description={CLASSIFICATION.description}
        headingRef={headingRef}
      />

      <section aria-labelledby="tep-pergunta" className="flex flex-col gap-3">
        <h3 id="tep-pergunta" className="text-base font-semibold text-foreground">
          {question.title}
        </h3>

        {state.question === 'biomarcadores' ? (
          <Callout tone="gray" title={rvCriteria.title}>
            {rvCriteria.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </Callout>
        ) : null}

        <OptionList
          label={question.title}
          options={question.options}
          onSelect={(answer) => dispatch({ type: 'responder', answer })}
        />

        {state.question === 'pre-falencia' ? (
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">
            {CLASSIFICATION.preFailureNote}
          </p>
        ) : null}

        {state.question === 'spesi' ? (
          <>
            <ProceedCalculator
              title={spesi.calculate}
              definition={SPESI}
              calculator="spesi"
              proceedLabel={(answer) =>
                answer === 'baixo-risco' ? spesi.proceedLow : spesi.proceedHigh
              }
              dispatch={dispatch}
            />
            <ProceedCalculator
              title={pesi.calculate}
              hint={pesi.hint}
              definition={PESI}
              calculator="pesi"
              proceedLabel={(answer) =>
                answer === 'baixo-risco' ? pesi.proceedLow : pesi.proceedHigh
              }
              dispatch={dispatch}
            />
          </>
        ) : null}

        {state.question === 'hestia' ? (
          <ProceedCalculator
            title={hestia.calculate}
            hint={hestia.hint}
            definition={HESTIA}
            calculator="hestia"
            proceedLabel={() => hestia.proceed}
            dispatch={dispatch}
          />
        ) : null}
      </section>

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => dispatch({ type: 'voltar' })}
      >
        <ArrowLeft aria-hidden="true" />
        {CLASSIFICATION.back}
      </Button>
    </div>
  );
}
