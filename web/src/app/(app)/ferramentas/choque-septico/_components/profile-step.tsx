'use client';

import { ArrowCounterClockwise, Prohibit, Target } from '@phosphor-icons/react';
import {
  buildSepticChartNote,
  computeSepticProfile,
  describeSepticEvent,
} from '@clinical-tools/shock/septic-roteiro';
import { PROFILE_STEP, SEPTIC_INFUSION_LINKS } from '@clinical-tools/shock/septic-shock';
import { SHOCK_REFERENCES } from '@clinical-tools/shock/sources';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Callout } from '@/components/ui/callout';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { formatClock } from '../../_components/shock/format-time';
import { InfusionLinks } from '../../_components/shock/infusion-links';
import { BlockTitle, StepNav } from '../../_components/shock/roteiro-parts';
import { TONE_LABEL } from '../../_components/shock/tone-result';
import type { SepticStepProps } from './step-props';
import { TecReevaluation } from './tec-reevaluation';

const CITATION = `${SHOCK_REFERENCES.andromedaShock2.authors} ${SHOCK_REFERENCES.andromedaShock2.citation}`;

/** Passo 5 — perfil hemodinâmico, condutas, linha do tempo e reavaliação do TEC. */
export function ProfileStep({
  state,
  dispatch,
  now,
  onRestart,
}: SepticStepProps & { onRestart: () => void }) {
  const profile = computeSepticProfile(state);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">
          {PROFILE_STEP.mechanismTitle}
        </p>
        <p role="status" aria-live="polite" className="text-lg font-semibold text-foreground">
          {profile.label}
        </p>
      </div>

      <section aria-labelledby="achados-titulo" className="flex flex-col gap-2">
        <BlockTitle id="achados-titulo">{PROFILE_STEP.findingsTitle}</BlockTitle>
        {profile.findings.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {profile.findings.map((finding) => (
              <li key={finding.id} className="flex items-start gap-2 text-[0.9375rem]">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full bg-current',
                    toneText[RESULT_TONE[finding.tone]],
                  )}
                />
                <span className="text-foreground">
                  {finding.text}
                  {finding.tone !== 'neutral' ? (
                    <span className="sr-only"> ({TONE_LABEL[finding.tone]})</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{PROFILE_STEP.noFindings}</p>
        )}
      </section>

      <section aria-labelledby="condutas-titulo" className="flex flex-col gap-2">
        <BlockTitle id="condutas-titulo">{PROFILE_STEP.suggestionsTitle}</BlockTitle>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem] text-foreground">
          {profile.suggestions.map((item) => (
            <li key={item.id} className="text-pretty">
              {item.text}
            </li>
          ))}
        </ol>
      </section>

      <Callout tone="red" icon={<Prohibit />} title={PROFILE_STEP.notRecommendedTitle}>
        <ul className="flex flex-col gap-1">
          {profile.notRecommended.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </Callout>

      <Callout tone="gray" icon={<Target />} title={PROFILE_STEP.goal.title}>
        {PROFILE_STEP.goal.text}
      </Callout>

      <InfusionLinks drugs={SEPTIC_INFUSION_LINKS.perfil} />

      <section aria-labelledby="linha-do-tempo" className="flex flex-col gap-2">
        <BlockTitle id="linha-do-tempo">{PROFILE_STEP.timelineTitle}</BlockTitle>
        {state.events.length > 0 ? (
          <ol className="flex flex-col divide-y divide-border">
            {state.events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3 py-2 text-sm">
                <time
                  dateTime={new Date(event.at).toISOString()}
                  className="min-w-12 font-medium text-muted-foreground tabular-nums"
                >
                  {formatClock(event.at)}
                </time>
                <span className="text-foreground">{describeSepticEvent(event)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{PROFILE_STEP.emptyTimeline}</p>
        )}
      </section>

      <section aria-labelledby="reavaliacao-tec" className="flex flex-col gap-2">
        <BlockTitle id="reavaliacao-tec">{PROFILE_STEP.reevaluationTitle}</BlockTitle>
        <TecReevaluation state={state} dispatch={dispatch} now={now} />
      </section>

      <CopyToChartButton text={buildSepticChartNote(state, formatClock, CITATION)} />

      <StepNav
        back={{ label: 'Passo 4', onClick: () => dispatch({ type: 'ir-para', step: 'perfusao' }) }}
        next={{
          label: 'Recomeçar',
          variant: 'outline',
          onClick: onRestart,
          icon: <ArrowCounterClockwise aria-hidden="true" />,
        }}
      />
    </div>
  );
}
