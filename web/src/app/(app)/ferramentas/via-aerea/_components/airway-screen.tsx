'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowCounterClockwise,
  CaretRight,
  ListChecks,
  Path,
  Syringe,
  Wind,
} from '@phosphor-icons/react';
import {
  AIRWAY_PROVENANCE,
  AIRWAY_STEPS,
  LAST_STEP,
  STANDALONE_CHECKLISTS,
  type AirwayStepNumber,
} from '@clinical-tools/airway/content';
import { deriveAirway, type AirwayView } from '@clinical-tools/airway/derive';
import {
  airwayReducer,
  hasAirwayProgress,
  INITIAL_AIRWAY_STATE,
  parseAirwayState,
  type AirwayAction,
  type AirwayScreen as Screen,
  type AirwayState,
} from '@clinical-tools/airway/state';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useToolFavorites } from '@/lib/tool-favorites';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '../../_components/tool-entries';
import { useToolSession, useToolWeight } from '@/lib/tool-session';
import { ChecklistSection } from './checklist-section';
import { Medications } from './medications';
import type { StepProps } from './step-props';
import { AnatomyStep, CrashStep, IndicationStep, PatientStep } from './steps-assessment';
import { OutcomeStep, ProcedureStep, SummaryStep } from './steps-execution';
import { OptimizationStep, PreoxygenationStep, TripleSetupStep } from './steps-preparation';

const TOOL_NAME = 'Intubação e via aérea difícil';

const STEP_VIEWS: Record<AirwayStepNumber, (props: StepProps) => ReactNode> = {
  1: IndicationStep,
  2: CrashStep,
  3: AnatomyStep,
  4: PatientStep,
  5: TripleSetupStep,
  6: OptimizationStep,
  7: PreoxygenationStep,
  8: Medications,
  9: ProcedureStep,
  10: OutcomeStep,
  11: SummaryStep,
};

/**
 * Por que o "Continuar" está desligado, como no ANY: sem indicação no passo 1,
 * sem escolha de avaliar a VAD no passo 3, sem peso e sexo no passo 4. A
 * trilha de passos continua livre (o ANY também deixava pular).
 */
function blockedReason(state: AirwayState, view: AirwayView): string | null {
  switch (state.step) {
    case 1:
      return view.hasIndication ? null : 'Selecione ao menos uma indicação para continuar.';
    case 3:
      return state.vadAssessment === 'avaliar'
        ? null
        : 'Escolha avaliar os preditores ou continuar sem avaliar.';
    case 4:
      return view.patientDataComplete
        ? null
        : 'Informe o peso (40 a 200 kg) e o sexo para continuar.';
    default:
      return null;
  }
}

