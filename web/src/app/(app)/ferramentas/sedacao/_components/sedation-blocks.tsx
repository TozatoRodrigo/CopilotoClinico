'use client';

import Link from 'next/link';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { TOOLS } from '@clinical-tools/catalog';
import {
  DURING,
  IV_PREPARATION,
  KETAMINE_CALCULATOR,
  KETOFOL_SCREEN,
  RED_FLAGS,
  SEDATION_CHECKLISTS,
  type RedFlag,
} from '@clinical-tools/sedation/content';
import type { SedationBlock } from '@clinical-tools/sedation/derive';
import {
  ketamineImTexts,
  KETOFOL,
  ketofolConcentrationText,
  ketofolEachText,
  ketofolVolumeText,
  mixtureAmount,
} from '@clinical-tools/sedation/doses';
import type { SedationAction, SedationState } from '@clinical-tools/sedation/state';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import {
  Block,
  CheckRow,
  ChoiceList,
  DoseRow,
  MedicationOptions,
  NoticeCallout,
  RegimenCardView,
  YesNoQuestion,
} from './sedation-parts';

export interface BlockContext {
  state: SedationState;
  dispatch: (action: SedationAction) => void;
  weight: string;
  onWeightChange: (raw: string) => void;
}

/** Atalho para a Via aérea, só quando ela já estiver portada no Copiloto. */
const AIRWAY_TOOL = TOOLS.find((tool) => tool.id === 'via-aerea' && tool.status === 'disponivel');

