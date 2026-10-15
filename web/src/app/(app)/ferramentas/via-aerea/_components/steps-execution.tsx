'use client';

import Link from 'next/link';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import {
  COMMON_ERRORS,
  CORMACK_GRADES,
  LARYNGOSCOPY_TECHNIQUES,
  NOTICES,
  POST_INTUBATION_SEDATION,
  RESCUE_METHODS,
  RESCUE_PLANS,
  type LaryngoscopyTechnique,
} from '@clinical-tools/airway/content';
import { OUTCOME_CHOICES, outcomeChoices } from '@clinical-tools/airway/state';
import { buildAirwayChartNote, buildAirwaySummary } from '@clinical-tools/airway/summary';
import { AIRWAY_RANGES } from '@clinical-tools/airway/vitals';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Block, NoticeCallout } from './airway-parts';
import { ChoiceGroup } from '@/components/domain/clinical-tools/choice-group';
import { ChecklistSection } from './checklist-section';
import { infusionsHref } from './infusions-link';
import type { StepProps } from './step-props';

/** Passo 9 — técnica (direta × vídeo), erros comuns e registro do procedimento. */
export function ProcedureStep({ state, view, dispatch }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {view.difficultAnatomy ? <NoticeCallout notice={NOTICES.vadDificil} /> : null}

      <Tabs
        value={state.technique}
        onValueChange={(value) =>
          dispatch({ type: 'set-technique', technique: value as LaryngoscopyTechnique })
        }
      >
        <TabsList aria-label="Técnica">
          {LARYNGOSCOPY_TECHNIQUES.map((technique) => (
            <TabsTrigger key={technique.id} value={technique.id}>
              {technique.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {LARYNGOSCOPY_TECHNIQUES.map((technique) => (
          <TabsContent key={technique.id} value={technique.id}>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-[0.9375rem] text-foreground">
              {technique.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>

      <Disclosure title="Erros comuns">
        <ul className="flex flex-col gap-1 text-sm text-foreground">
          {COMMON_ERRORS.map(({ title, detail }) => (
            <li key={title}>
              <span className="font-medium">{title}</span> — {detail}
            </li>
          ))}
        </ul>
      </Disclosure>

      <Block title="Registro">
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Tubo: </span>
          {view.tube ?? '-- (informe o sexo no passo 4)'}
        </p>
        <ChoiceGroup
          label="Cormack-Lehane"
          options={CORMACK_GRADES.map((grade) => ({ value: grade, label: grade }))}
          value={state.cormack}
          onChange={(grade) => dispatch({ type: 'set-cormack', grade })}
          columns={4}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            id="via-aerea-profundidade"
            label="Profundidade"
            unit={AIRWAY_RANGES.depth.unit}
            range={AIRWAY_RANGES.depth}
            value={state.depth}
            onValueChange={(raw) => dispatch({ type: 'set-depth', raw })}
            placeholder="22"
          />
          <NumericField
            id="via-aerea-cuff"
            label="Cuff"
            unit={AIRWAY_RANGES.cuff.unit}
            range={AIRWAY_RANGES.cuff}
            value={state.cuff}
            onValueChange={(raw) => dispatch({ type: 'set-cuff', raw })}
            placeholder="25"
          />
        </div>
      </Block>

      {view.limitedView ? <NoticeCallout notice={NOTICES.cormackLimitado} /> : null}
    </div>
  );
}

function SedationLink() {
  const href = infusionsHref();
  if (!href) return null;
  return (
    <Link
      href={href}
      className="flex min-h-12 flex-col justify-center rounded-md border border-border px-3 py-2 transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <span className="text-sm font-medium text-link">{POST_INTUBATION_SEDATION.title} →</span>
      <span className="text-xs text-muted-foreground">
        {POST_INTUBATION_SEDATION.detail}: {POST_INTUBATION_SEDATION.drugs}
      </span>
    </Link>
  );
}

function PlanLines({ lines, ordered }: { lines: readonly string[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List
      className={`flex flex-col gap-0.5 pl-5 text-sm text-foreground ${ordered ? 'list-decimal' : 'list-disc'}`}
    >
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </List>
  );
}

/** Passo 10 — "Intubou?" e, se não, o resgate (plano B) e o plano C. */
export function OutcomeStep(props: StepProps) {
  const { state, dispatch } = props;
  const { outcome } = state;
  const choices = outcomeChoices(outcome);
  const choiceButton = (choice: (typeof choices)[number]) => (
    <Button
      key={choice}
      type="button"
      variant="outline"
      className="flex-1"
      onClick={() => dispatch(OUTCOME_CHOICES[choice].action)}
    >
      {OUTCOME_CHOICES[choice].label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      {outcome.status === 'pendente' ? (
        <Block title="Intubou com sucesso?">
          <div className="flex gap-2">{choices.map(choiceButton)}</div>
        </Block>
      ) : null}

      {outcome.status === 'resgatado' ? (
        <NoticeCallout
          notice={{
            tone: 'neutral',
            title: `Resgate: ${RESCUE_METHODS.find(({ id }) => id === outcome.method)?.label}`,
            lines: [
              `Via aérea estabelecida com ${RESCUE_METHODS.find(({ id }) => id === outcome.method)?.summary}.`,
            ],
          }}
        />
      ) : null}

      {outcome.status === 'intubado' || outcome.status === 'resgatado' ? (
        <>
          <ChecklistSection checklist="confirmacao" {...props} />
          {outcome.status === 'intubado' ? <ChecklistSection checklist="pocus" {...props} /> : null}
          <SedationLink />
        </>
      ) : null}

      {outcome.status === 'falhou' ? (
        <>
          <Block title={RESCUE_PLANS.planoB.title}>
            <PlanLines lines={RESCUE_PLANS.planoB.lines} />
            <div className="flex gap-2">
              {choices.filter((choice) => choice !== 'crico-estabelecida').map(choiceButton)}
            </div>
          </Block>
          {outcome.planC ? (
            <Block title={RESCUE_PLANS.planoC.title} description={RESCUE_PLANS.planoC.lead}>
              <PlanLines lines={RESCUE_PLANS.planoC.lines} ordered />
              <div className="flex gap-2">
                {choices.filter((choice) => choice === 'crico-estabelecida').map(choiceButton)}
              </div>
            </Block>
          ) : null}
        </>
      ) : null}

      {outcome.status !== 'pendente' ? (
        <div>
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'clear-outcome' })}>
            <ArrowCounterClockwise aria-hidden="true" />
            Corrigir a resposta
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Passo 11 — resumo e texto para o prontuário. */
export function SummaryStep({ state, weight }: StepProps) {
  const sections = buildAirwaySummary(state, weight);
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col divide-y divide-border border-y border-border">
        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
            <dt className="text-sm font-medium text-muted-foreground sm:w-40 sm:shrink-0">
              {section.title}
            </dt>
            <dd className="flex flex-col gap-0.5 text-[0.9375rem] text-foreground">
              {section.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <CopyToChartButton text={buildAirwayChartNote(state, weight)} />
    </div>
  );
}