function StepTrail({
  current,
  onSelect,
}: {
  current: AirwayStepNumber;
  onSelect: (step: AirwayStepNumber) => void;
}) {
  const active = AIRWAY_STEPS.find(({ number }) => number === current);
  return (
    <nav aria-label="Passos do roteiro" className="flex flex-col gap-2">
      <ol className="flex flex-wrap gap-1">
        {AIRWAY_STEPS.map((step) => {
          const isCurrent = step.number === current;
          // Passo anterior fica como "visto", sem check: pular passos é permitido.
          const isPast = step.number < current;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.number)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Passo ${step.number}: ${step.title}`}
                title={step.title}
                className={cn(
                  'flex size-10 items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  isCurrent
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isPast
                      ? 'border-border bg-tone-gray-bg text-foreground hover:bg-hover'
                      : 'border-border bg-background text-muted-foreground hover:bg-hover',
                )}
              >
                {step.number}
              </button>
            </li>
          );
        })}
      </ol>
      {active ? (
        <p className="text-sm text-muted-foreground">
          Passo {active.number} de {AIRWAY_STEPS.length} — {active.title}
        </p>
      ) : null}
    </nav>
  );
}

function Pathway(props: StepProps) {
  const { state, view, dispatch } = props;
  const step = AIRWAY_STEPS.find(({ number }) => number === state.step);
  const StepView = STEP_VIEWS[state.step];
  const blocked = blockedReason(state, view);
  const goTo = (target: AirwayStepNumber) => {
    dispatch({ type: 'go-to-step', step: target });
    window.scrollTo({ top: 0 });
  };
  const previous = state.step > 1 ? ((state.step - 1) as AirwayStepNumber) : null;
  const next = state.step < LAST_STEP ? ((state.step + 1) as AirwayStepNumber) : null;
  // No passo 3 o "Continuar" só aparece depois de escolher avaliar (como no ANY).
  const showNext = next !== null && !(state.step === 3 && state.vadAssessment !== 'avaliar');

  return (
    <section aria-labelledby="via-aerea-passo" className="flex flex-col gap-5">
      <StepTrail current={state.step} onSelect={goTo} />
      <h2 id="via-aerea-passo" className="text-xl font-semibold text-foreground">
        {step?.heading}
      </h2>
      <StepView {...props} />
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {blocked && showNext ? (
          <p id="via-aerea-bloqueio" className="text-sm text-muted-foreground">
            {blocked}
          </p>
        ) : null}
        <div className="flex gap-2">
          {previous ? (
            <Button type="button" variant="outline" onClick={() => goTo(previous)}>
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Button>
          ) : null}
          {showNext ? (
            <Button
              type="button"
              className="flex-1"
              disabled={blocked !== null}
              aria-describedby={blocked ? 'via-aerea-bloqueio' : undefined}
              onClick={() => goTo(next)}
            >
              {state.step === 10 ? 'Finalizar' : 'Continuar'}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HomeEntry({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Path;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function Home({
  state,
  weight,
  open,
  restart,
}: {
  state: AirwayState;
  weight: string;
  open: (screen: Screen) => void;
  restart: () => void;
}) {
  const inProgress = weight.trim() !== '' || hasAirwayProgress(state);
  const current = AIRWAY_STEPS.find(({ number }) => number === state.step);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        <HomeEntry
          icon={Path}
          title={
            inProgress
              ? `Continuar o roteiro (passo ${state.step}: ${current?.title})`
              : 'Roteiro de intubação'
          }
          description="Passo a passo em 11 etapas, da indicação ao resumo para o prontuário."
          onClick={() => open('roteiro')}
        />
        <HomeEntry
          icon={ListChecks}
          title="Checklist de IOT"
          description="Paciente, equipamento, equipe e pós-intubação."
          onClick={() => open('checklist')}
        />
        <HomeEntry
          icon={Syringe}
          title="Doses de medicações"
          description="Indutores e bloqueadores neuromusculares por peso."
          onClick={() => open('doses')}
        />
      </ul>
      {inProgress ? (
        <div>
          <Button type="button" variant="ghost" onClick={restart}>
            <ArrowCounterClockwise aria-hidden="true" />
            Recomeçar (novo paciente)
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BackToHome({ onClick }: { onClick: () => void }) {
  return (
    <div>
      <Button type="button" variant="ghost" onClick={onClick} className="-ml-2">
        <ArrowLeft aria-hidden="true" />
        Início da via aérea
      </Button>
    </div>
  );
}

/**
 * /ferramentas/via-aerea (CC-315): o AirwayGuide do ANY no design system.
 * Toda conta, texto clínico e regra vêm do motor (`@clinical-tools/airway`):
 * a tela guarda o estado na aba e desenha.
 */
export function AirwayScreen() {
  const favorites = useToolFavorites();
  const [state, setState] = useToolSession<AirwayState>(
    'via-aerea',
    parseAirwayState,
    () => INITIAL_AIRWAY_STATE,
  );
  const [weight, setWeight] = useToolWeight();
  const dispatch = useCallback(
    (action: AirwayAction) => setState((current) => airwayReducer(current, action)),
    [setState],
  );
  const view = useMemo(() => deriveAirway(state, weight), [state, weight]);
  const stepProps: StepProps = { state, view, dispatch, weight, onWeightChange: setWeight };
  const open = (screen: Screen) => dispatch({ type: 'open-screen', screen });

  return (
    <Page width="narrow">
      <PageHeader
        icon={Wind}
        iconTone="blue"
        title={TOOL_NAME}
        description="Intubação em sequência rápida em 11 passos, doses por peso e plano de resgate."
        actions={
          <FavoriteButton favoriteKey="tool:via-aerea" name={TOOL_NAME} favorites={favorites} />
        }
      />
      <DecisionSupportNotice />

      {state.screen === 'inicio' ? (
        <Home
          state={state}
          weight={weight}
          open={open}
          restart={() => {
            dispatch({ type: 'reset' });
            setWeight('');
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <BackToHome onClick={() => open('inicio')} />
          {state.screen === 'roteiro' ? <Pathway {...stepProps} /> : null}
          {state.screen === 'checklist' ? (
            <section aria-labelledby="via-aerea-checklist" className="flex flex-col gap-5">
              <h2 id="via-aerea-checklist" className="text-xl font-semibold text-foreground">
                Checklist de IOT
              </h2>
              {STANDALONE_CHECKLISTS.map((key) => (
                <ChecklistSection key={key} checklist={key} {...stepProps} />
              ))}
            </section>
          ) : null}
          {state.screen === 'doses' ? (
            <section aria-labelledby="via-aerea-doses" className="flex flex-col gap-5">
              <h2 id="via-aerea-doses" className="text-xl font-semibold text-foreground">
                Doses de medicações
              </h2>
              <Medications {...stepProps} />
            </section>
          ) : null}
        </div>
      )}

      <ContentProvenanceNote
        provenance={AIRWAY_PROVENANCE}
        className="border-t border-border pt-4"
      />
    </Page>
  );
}