function RedFlagDetail({ flag }: { flag: RedFlag }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-tone-orange-bg px-3 py-2.5 text-sm text-tone-orange-ink">
      {flag.emphasis ? <p className="font-semibold">{flag.emphasis}</p> : null}
      {flag.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {flag.listTitle ? <p className="font-semibold">{flag.listTitle}</p> : null}
      <ul className="flex list-disc flex-col gap-0.5 pl-4">
        {flag.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {flag.airwayLink && AIRWAY_TOOL ? (
        <Link
          href={`/ferramentas/${AIRWAY_TOOL.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 self-start font-medium underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          Abrir {AIRWAY_TOOL.name}
          <ArrowSquareOut className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function RedFlags({ state, dispatch }: Pick<BlockContext, 'state' | 'dispatch'>) {
  return (
    <Block title={IV_PREPARATION.redFlagsTitle} description={IV_PREPARATION.redFlagsHint}>
      <ul className="flex flex-col gap-2">
        {RED_FLAGS.map((flag) => (
          <CheckRow
            key={flag.id}
            title={flag.title}
            checked={state.redFlags.includes(flag.id)}
            onToggle={() => dispatch({ type: 'toggle-red-flag', id: flag.id })}
          >
            <RedFlagDetail flag={flag} />
          </CheckRow>
        ))}
      </ul>
    </Block>
  );
}

function Checklist({
  id,
  state,
  dispatch,
}: Pick<BlockContext, 'state' | 'dispatch'> & { id: keyof typeof SEDATION_CHECKLISTS }) {
  const checklist = SEDATION_CHECKLISTS[id];
  const done = checklist.items.filter((item) => state.checked.includes(item.id)).length;
  return (
    <Disclosure
      title={checklist.title}
      meta={`${done}/${checklist.items.length}`}
      defaultOpen={checklist.defaultOpen}
    >
      <div className="flex flex-col gap-2">
        {'intro' in checklist ? (
          <p className="text-sm text-muted-foreground">{checklist.intro}</p>
        ) : null}
        {'notice' in checklist ? <NoticeCallout notice={checklist.notice} /> : null}
        <ul aria-label={checklist.title} className="flex flex-col gap-2">
          {checklist.items.map((item) => (
            <CheckRow
              key={item.id}
              title={item.title}
              checked={state.checked.includes(item.id)}
              onToggle={() => dispatch({ type: 'toggle-check', id: item.id })}
            />
          ))}
        </ul>
      </div>
    </Disclosure>
  );
}

/** Resultado ao vivo: anuncia a dose nova ao leitor de tela sem roubar o foco do campo. */
function LiveResult({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col">
      {children}
    </div>
  );
}

const NEEDS_WEIGHT = 'Informe o peso para calcular a dose.';

/** Um bloco da tela, desenhado a partir do que o motor mandou (`deriveSedation`). */
export function SedationBlockView({
  block,
  context,
}: {
  block: SedationBlock;
  context: BlockContext;
}) {
  const { state, dispatch, weight, onWeightChange } = context;
  switch (block.kind) {
    case 'notice':
      return <NoticeCallout notice={block.notice} />;
    case 'question':
      return (
        <div className="flex flex-col gap-1 rounded-md border border-border px-4 py-3">
          <p className="text-base font-semibold text-foreground">{block.title}</p>
          <p className="text-sm text-muted-foreground">{block.text}</p>
        </div>
      );
    case 'outcome':
      return (
        <Callout tone="gray" title={block.title}>
          {block.text}
        </Callout>
      );
    case 'regimen':
      return <RegimenCardView card={block.card} />;
    case 'choices':
      return (
        <ChoiceList
          section={block.section}
          choices={block.choices}
          onChoose={(choice) => dispatch({ type: 'choose', choice })}
        />
      );
    case 'recent-sedation':
      return (
        <YesNoQuestion
          question={block.question}
          answer={block.answer}
          onAnswer={(value) => dispatch({ type: 'set-recent-sedation', value })}
        />
      );
    case 'urgent-im':
      return (
        <MedicationOptions
          legend={block.legend}
          options={block.options}
          selected={block.selected}
          onSelect={(drug) => dispatch({ type: 'choose-urgent-im', drug })}
        />
      );
    case 'combative':
      return (
        <MedicationOptions
          legend={block.legend}
          options={block.options}
          selected={block.selected}
          onSelect={(regimen) => dispatch({ type: 'choose-combative-regimen', regimen })}
        />
      );
    case 'ketamine-calculator': {
      const texts = block.dose ? ketamineImTexts(block.dose) : null;
      return (
        <Block title={KETAMINE_CALCULATOR.title}>
          <WeightField population="adulto" value={weight} onValueChange={onWeightChange} />
          <LiveResult>
            {texts ? (
              <dl data-slot="ketamine-dose">
                <DoseRow label={KETAMINE_CALCULATOR.doseLabel} value={texts.dose} />
                <DoseRow label={KETAMINE_CALCULATOR.volumeLabel} value={texts.volume} emphasis />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{NEEDS_WEIGHT}</p>
            )}
          </LiveResult>
        </Block>
      );
    }
    case 'checklist':
      return <Checklist id={block.id} state={state} dispatch={dispatch} />;
    case 'red-flags':
      return <RedFlags state={state} dispatch={dispatch} />;
    case 'ketofol-mixture':
      return (
        <Block title={KETOFOL_SCREEN.preparationTitle}>
          <dl className="rounded-md border border-border px-3">
            {KETOFOL.mixture.map((component) => (
              <DoseRow
                key={component.label}
                label={component.label}
                value={mixtureAmount(component)}
              />
            ))}
            <DoseRow
              label={KETOFOL_SCREEN.totalLabel}
              value={`${KETOFOL.totalVolumeMl} mL`}
              emphasis
            />
          </dl>
          <p className="text-sm text-muted-foreground">
            {KETOFOL_SCREEN.concentrationLabel}{' '}
            <span className="font-semibold text-foreground">{ketofolConcentrationText()}</span>
          </p>
        </Block>
      );
    case 'ketofol-doses': {
      const { doses } = block;
      return (
        <Block title={KETOFOL_SCREEN.dosesTitle}>
          <WeightField population="adulto" value={weight} onValueChange={onWeightChange} />
          <NoticeCallout notice={block.basis} />
          <LiveResult>
            {doses ? (
              <div data-slot="ketofol-doses" className="flex flex-col gap-3">
                <section className="flex flex-col">
                  <h4 className="text-sm font-semibold text-foreground">
                    {KETOFOL_SCREEN.inductionTitle}
                  </h4>
                  <dl>
                    <DoseRow
                      label={KETOFOL_SCREEN.inductionDoseLabel}
                      value={ketofolEachText(doses.induction)}
                    />
                    <DoseRow
                      label={KETOFOL_SCREEN.inductionVolumeLabel}
                      value={ketofolVolumeText(doses.induction)}
                      emphasis
                    />
                  </dl>
                </section>
                <section className="flex flex-col">
                  <h4 className="text-sm font-semibold text-foreground">
                    {KETOFOL_SCREEN.maintenanceTitle}
                  </h4>
                  <dl>
                    <DoseRow
                      label={KETOFOL_SCREEN.maintenanceDoseLabel}
                      value={ketofolEachText(doses.maintenance)}
                    />
                    <DoseRow
                      label={KETOFOL_SCREEN.maintenanceVolumeLabel}
                      value={ketofolVolumeText(doses.maintenance)}
                    />
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {KETOFOL_SCREEN.maintenanceRepeat}
                  </p>
                </section>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{NEEDS_WEIGHT}</p>
            )}
          </LiveResult>
        </Block>
      );
    }
    case 'monitoring':
      return (
        <Disclosure title={DURING.monitoringTitle} defaultOpen>
          <dl className="flex flex-col">
            {DURING.monitoring.map(({ title, detail }) => (
              <div key={title} className="border-b border-border py-2 last:border-b-0">
                <dt className="text-sm font-semibold text-foreground">{title}</dt>
                <dd className="text-sm text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      );
    case 'complications':
      return (
        <Disclosure title={DURING.complicationsTitle}>
          <div className="flex flex-col gap-2">
            {DURING.complications.map((notice) => (
              <NoticeCallout key={notice.title} notice={notice} />
            ))}
          </div>
        </Disclosure>
      );
  }
}
