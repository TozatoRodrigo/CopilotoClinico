'use client';

import { ArrowCounterClockwise, WarningOctagon } from '@phosphor-icons/react';
import {
  categoryLabel,
  DISPOSITION_LABELS,
  RED_FLAGS,
  SUBSEGMENTAL_ALERT,
  TEP_CATEGORIES,
  type TepCategoryId,
} from '@clinical-tools/tep/categories';
import { MANAGEMENT } from '@clinical-tools/tep/content';
import { buildTepChartNote, type TepPathwayState } from '@clinical-tools/tep/pathway';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { toneBg, toneInk } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { LinkRow, Notice, StepHeader, TepLinkAction } from './tep-parts';
import type { TepDispatch } from './tep-state';

/** Passo 4: conduta da categoria (destino, anticoagulação, monitorização, terapia avançada). */
export function ManagementStep({
  state,
  category: categoryId,
  dispatch,
  headingRef,
}: {
  state: TepPathwayState;
  category: TepCategoryId;
  dispatch: TepDispatch;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const category = TEP_CATEGORIES[categoryId];
  const label = `Categoria ${categoryLabel(category.id, state.respiratory)}`;
  const tone = RESULT_TONE[category.tone];
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];
  const rows: { label: string; value: string; heparin?: boolean }[] = [
    { label: DISPOSITION_LABELS.destination, value: category.destination },
    {
      label: DISPOSITION_LABELS.anticoagulation,
      value: category.anticoagulation,
      heparin: category.heparin,
    },
    { label: DISPOSITION_LABELS.monitoring, value: category.monitoring },
    { label: DISPOSITION_LABELS.advancedTherapy, value: category.advancedTherapy },
    ...(category.followUp
      ? [{ label: DISPOSITION_LABELS.followUp, value: category.followUp }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step="conduta" title={MANAGEMENT.title} headingRef={headingRef} />

      <section
        aria-label={label}
        data-tone={tone}
        className={cn('flex flex-col gap-2 rounded-lg px-4 py-3', toneBg[tone])}
      >
        <p className={cn('text-2xl font-semibold', ink)}>{label}</p>
        <p className={cn('text-[0.9375rem] text-pretty', ink)}>{category.description}</p>
        <h3 className={cn('pt-1 text-sm font-semibold', ink)}>Conduta sugerida</h3>
        <ul className={cn('flex list-disc flex-col gap-1 pl-5 text-[0.9375rem]', ink)}>
          {category.actions.map((action) => (
            <li key={action} className="text-pretty">
              {action}
            </li>
          ))}
        </ul>
      </section>

      {category.subsegmental ? (
        <Notice notice={{ tone: 'attention', ...SUBSEGMENTAL_ALERT }} />
      ) : null}

      {category.redFlags ? (
        <Callout tone="red" icon={<WarningOctagon />} title={RED_FLAGS.title}>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {RED_FLAGS.items.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <span className="mt-2 block font-semibold">{RED_FLAGS.footer}</span>
        </Callout>
      ) : null}

      <dl aria-label="Destino e conduta" className="flex flex-col border-y border-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[10rem_1fr]"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-[0.9375rem] font-medium text-pretty text-foreground">
              {row.value}
              {row.heparin ? (
                <span className="block font-normal">
                  <TepLinkAction link={MANAGEMENT.heparin} />
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <LinkRow links={[MANAGEMENT.anticoagulationSchemes, MANAGEMENT.contraindications]} />

      <div className="flex flex-wrap items-start gap-2">
        <CopyToChartButton text={buildTepChartNote(state)} />
        <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'reiniciar' })}>
          <ArrowCounterClockwise aria-hidden="true" />
          {MANAGEMENT.restart}
        </Button>
      </div>
    </div>
  );
}
