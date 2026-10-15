'use client';

import type { Dispatch } from 'react';
import { CheckCircle, ChatCircleText, XCircle } from '@phosphor-icons/react';
import {
  ALERT_SITUATIONS,
  COMMUNICATE_HEADINGS,
  COMMUNICATE_SUBTITLE,
  MYTH_CATEGORIES,
  MYTHS,
  NURSE_STEPS,
  NURSE_TITLE,
  OPENING_PHRASE,
  PALLIATIVE_REFERENCES,
  PHRASES_TO_AVOID,
  PHRASES_TO_USE,
  REDMAP_STEPS,
  REDMAP_TITLE,
  SAVED_STEPS,
  SAVED_SUBTITLE,
  SAVED_WHEN_TO_USE,
  SPICT_CATEGORIES,
  SPICT_GENERAL_INDICATORS,
  SPICT_SUBTITLE,
  SPICT_WHEN_TO_USE,
  SURPRISE_QUESTION,
  SYMPTOM_PAGES,
  SYMPTOM_TABS,
  SYMPTOMS_SUBTITLE,
  type SymptomTab,
} from '@clinical-tools/palliative/content';
import type { PalliativeAction, PalliativeState } from '@clinical-tools/palliative/state';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BulletList,
  ContentBlocks,
  NoteCallout,
  NumberedSteps,
  Section,
  SubHeading,
} from './blocks';

interface SectionProps {
  state: PalliativeState;
  dispatch: Dispatch<PalliativeAction>;
}

function Lead({ children }: { children: string }) {
  return <p className="text-[0.9375rem] text-pretty text-muted-foreground">{children}</p>;
}

/** Identificar — SPICT-BR e pergunta surpresa. */
export function IdentifySection() {
  return (
    <div className="flex flex-col gap-4">
      <Lead>{SPICT_SUBTITLE}</Lead>
      <NoteCallout note={SPICT_WHEN_TO_USE} />
      <div className="flex flex-col">
        {[SPICT_GENERAL_INDICATORS, ...SPICT_CATEGORIES].map((category) => (
          <Section key={category.id} title={category.title} meta={category.items.length}>
            <BulletList items={category.items} />
          </Section>
        ))}
      </div>
      <Callout tone="gray" icon={<ChatCircleText />} title={SURPRISE_QUESTION.title}>
        <span className="block">{SURPRISE_QUESTION.question}</span>
        <span className="mt-1 block">{SURPRISE_QUESTION.guidance}</span>
      </Callout>
    </div>
  );
}

