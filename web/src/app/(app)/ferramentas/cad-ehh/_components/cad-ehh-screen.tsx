'use client';

import { useEffect, useMemo, useRef, type ElementType } from 'react';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  BookOpen,
  Calculator,
  ClockCounterClockwise,
  Flask,
  ListChecks,
  MagnifyingGlass,
  Printer,
  Syringe,
  Timer,
  Warning,
} from '@phosphor-icons/react';
import {
  CAD_EHH_STEPS,
  CONSULT_SCREEN_TITLE,
  HOME_CARDS,
  INITIAL_CAD_EHH_STATE,
  PHASE_LABEL,
  cadEhhReducer,
  isPristineCadEhhState,
  panelGuidance,
  parseCadEhhState,
  readPanel,
  stepOf,
  type CadEhhConsultScreen,
  type CadEhhScreen,
} from '@clinical-tools/cad-ehh/roteiro';
import { CAD_EHH_SUBTITLE, SCOPE_NOTE } from '@clinical-tools/cad-ehh/screen-text';
import { CAD_EHH_PROVENANCE } from '@clinical-tools/cad-ehh/sources';
import { formatCompact, formatDecimal } from '@clinical-tools/numbers';
import { validateWeight } from '@clinical-tools/ranges';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useToolFavorites } from '@/lib/tool-favorites';
import { cn } from '@/lib/utils';
import {
  ROTEIRO_SESSION_TTL_MS,
  useSessionReducer,
  useSharedAdultWeight,
} from '../../_components/roteiro-session';
import { FavoriteButton } from '../../_components/tool-entries';
import {
  CalculatorsScreen,
  PitfallsScreen,
  PrecipitantScreen,
  RecognitionScreen,
  ReferencesScreen,
} from './consult-screens';
import { ConfirmStep, RecognizeStep } from './first-hour';
import { ClassifyStep, FluidsStep, PhosphateStep } from './management-steps';
import { ContextBar, StepNav } from './parts';
import { InsulinStep, PotassiumStep } from './potassium-insulin';
import { ReassessmentCycle } from './reassessment-cycle';
import { formatClock } from './format-time';
import type { CadEhhScreenProps } from './step-props';
import { WorksheetScreen } from './worksheet';

/** Chave do roteiro na sessão da aba (copiloto:ferramentas:sessao:cad-ehh). */
export const CAD_EHH_SESSION_KEY = 'cad-ehh';

const CARD_ICON: Partial<Record<CadEhhScreen, ElementType>> = {
  h1: Timer,
  e1: Flask,
  ciclo: ArrowsClockwise,
  calculadoras: Calculator,
  reconhecimento: MagnifyingGlass,
  planilha: Printer,
  armadilhas: Warning,
  precipitante: ListChecks,
  referencias: BookOpen,
};

