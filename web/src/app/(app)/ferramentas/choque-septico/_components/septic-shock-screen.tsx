'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowCounterClockwise, ClockCounterClockwise, Drop } from '@phosphor-icons/react';
import {
  INITIAL_SEPTIC_STATE,
  isPristineSepticState,
  parseSepticShockState,
  readSepticValues,
  septicShockReducer,
} from '@clinical-tools/shock/septic-roteiro';
import { SEPTIC_STEP_CONTENT, SEPTIC_STEPS } from '@clinical-tools/shock/septic-shock';
import { SEPTIC_SHOCK_PROVENANCE, SEPTIC_SHOCK_REFERENCES } from '@clinical-tools/shock/sources';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { useToolFavorites } from '@/lib/tool-favorites';
import {
  ROTEIRO_SESSION_TTL_MS,
  useSessionReducer,
  useSharedAdultWeight,
} from '../../_components/roteiro-session';
import { formatClock } from '../../_components/shock/format-time';
import { ShockReferences } from '../../_components/shock/shock-references';
import { FavoriteButton } from '../../_components/tool-entries';
import { FluidsStep } from './fluids-step';
import { PerfusionStep } from './perfusion-step';
import { ProfileStep } from './profile-step';
import { RecognitionStep } from './recognition-step';
import { VasopressorStep } from './vasopressor-step';

/** Chave do roteiro na sessão da aba (copiloto:ferramentas:sessao:choque-septico). */
export const SEPTIC_SESSION_KEY = 'choque-septico';

const STEP_LABELS = SEPTIC_STEPS.map((step) => SEPTIC_STEP_CONTENT[step].short);

/**
 * /ferramentas/choque-septico — roteiro do ANDROMEDA-SHOCK 2 (CC-316). O
 * estado mora no reducer do motor e é salvo na sessão da aba a cada mudança:
 * abrir as Infusões para calcular a noradrenalina e voltar cai no mesmo passo,
 * com a linha do tempo.
 */
export function SepticShockScreen({ now = Date.now }: { now?: () => number }) {
  const favorites = useToolFavorites();
  const { state, dispatch, restoredAt, dismissRestored } = useSessionReducer(
    SEPTIC_SESSION_KEY,
    septicShockReducer,
    parseSepticShockState,
    INITIAL_SEPTIC_STATE,
    ROTEIRO_SESSION_TTL_MS,
  );
  const [weight, setWeight] = useSharedAdultWeight();
  const values = useMemo(() => readSepticValues(state), [state]);
  const content = SEPTIC_STEP_CONTENT[state.step];

  // Ao trocar de passo, o foco vai para o título do passo (no ANY, a página
  // voltava ao topo). Na primeira montagem o foco fica onde está.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const previousStep = useRef(state.step);
  useEffect(() => {
    if (previousStep.current === state.step) return;
    previousStep.current = state.step;
    headingRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [state.step]);

  function restart() {
    dispatch({ type: 'recomecar' });
    dismissRestored();
  }

  const stepProps = { state, values, dispatch, now };

  return (
    <Page width="narrow">
      <PageHeader
        icon={Drop}
        iconTone="blue"
        title="Choque séptico"
        description="ANDROMEDA-SHOCK 2: ressuscitação guiada pelo enchimento capilar (protocolo CRT-PHR)."
        actions={
          <FavoriteButton
            favoriteKey="tool:choque-septico"
            name="Choque séptico"
            favorites={favorites}
          />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        {restoredAt !== null && !isPristineSepticState(state) ? (
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
        aria-labelledby="passo-atual"
        className="flex scroll-mt-16 flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <ProgressSteps steps={STEP_LABELS} currentStep={SEPTIC_STEPS.indexOf(state.step)} />
          <div>
            <h2
              id="passo-atual"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-foreground outline-none"
            >
              {content.title}
            </h2>
            <p className="text-sm text-muted-foreground">{content.subtitle}</p>
          </div>
        </div>

        {state.step === 'reconhecimento' ? (
          <RecognitionStep {...stepProps} weight={weight} onWeightChange={setWeight} />
        ) : null}
        {state.step === 'fluidos' ? <FluidsStep {...stepProps} /> : null}
        {state.step === 'vasopressor' ? <VasopressorStep {...stepProps} weight={weight} /> : null}
        {state.step === 'perfusao' ? <PerfusionStep {...stepProps} /> : null}
        {state.step === 'perfil' ? <ProfileStep {...stepProps} onRestart={restart} /> : null}
      </section>

      <ShockReferences references={SEPTIC_SHOCK_REFERENCES} provenance={SEPTIC_SHOCK_PROVENANCE} />
    </Page>
  );
}
