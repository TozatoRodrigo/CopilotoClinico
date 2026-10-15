'use client';

import { useCallback, useMemo, type ElementType } from 'react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  CaretRight,
  ClipboardText,
  Flask,
  GridFour,
  ListChecks,
  Path,
  Pulse,
  SignOut,
  Virus,
} from '@phosphor-icons/react';
import {
  ALARM_SIGNS,
  alarmCountLabel,
  CALCULATORS_PAGE,
  DENGUE_GROUP_INFO,
  DENGUE_GROUPS,
  DENGUE_HOME,
  DENGUE_NAV,
  DENGUE_PROVENANCE,
  DENGUE_REFERENCES,
  DENGUE_REFERENCES_SHORT,
  DIRECT_CLASSIFICATION,
  DISCHARGE_PAGE,
  EFASD_PAGE,
  EXAMS_PAGE,
  GRAVITY_SIGNS,
  GROUP_PAGES,
  GROUP_SCREEN,
  GROUPS_HUB,
  RISK_CONDITIONS,
  TRAIL_GROUP_STEP,
  TRAIL_GROUPS_WITH_DISCHARGE,
  TRAIL_INPATIENT_NOTE,
  TRAIL_STEP_1,
  TRAIL_STEP_2,
  TRAIL_STEP_3,
  TRAIL_STEP_5,
  TRAIL_STEP_COUNT,
  TRAIL_STEP_TITLES,
  WEIGHT_SCREENS,
  type DengueBlock,
  type DengueGroup,
  type DengueScreen,
  type DengueScreenContent,
} from '@clinical-tools/dengue/content';
import { buildDengueChartNote, deriveDengue, type DengueView } from '@clinical-tools/dengue/derive';
import {
  dengueReducer,
  groupOnScreen,
  hasDengueProgress,
  INITIAL_DENGUE_STATE,
  parseDengueState,
  type DengueAction,
  type DengueState,
} from '@clinical-tools/dengue/state';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { useToolFavorites } from '@/lib/tool-favorites';
import { toneBg, toneInk } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '../../_components/tool-entries';
import {
  ContentBlocks,
  ContentSection,
  GroupBadge,
  SignChecklist,
  ToneBadge,
  TouchTitle,
  type BlockContext,
} from './content-blocks';
import { useAdultWeight, useSessionValue, DENGUE_SESSION_KEY } from './dengue-session';
import { PatientMessagePanel } from './patient-message-panel';

const TOOL_NAME = 'Dengue';

type Dispatch = (action: DengueAction) => void;

interface ScreenProps {
  state: DengueState;
  view: DengueView;
  dispatch: Dispatch;
  context: BlockContext;
}