/** Decidir — SAVED, um passo aberto por vez. */
export function DecideSection({ state, dispatch }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <Lead>{SAVED_SUBTITLE}</Lead>
      <NoteCallout note={SAVED_WHEN_TO_USE} />
      <div className="flex flex-col">
        {SAVED_STEPS.map((step) => (
          <Section
            key={step.letter}
            open={state.savedOpen === step.letter}
            onOpenChange={() => dispatch({ type: 'toggle-saved', letter: step.letter })}
            title={
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-tone-blue-tag text-sm font-semibold text-tone-blue-ink"
                >
                  {step.letter}
                </span>
                <span className="min-w-0">
                  <span className="block">{step.title}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {step.subtitle}
                  </span>
                </span>
              </span>
            }
          >
            <p className="text-[0.9375rem] font-medium text-pretty text-foreground">
              {step.prompt}
            </p>
            {step.items ? <BulletList items={step.items} /> : null}
            {step.note ? (
              <p className="text-sm text-pretty text-muted-foreground">{step.note}</p>
            ) : null}
            {step.capacity ? (
              <ul className="grid grid-cols-2 gap-2">
                {step.capacity.map((criterion) => (
                  <li
                    key={criterion.title}
                    className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-foreground">
                      <span aria-hidden="true" className="mr-1.5 text-muted-foreground">
                        {criterion.letter}
                      </span>
                      {criterion.title}
                    </span>
                    <span className="text-xs text-pretty text-muted-foreground">
                      {criterion.description}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {step.important ? (
              <Callout tone="orange" title="Importante">
                {step.important}
              </Callout>
            ) : null}
            {step.ifIncapable ? (
              <p className="text-sm text-pretty text-muted-foreground">
                <strong className="font-semibold text-foreground">Se incapaz:</strong>{' '}
                {step.ifIncapable}
              </p>
            ) : null}
          </Section>
        ))}
      </div>
    </div>
  );
}

function PhraseList({
  title,
  items,
  kind,
}: {
  title: string;
  items: readonly string[];
  kind: 'use' | 'avoid';
}) {
  const Icon = kind === 'use' ? CheckCircle : XCircle;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((phrase) => (
          <li key={phrase} className="flex items-start gap-2 text-[0.9375rem] text-foreground">
            <Icon
              aria-hidden="true"
              className={
                kind === 'use'
                  ? 'mt-0.5 size-4 shrink-0 text-muted-foreground'
                  : 'mt-0.5 size-4 shrink-0 text-tone-red'
              }
            />
            <span className="text-pretty">{phrase}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Comunicar — frase de abertura, REDMAP, NURSE, frases e situações de alerta. */
export function CommunicateSection() {
  return (
    <div className="flex flex-col gap-4">
      <Lead>{COMMUNICATE_SUBTITLE}</Lead>
      <Callout tone="gray" icon={<ChatCircleText />} title={OPENING_PHRASE.title}>
        {OPENING_PHRASE.text}
      </Callout>
      <div className="flex flex-col">
        <Section title={REDMAP_TITLE}>
          <NumberedSteps steps={REDMAP_STEPS} />
        </Section>
        <Section title={NURSE_TITLE}>
          <NumberedSteps steps={NURSE_STEPS} />
        </Section>
        <Section title={COMMUNICATE_HEADINGS.phrases}>
          <PhraseList title={COMMUNICATE_HEADINGS.use} items={PHRASES_TO_USE} kind="use" />
          <PhraseList title={COMMUNICATE_HEADINGS.avoid} items={PHRASES_TO_AVOID} kind="avoid" />
        </Section>
        <Section title={COMMUNICATE_HEADINGS.alerts}>
          <BulletList items={ALERT_SITUATIONS} />
        </Section>
      </div>
    </div>
  );
}

function symptomTab(value: string): SymptomTab | undefined {
  return SYMPTOM_TABS.find(({ id }) => id === value)?.id;
}

/** Manejar — dor, dispneia, náusea, delirium, sedação paliativa e fase final. */
export function SymptomsSection({ state, dispatch }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <Lead>{SYMPTOMS_SUBTITLE}</Lead>
      <Tabs
        value={state.symptomTab}
        onValueChange={(value) => {
          const tab = symptomTab(value);
          if (tab) dispatch({ type: 'select-symptom-tab', tab });
        }}
      >
        <TabsList aria-label="Sintoma">
          {SYMPTOM_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SYMPTOM_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <ContentBlocks blocks={SYMPTOM_PAGES[tab.id]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Mitos e verdades — um aberto por vez, agrupados como no ANY. */
export function MythsSection({ state, dispatch }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      {MYTH_CATEGORIES.map((category) => (
        <section key={category.id} aria-label={category.label} className="flex flex-col gap-1">
          <SubHeading>{category.label}</SubHeading>
          <div className="flex flex-col">
            {MYTHS.filter((myth) => myth.category === category.id).map((myth) => (
              <Section
                key={myth.id}
                open={state.myth === myth.id}
                onOpenChange={(open) =>
                  dispatch(open ? { type: 'open-myth', id: myth.id } : { type: 'close-myth' })
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {myth.id}
                    </span>
                    {myth.title}
                  </span>
                }
              >
                <div className="flex flex-col gap-2">
                  <Badge variant={myth.isMyth ? 'gray' : 'blue'}>
                    {myth.isMyth ? 'Mito' : 'Verdade'}
                  </Badge>
                  <p className="text-[0.9375rem] font-medium text-pretty text-foreground">
                    {myth.statement}
                  </p>
                  <p className="text-[0.9375rem] text-pretty text-muted-foreground">
                    {myth.explanation}
                  </p>
                </div>
              </Section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ReferencesSection() {
  return (
    <div className="flex flex-col gap-4">
      {PALLIATIVE_REFERENCES.map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-1.5">
          <SubHeading>{group.title}</SubHeading>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-pretty text-muted-foreground">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