function HomeScreen({ go }: { go: (screen: CadEhhScreen) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2.5">
        {HOME_CARDS.map((card) => {
          const Icon = CARD_ICON[card.screen] ?? Syringe;
          return (
            <li key={card.screen}>
              <button
                type="button"
                onClick={() => go(card.screen)}
                className={cn(
                  'flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-3 text-center transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  card.highlight ? 'border-2 border-primary' : 'border-border',
                )}
              >
                <Icon
                  aria-hidden="true"
                  weight="duotone"
                  className={cn(
                    'size-7',
                    card.highlight ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <span className="text-[0.9375rem] font-semibold text-foreground">{card.title}</span>
                <span className="text-xs text-muted-foreground">{card.subtitle}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-pretty text-muted-foreground">{SCOPE_NOTE}</p>
    </div>
  );
}

/** Trilha dos oito passos, nas duas fases; cada passo abre com um toque. */
function StepTrail({ current, go }: { current: number; go: (screen: CadEhhScreen) => void }) {
  const phases = [
    CAD_EHH_STEPS.filter(({ phase }) => phase === 'primeira-hora'),
    CAD_EHH_STEPS.filter(({ phase }) => phase === 'apos-exames'),
  ];
  return (
    <nav aria-label="Passos do roteiro" className="flex flex-wrap items-center gap-1">
      {phases.map((steps, phaseIndex) => (
        <ol key={phaseIndex} className="flex items-center gap-1">
          {phaseIndex > 0 ? <li aria-hidden="true" className="mx-1 h-px w-3 bg-border" /> : null}
          {steps.map((step) => {
            const isCurrent = step.n === current;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => go(step.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Passo ${step.n}: ${step.title}`}
                  title={step.title}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                    isCurrent
                      ? 'border-foreground bg-foreground text-background'
                      : step.n < current
                        ? 'border-border bg-surface-subtle text-muted-foreground hover:bg-hover'
                        : 'border-border bg-background text-foreground hover:bg-hover',
                  )}
                >
                  {step.n}
                </button>
              </li>
            );
          })}
        </ol>
      ))}
    </nav>
  );
}

function contextSummary(props: CadEhhScreenProps): string {
  const { glicemia, sodio, potassio, phVenoso } = props.panel.values;
  const parts = [
    props.weight !== null ? `${formatDecimal(props.weight, 0)} kg` : null,
    glicemia !== null ? `Glic ${formatCompact(glicemia)}` : null,
    sodio !== null ? `Na ${formatCompact(sodio)}` : null,
    potassio !== null ? `K ${formatDecimal(potassio, 1)}` : null,
    phVenoso !== null ? `pH ${formatDecimal(phVenoso, 2)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nenhum dado informado';
}

function StepScreen(props: CadEhhScreenProps & { screen: CadEhhScreen }) {
  const step = stepOf(props.screen);
  if (!step) return null;
  const index = CAD_EHH_STEPS.indexOf(step);
  const previous = CAD_EHH_STEPS[index - 1];
  const next = CAD_EHH_STEPS[index + 1];
  return (
    <>
      {step.id !== 'h1' && step.id !== 'h3' ? (
        <ContextBar summary={contextSummary(props)} onEdit={() => props.go('h3')} />
      ) : null}
      {step.id === 'h1' ? <RecognizeStep {...props} /> : null}
      {step.id === 'h2' ? <FluidsStep {...props} phase="inicial" /> : null}
      {step.id === 'h3' ? <ConfirmStep {...props} /> : null}
      {step.id === 'e1' ? <ClassifyStep {...props} /> : null}
      {step.id === 'e2' ? <FluidsStep {...props} phase="manutencao" /> : null}
      {step.id === 'e3' ? <PotassiumStep {...props} /> : null}
      {step.id === 'e4' ? <InsulinStep {...props} /> : null}
      {step.id === 'e5' ? <PhosphateStep /> : null}
      <StepNav
        back={
          previous
            ? { label: 'Voltar', onClick: () => props.go(previous.id) }
            : { label: 'Início', onClick: () => props.go('inicio') }
        }
        next={
          next
            ? { label: 'Próximo', onClick: () => props.go(next.id) }
            : { label: 'Ir para reavaliação', onClick: () => props.go('ciclo') }
        }
      />
    </>
  );
}

function ConsultScreen(props: CadEhhScreenProps & { screen: CadEhhConsultScreen }) {
  switch (props.screen) {
    case 'reconhecimento':
      return <RecognitionScreen />;
    case 'calculadoras':
      return <CalculatorsScreen {...props} />;
    case 'planilha':
      return <WorksheetScreen />;
    case 'armadilhas':
      return <PitfallsScreen />;
    case 'precipitante':
      return <PrecipitantScreen {...props} />;
    case 'referencias':
      return <ReferencesScreen />;
  }
}

function isConsultScreen(screen: CadEhhScreen): screen is CadEhhConsultScreen {
  return screen in CONSULT_SCREEN_TITLE;
}

/** Título e subtítulo da tela atual, para o cabeçalho da seção. */
function screenHeading(screen: CadEhhScreen): {
  eyebrow?: string;
  title: string;
  subtitle?: string;
} {
  const step = stepOf(screen);
  if (step) {
    return {
      eyebrow: `${PHASE_LABEL[step.phase]} · passo ${step.n} de ${CAD_EHH_STEPS.length}`,
      title: step.title,
      subtitle: step.subtitle,
    };
  }
  if (screen === 'ciclo') {
    return {
      eyebrow: 'Ciclo',
      title: 'Reavaliação',
      subtitle: 'as mesmas variáveis, até a resolução',
    };
  }
  if (isConsultScreen(screen)) return { title: CONSULT_SCREEN_TITLE[screen] };
  return { title: 'Início' };
}

/**
 * /ferramentas/cad-ehh — roteiro de CAD e EHH (CC-326), porte do KetoPath do
 * ANY: primeira hora, passos depois dos exames, ciclo de reavaliação e telas
 * de consulta. O estado mora no reducer do motor e fica na sessão da aba; o
 * peso é o mesmo das outras ferramentas adultas.
 */
export function CadEhhScreen({ now = Date.now }: { now?: () => number }) {
  const favorites = useToolFavorites();
  const { state, dispatch, restoredAt, dismissRestored } = useSessionReducer(
    CAD_EHH_SESSION_KEY,
    cadEhhReducer,
    parseCadEhhState,
    INITIAL_CAD_EHH_STATE,
    ROTEIRO_SESSION_TTL_MS,
  );
  const [weightRaw, setWeightRaw] = useSharedAdultWeight();
  const checkedWeight = validateWeight(weightRaw, 'adulto');
  const weight = checkedWeight.ok ? checkedWeight.value : null;
  const panel = useMemo(() => readPanel(state.panel), [state.panel]);
  const guidance = useMemo(
    () => panelGuidance(state, panel.values, weight),
    [state, panel, weight],
  );

  // Ao trocar de tela, o foco vai para o título (no ANY a página voltava ao
  // topo). Na primeira montagem o foco fica onde está.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const previousScreen = useRef(state.screen);
  useEffect(() => {
    if (previousScreen.current === state.screen) return;
    previousScreen.current = state.screen;
    headingRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [state.screen]);

  const go = (screen: CadEhhScreen) => dispatch({ type: 'ir-para', screen });
  function restart() {
    dispatch({ type: 'recomecar' });
    dismissRestored();
  }

  const props: CadEhhScreenProps = {
    state,
    dispatch,
    panel,
    guidance,
    weight,
    weightRaw,
    onWeightChange: setWeightRaw,
    go,
  };
  const { screen } = state;
  const step = stepOf(screen);
  const heading = screenHeading(screen);

  return (
    <Page width="narrow">
      <PageHeader
        icon={Syringe}
        iconTone="blue"
        title="CAD e EHH"
        description={CAD_EHH_SUBTITLE}
        actions={
          <FavoriteButton favoriteKey="tool:cad-ehh" name="CAD e EHH" favorites={favorites} />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        {restoredAt !== null && !isPristineCadEhhState(state) ? (
          <Callout
            tone="gray"
            icon={<ClockCounterClockwise />}
            title="Roteiro retomado nesta aba"
            action={
              <Button type="button" variant="outline" onClick={restart}>
                <ArrowCounterClockwise aria-hidden="true" />
                Recomeçar
              </Button>
            }
          >
            Última alteração às {formatClock(restoredAt)}. Se for outro paciente, recomece.
          </Callout>
        ) : null}
      </div>

      <section
        ref={sectionRef}
        aria-labelledby="cad-ehh-tela"
        className="flex scroll-mt-16 flex-col gap-5"
      >
        {screen !== 'inicio' ? (
          <div className="flex flex-col gap-3">
            {step ? <StepTrail current={step.n} go={go} /> : null}
            <div>
              {heading.eyebrow ? (
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {heading.eyebrow}
                </p>
              ) : null}
              <h2
                id="cad-ehh-tela"
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-semibold text-foreground outline-none"
              >
                {heading.title}
              </h2>
              {heading.subtitle ? (
                <p className="text-sm text-muted-foreground">{heading.subtitle}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <h2 id="cad-ehh-tela" ref={headingRef} tabIndex={-1} className="sr-only">
            Início
          </h2>
        )}

        {screen === 'inicio' ? <HomeScreen go={go} /> : null}
        {step ? <StepScreen {...props} screen={screen} /> : null}
        {screen === 'ciclo' ? (
          <>
            <ReassessmentCycle {...props} now={now} />
            <StepNav back={{ label: 'Início', onClick: () => go('inicio') }} />
          </>
        ) : null}
        {isConsultScreen(screen) ? (
          <>
            <ConsultScreen {...props} screen={screen} />
            <StepNav back={{ label: 'Início', onClick: () => go('inicio') }} />
          </>
        ) : null}
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {step ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 self-start"
            onClick={() => go('inicio')}
          >
            Início do roteiro
          </Button>
        ) : null}
        <ContentProvenanceNote provenance={CAD_EHH_PROVENANCE} />
      </div>
    </Page>
  );
}