/** "14:05", no fuso do aparelho. */
function clock(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function SectionNav({
  screen,
  onOpen,
}: {
  screen: DengueScreen;
  onOpen: (s: DengueScreen) => void;
}) {
  const isActive = (target: DengueScreen) => {
    if (target === 'trilha-1') return screen.startsWith('trilha-');
    if (target === 'grupos') return screen === 'grupos' || screen.startsWith('grupo-');
    return screen === target;
  };
  return (
    <nav aria-label="Seções da dengue">
      <ul className="flex flex-wrap gap-1.5">
        {DENGUE_NAV.map((item) => {
          const active = isActive(item.screen);
          return (
            <li key={item.screen}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onOpen(item.screen)}
                className={cn(
                  'flex min-h-10 items-center rounded-md border px-3 text-sm transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  active
                    ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                    : 'border-border bg-background text-foreground hover:bg-hover',
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function TrailHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">
        Passo {step} de {TRAIL_STEP_COUNT}
      </p>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function TrailNav({
  back,
  next,
  open,
}: {
  back?: { label: string; screen: DengueScreen };
  next?: { label: string; screen: DengueScreen };
  open: (screen: DengueScreen) => void;
}) {
  return (
    <div className="flex gap-2 border-t border-border pt-4">
      {back ? (
        <Button type="button" variant="outline" onClick={() => open(back.screen)}>
          <ArrowLeft aria-hidden="true" />
          {back.label}
        </Button>
      ) : null}
      {next ? (
        <Button type="button" className="flex-1" onClick={() => open(next.screen)}>
          {next.label}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function PageContent({ page, context }: { page: DengueScreenContent; context: BlockContext }) {
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle title={page.title} subtitle={page.subtitle} />
      <ContentBlocks blocks={page.intro} context={context} />
      <div className="flex flex-col gap-1">
        {page.sections.map((section) => (
          <ContentSection key={section.title} section={section} context={context} />
        ))}
      </div>
      <ContentBlocks blocks={page.outro} context={context} />
    </div>
  );
}

/** Botões de reclassificação do grupo, com o rótulo do ANY. */
function ReclassifySection({ group, context }: { group: DengueGroup; context: BlockContext }) {
  const buttons = (GROUP_PAGES[group].outro ?? []).filter(
    (block): block is Extract<DengueBlock, { kind: 'reclassify' }> => block.kind === 'reclassify',
  );
  return (
    <section
      aria-labelledby={`reclassificar-${group}`}
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <h3 id={`reclassificar-${group}`} className="text-sm font-semibold text-foreground">
        Reclassificar
      </h3>
      <ContentBlocks blocks={buttons} context={context} />
    </section>
  );
}

function ChartNote({
  group,
  state,
  view,
}: {
  group: DengueGroup;
  state: DengueState;
  view: DengueView;
}) {
  return <CopyToChartButton text={buildDengueChartNote({ group, state, view })} />;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

const HOME_ICON: Record<string, ElementType> = {
  grupos: GridFour,
  calculadoras: Calculator,
  efasd: Pulse,
  exames: Flask,
  classificacao: ListChecks,
  alta: SignOut,
  referencias: BookOpen,
};

function HomeEntry({
  icon: Icon,
  title,
  description,
  onClick,
  primary = false,
}: {
  icon: ElementType;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
          primary ? 'border-primary' : 'border-border',
        )}
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
  view,
  weight,
  open,
  restart,
}: {
  state: DengueState;
  view: DengueView;
  weight: string;
  open: (screen: DengueScreen) => void;
  restart: () => void;
}) {
  const inProgress = weight.trim() !== '' || hasDengueProgress(state);
  const { current } = view;
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="orange">{DENGUE_HOME.adultWarning}</Callout>
      {current ? (
        <Callout
          tone={RESULT_TONE[DENGUE_GROUP_INFO[current.group].tone]}
          title={`Último grupo: ${current.group} — ${DENGUE_GROUP_INFO[current.group].label}`}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => open(GROUP_SCREEN[current.group])}
            >
              Abrir manejo
            </Button>
          }
        >
          Atribuído às {clock(current.at)}.
        </Callout>
      ) : null}
      <ul className="flex flex-col gap-2">
        <HomeEntry
          icon={Path}
          primary
          title={DENGUE_HOME.trail.title}
          description={DENGUE_HOME.trail.description}
          onClick={() => open('trilha-1')}
        />
        {DENGUE_HOME.entries.map((entry) => (
          <HomeEntry
            key={entry.screen}
            icon={HOME_ICON[entry.screen] ?? CaretRight}
            title={entry.label}
            description={entry.description}
            onClick={() => open(entry.screen)}
          />
        ))}
      </ul>
      {inProgress ? (
        <div>
          <Button type="button" variant="ghost" onClick={restart}>
            <ArrowCounterClockwise aria-hidden="true" />
            Novo paciente
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trilha
// ---------------------------------------------------------------------------

function AlarmNotice({ count, text }: { count: number; text: string }) {
  if (count === 0) return null;
  return (
    <Callout tone="red" title={alarmCountLabel(count)}>
      {text}
    </Callout>
  );
}

function TrailStep({ state, view, dispatch, context }: ScreenProps) {
  const open = context.open;
  switch (state.screen) {
    case 'trilha-1':
      return (
        <div className="flex flex-col gap-4">
          <TrailHeader step={1} title={TRAIL_STEP_TITLES[1]} />
          <ContentBlocks blocks={TRAIL_STEP_1} context={context} />
          <TrailNav
            back={{ label: 'Início', screen: 'inicio' }}
            next={{ label: 'Próximo', screen: 'trilha-2' }}
            open={open}
          />
        </div>
      );
    case 'trilha-2':
      return (
        <div className="flex flex-col gap-4">
          <TrailHeader step={2} title={TRAIL_STEP_TITLES[2]} />
          <p className="text-sm text-muted-foreground">{TRAIL_STEP_2.hint}</p>
          <ContentBlocks
            blocks={[{ kind: 'paragraph', text: TRAIL_STEP_2.rule }]}
            context={context}
          />
          <SignChecklist
            legend={TRAIL_STEP_TITLES[2]}
            items={ALARM_SIGNS}
            checked={state.alarms}
            onToggle={(id) => dispatch({ type: 'toggle-alarm', id })}
          />
          <AlarmNotice count={state.alarms.length} text={TRAIL_STEP_2.alarmNotice} />
          <TrailNav
            back={{ label: 'Voltar', screen: 'trilha-1' }}
            next={{ label: 'Próximo', screen: 'trilha-3' }}
            open={open}
          />
        </div>
      );
    case 'trilha-3':
      return (
        <TrailClassification state={state} view={view} dispatch={dispatch} context={context} />
      );
    case 'trilha-4': {
      const group = state.trailGroup ?? 'A';
      const withDischarge = TRAIL_GROUPS_WITH_DISCHARGE.includes(group);
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">Passo 4 de {TRAIL_STEP_COUNT}</p>
            <h2 className="text-xl font-semibold text-foreground">
              Grupo {group} — {DENGUE_GROUP_INFO[group].label}
            </h2>
          </div>
          <ContentBlocks blocks={TRAIL_GROUP_STEP[group]} context={context} />
          {withDischarge ? null : <Callout tone="gray">{TRAIL_INPATIENT_NOTE}</Callout>}
          <ChartNote group={group} state={state} view={view} />
          <ReclassifySection group={group} context={context} />
          <TrailNav
            back={{ label: 'Voltar', screen: 'trilha-3' }}
            next={withDischarge ? { label: 'Próximo', screen: 'trilha-5' } : undefined}
            open={open}
          />
        </div>
      );
    }
    case 'trilha-5':
      return (
        <div className="flex flex-col gap-4">
          <TrailHeader step={5} title={TRAIL_STEP_TITLES[5]} />
          <ContentBlocks blocks={TRAIL_STEP_5} context={context} />
          <TrailNav
            back={{ label: 'Voltar', screen: 'trilha-4' }}
            next={{ label: 'Início', screen: 'inicio' }}
            open={open}
          />
        </div>
      );
    default:
      return null;
  }
}

function TrailClassification({ state, view, dispatch, context }: ScreenProps) {
  const { classification } = view;
  const tone = RESULT_TONE[DENGUE_GROUP_INFO[classification.group].tone];
  const alarms = ALARM_SIGNS.filter(({ id }) => state.alarms.includes(id));
  const canReassess = state.gravity.length > 0 || state.risks.length > 0;
  return (
    <div className="flex flex-col gap-5">
      <TrailHeader step={3} title={TRAIL_STEP_TITLES[3]} />
      <p className="text-sm text-muted-foreground">{TRAIL_STEP_3.hint}</p>
      <SignChecklist
        legend={TRAIL_STEP_3.gravityTitle}
        tone="critical"
        items={GRAVITY_SIGNS}
        checked={state.gravity}
        onToggle={(id) => dispatch({ type: 'toggle-gravity', id })}
      />
      <section aria-labelledby="dengue-alarmes-resumo" className="flex flex-col gap-1.5">
        <h3 id="dengue-alarmes-resumo" className="text-sm font-semibold text-tone-orange">
          {TRAIL_STEP_3.alarmTitle}
        </h3>
        {alarms.length === 0 ? (
          <Callout tone="gray">{TRAIL_STEP_3.noAlarms}</Callout>
        ) : (
          <Callout
            tone="orange"
            title={`${alarms.length} ${alarms.length === 1 ? TRAIL_STEP_3.alarmsFound.singular : TRAIL_STEP_3.alarmsFound.plural}`}
          >
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {alarms.map(({ id, label }) => (
                <li key={id}>{label}</li>
              ))}
            </ul>
          </Callout>
        )}
      </section>
      <SignChecklist
        legend={TRAIL_STEP_3.riskTitle}
        items={RISK_CONDITIONS}
        checked={state.risks}
        onToggle={(id) => dispatch({ type: 'toggle-risk', id })}
      />

      {/* ADR-017: resultado ao vivo, sem botão "Classificar". */}
      <section aria-label={TRAIL_STEP_3.resultTitle} className="flex flex-col gap-3">
        <div
          role="status"
          aria-live="polite"
          data-group={classification.group}
          className={cn('flex flex-col gap-1.5 rounded-lg px-4 py-3', toneBg[tone])}
        >
          <span className="text-sm text-muted-foreground">{TRAIL_STEP_3.resultTitle}</span>
          <GroupBadge group={classification.group} className="w-fit text-base" />
          <p
            className={cn(
              'text-[0.9375rem] text-pretty',
              tone === 'gray' ? 'text-foreground' : toneInk[tone],
            )}
          >
            {classification.reason}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            onClick={() => dispatch({ type: 'open-trail-group', at: Date.now() })}
          >
            {TRAIL_STEP_3.openGroup} {classification.group}
            <ArrowRight aria-hidden="true" />
          </Button>
          <ChartNote group={classification.group} state={state} view={view} />
          <Button
            type="button"
            variant="ghost"
            disabled={!canReassess}
            onClick={() => dispatch({ type: 'reassess' })}
          >
            <ArrowCounterClockwise aria-hidden="true" />
            {TRAIL_STEP_3.reassess}
          </Button>
        </div>
      </section>
      <TrailNav back={{ label: 'Voltar', screen: 'trilha-2' }} open={context.open} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grupos, classificação direta e manejo
// ---------------------------------------------------------------------------

function GroupsHub({ open }: { open: (screen: DengueScreen) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle title={GROUPS_HUB.title} subtitle={GROUPS_HUB.description} />
      <ul className="grid grid-cols-2 gap-2">
        {DENGUE_GROUPS.map((group) => (
          <li key={group}>
            <button
              type="button"
              onClick={() => open(GROUP_SCREEN[group])}
              className="flex min-h-16 w-full flex-col items-start gap-1 rounded-md border border-border px-3 py-2.5 text-left transition-colors duration-100 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <span className="text-[0.9375rem] font-medium text-foreground">Grupo {group}</span>
              <span className="text-xs text-muted-foreground">
                {DENGUE_GROUP_INFO[group].hubDescription}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectClassification({ state, dispatch, context }: ScreenProps) {
  const { alarmSection, tourniquetSection, questions } = DIRECT_CLASSIFICATION;
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle title={DIRECT_CLASSIFICATION.title} subtitle={DIRECT_CLASSIFICATION.subtitle} />
      <div className="flex flex-col gap-1">
        <Disclosure
          title={<TouchTitle>{alarmSection.title}</TouchTitle>}
          meta={<ToneBadge badge={alarmSection.badge} />}
          defaultOpen
          className="border-b border-border pb-1"
        >
          <div className="flex flex-col gap-3">
            <ContentBlocks
              blocks={[{ kind: 'paragraph', text: alarmSection.text }]}
              context={context}
            />
            <SignChecklist
              legend={alarmSection.title}
              items={ALARM_SIGNS}
              checked={state.alarms}
              onToggle={(id) => dispatch({ type: 'toggle-alarm', id })}
            />
            <AlarmNotice count={state.alarms.length} text={alarmSection.alarmNotice} />
          </div>
        </Disclosure>
        <ContentSection section={tourniquetSection} context={context} />
        <Disclosure title={<TouchTitle>{DIRECT_CLASSIFICATION.flowTitle}</TouchTitle>} defaultOpen>
          <ol className="flex flex-col gap-4">
            {questions
              .filter(({ step }) => step <= state.directStep)
              .map((question) => (
                <li key={question.step} className="flex flex-col gap-2">
                  <Callout tone={RESULT_TONE[question.tone]} title={question.title}>
                    {question.question}
                    {question.detail ? (
                      <span className="block text-xs">{question.detail}</span>
                    ) : null}
                  </Callout>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={question.yes.group === 'D' ? 'destructive' : 'outline'}
                      className="min-h-11"
                      onClick={() =>
                        dispatch({
                          type: 'answer-direct',
                          step: question.step,
                          present: true,
                          at: Date.now(),
                        })
                      }
                    >
                      {question.yes.label}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() =>
                        dispatch({
                          type: 'answer-direct',
                          step: question.step,
                          present: false,
                          at: Date.now(),
                        })
                      }
                    >
                      {question.no.label}
                    </Button>
                  </div>
                </li>
              ))}
          </ol>
        </Disclosure>
      </div>
    </div>
  );
}

function GroupPage({ group, state, view, context }: ScreenProps & { group: DengueGroup }) {
  const page = GROUP_PAGES[group];
  const outro = page.outro ?? [];
  const isCurrent = view.current?.group === group;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold text-foreground">{page.title}</h2>
        <GroupBadge group={group} className="w-fit" />
        {page.subtitle ? <p className="text-sm text-muted-foreground">{page.subtitle}</p> : null}
        {isCurrent && view.current ? (
          <p className="text-xs text-muted-foreground">
            Grupo atual do paciente desde as {clock(view.current.at)}.
          </p>
        ) : null}
      </div>
      <ContentBlocks blocks={page.intro} context={context} />
      <div className="flex flex-col gap-1">
        {page.sections.map((section) => (
          <ContentSection key={section.title} section={section} context={context} />
        ))}
      </div>
      <ContentBlocks
        blocks={outro.filter((block) => block.kind !== 'reclassify')}
        context={context}
      />
      {isCurrent ? <ChartNote group={group} state={state} view={view} /> : null}
      <ReclassifySection group={group} context={context} />
    </div>
  );
}

function ExamsPage({ context }: { context: BlockContext }) {
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle title={EXAMS_PAGE.title} subtitle={EXAMS_PAGE.subtitle} />
      <div className="flex flex-col gap-1">
        {EXAMS_PAGE.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            {section.heading ? (
              <h3 className="pt-3 text-sm font-semibold text-muted-foreground">
                {section.heading}
              </h3>
            ) : null}
            <ContentSection section={section} context={context} />
          </div>
        ))}
      </div>
    </div>
  );
}

function References() {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
      {DENGUE_REFERENCES.map((reference) => (
        <li key={reference} className="text-pretty">
          {reference}
        </li>
      ))}
    </ol>
  );
}

function ScreenBody(props: ScreenProps) {
  const { state, view, dispatch, context } = props;
  const { screen } = state;
  if (screen.startsWith('trilha-')) return <TrailStep {...props} />;
  const group = screen.startsWith('grupo-') ? groupOnScreen(state) : null;
  if (group) return <GroupPage {...props} group={group} />;
  switch (screen) {
    case 'grupos':
      return <GroupsHub open={context.open} />;
    case 'classificacao':
      return <DirectClassification {...props} />;
    case 'calculadoras':
      return <PageContent page={CALCULATORS_PAGE} context={context} />;
    case 'efasd':
      return <PageContent page={EFASD_PAGE} context={context} />;
    case 'exames':
      return <ExamsPage context={context} />;
    case 'alta':
      return (
        <div className="flex flex-col gap-4">
          <PageContent page={DISCHARGE_PAGE} context={context} />
          <PatientMessagePanel
            message={view.patientMessage}
            onGenerate={() => dispatch({ type: 'generate-patient-message', at: Date.now() })}
          />
        </div>
      );
    case 'referencias':
      return (
        <div className="flex flex-col gap-4">
          <ScreenTitle title="Referências" />
          <References />
        </div>
      );
    default:
      return null;
  }
}

/**
 * /ferramentas/dengue (CC-325): o DenguePath do ANY no design system. Toda
 * conta, texto clínico e regra vêm do motor (`@clinical-tools/dengue`); a
 * tela guarda o estado na aba e desenha.
 */
export function DengueScreen() {
  const favorites = useToolFavorites();
  const [state, setState] = useSessionValue<DengueState>(
    DENGUE_SESSION_KEY,
    parseDengueState,
    () => INITIAL_DENGUE_STATE,
  );
  const [weight, setWeight] = useAdultWeight();
  const dispatch = useCallback<Dispatch>(
    (action) => setState((current) => dengueReducer(current, action)),
    [setState],
  );
  const view = useMemo(() => deriveDengue(state, weight), [state, weight]);

  const open = useCallback(
    (screen: DengueScreen) => {
      dispatch({ type: 'open-screen', screen });
      window.scrollTo?.({ top: 0 });
    },
    [dispatch],
  );
  const context: BlockContext = {
    hydration: view.hydration,
    open,
    reclassify: (to) => {
      dispatch({ type: 'reclassify', to, at: Date.now() });
      window.scrollTo?.({ top: 0 });
    },
    hematocrit: {
      baseline: state.htBaseline,
      current: state.htCurrent,
      evaluation: view.hematocrit,
      onBaselineChange: (raw) => dispatch({ type: 'set-ht-baseline', raw }),
      onCurrentChange: (raw) => dispatch({ type: 'set-ht-current', raw }),
    },
  };

  return (
    <Page width="narrow">
      <PageHeader
        icon={Virus}
        iconTone="blue"
        title={TOOL_NAME}
        description="Classificação A–D, hidratação por peso e alta segura."
        actions={
          <FavoriteButton favoriteKey="tool:dengue" name={TOOL_NAME} favorites={favorites} />
        }
      />
      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <SectionNav screen={state.screen} onOpen={open} />
      </div>

      {WEIGHT_SCREENS.includes(state.screen) ? (
        <WeightField population="adulto" value={weight} onValueChange={setWeight} />
      ) : null}

      {state.screen === 'inicio' ? (
        <Home
          state={state}
          view={view}
          weight={weight}
          open={open}
          restart={() => {
            dispatch({ type: 'reset' });
            setWeight('');
          }}
        />
      ) : (
        <ScreenBody state={state} view={view} dispatch={dispatch} context={context} />
      )}

      <footer className="flex flex-col gap-2 border-t border-border pt-4">
        <Disclosure
          title={
            <TouchTitle>
              <ClipboardText className="size-4 text-muted-foreground" aria-hidden="true" />
              Referências
            </TouchTitle>
          }
          meta={DENGUE_REFERENCES_SHORT}
        >
          <References />
        </Disclosure>
        <ContentProvenanceNote provenance={DENGUE_PROVENANCE} />
      </footer>
    </Page>
  );
}
