'use client';

import { useId, type Dispatch, type ReactNode } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { buildChartNote } from '@clinical-tools/chart-note';
import {
  buildEcogChartNote,
  buildPpsChartNote,
  ECOG_COLUMNS,
  ECOG_LEVELS,
  ECOG_NOTE,
  isPpiItemId,
  PPI_CALCULATOR,
  PPI_INTERPRETATION_NOTE,
  PPI_NOTE,
  PPS_COLUMNS,
  PPS_LEVELS,
  PPS_NOTE,
  ppsLevel,
  SCALE_TABS,
  type ScaleTab,
} from '@clinical-tools/palliative/scales';
import {
  ppiEvaluation,
  type PalliativeAction,
  type PalliativeState,
} from '@clinical-tools/palliative/state';
import { CalculatorResult } from '@/components/domain/clinical-tools/calculator-result';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { ReferenceSection } from '@/components/domain/clinical-tools/reference-section';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { NoteCallout } from './blocks';
import { HypodermoclysisPanel } from './hypodermoclysis-panel';
import { OpioidConverter } from './opioid-converter';

interface PanelProps {
  state: PalliativeState;
  dispatch: Dispatch<PalliativeAction>;
}

interface LevelOption<Value extends number> {
  value: Value;
  title: string;
  detail?: string;
}

/**
 * Escolha de um nível (ECOG, PPS): rádio nativo, alvo de 44 px, descrição
 * na própria opção para dispensar a tabela no celular.
 */
function LevelPicker<Value extends number>({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: readonly LevelOption<Value>[];
  selected: Value | null;
  onSelect: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-foreground">{legend}</legend>
      {options.map((option) => {
        const checked = selected === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
              checked
                ? 'border-primary bg-tone-blue-bg text-tone-blue-ink'
                : 'border-border bg-background text-foreground hover:bg-hover',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onSelect(option.value)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{option.title}</span>
              {option.detail ? (
                <span
                  className={cn(
                    'block text-xs text-pretty',
                    checked ? 'text-tone-blue-ink' : 'text-muted-foreground',
                  )}
                >
                  {option.detail}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function CopyRow({ text, children }: { text: string | null; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <CopyToChartButton text={text} />
      {children}
    </div>
  );
}

function EcogPanel({ state, dispatch }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <NoteCallout note={ECOG_NOTE} />
      <LevelPicker
        legend={`Nível ${ECOG_COLUMNS.grade}`}
        options={ECOG_LEVELS.map((level) => ({
          value: level.grade,
          title: `${level.grade} — ${level.label}`,
          detail: level.description || undefined,
        }))}
        selected={state.ecog}
        onSelect={(grade) => dispatch({ type: 'select-ecog', grade })}
      />
      <CopyRow text={state.ecog === null ? null : buildEcogChartNote(state.ecog)} />
    </div>
  );
}

function PpsPanel({ state, dispatch }: PanelProps) {
  const selected = state.pps === null ? null : ppsLevel(state.pps);
  return (
    <div className="flex flex-col gap-4">
      <NoteCallout note={PPS_NOTE} />
      <LevelPicker
        legend="Nível PPS"
        options={PPS_LEVELS.map((level) => ({
          value: level.percent,
          title: `${level.percent}%`,
          detail: PPS_COLUMNS.map(({ key }) => level[key])
            .filter(Boolean)
            .join(' · '),
        }))}
        selected={state.pps}
        onSelect={(percent) => dispatch({ type: 'select-pps', percent })}
      />
      {selected ? (
        <dl
          aria-label={`PPS ${selected.percent}%`}
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-surface-subtle px-3 py-2.5 text-sm"
        >
          {PPS_COLUMNS.filter(({ key }) => selected[key] !== '').map(({ key, label }) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{selected[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <CopyRow text={state.pps === null ? null : buildPpsChartNote(state.pps)} />
      <Disclosure title="Tabela completa do PPS" className="[&>button]:min-h-11">
        <TableWrapper>
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">PPS</TableHead>
                {PPS_COLUMNS.map(({ key, label }) => (
                  <TableHead key={key} scope="col">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PPS_LEVELS.map((level) => (
                <TableRow key={level.percent}>
                  <TableHead scope="row" className="font-semibold text-foreground tabular-nums">
                    {level.percent}%
                  </TableHead>
                  {PPS_COLUMNS.map(({ key }) => (
                    <TableCell key={key}>{level[key]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </Disclosure>
    </div>
  );
}

function PpiPanel({ state, dispatch }: PanelProps) {
  const evaluation = ppiEvaluation(state);
  const answered = Object.values(state.ppi).some(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <NoteCallout note={PPI_NOTE} />
      <ScoreItemList
        items={PPI_CALCULATOR.items}
        answers={state.ppi}
        onAnswer={(item, option) => {
          if (isPpiItemId(item)) dispatch({ type: 'answer-ppi', item, option });
        }}
      />
      <section aria-label="Resultado do PPI" className="flex flex-col gap-3">
        <CalculatorResult definition={PPI_CALCULATOR} evaluation={evaluation} />
        <CopyRow
          text={
            evaluation.status === 'complete' ? buildChartNote(PPI_CALCULATOR, evaluation) : null
          }
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => dispatch({ type: 'reset-ppi' })}
            disabled={!answered}
          >
            <ArrowCounterClockwise aria-hidden="true" />
            Limpar respostas
          </Button>
        </CopyRow>
      </section>
      <NoteCallout note={PPI_INTERPRETATION_NOTE} />
      <ReferenceSection reference={PPI_CALCULATOR.reference} />
    </div>
  );
}

const PANELS: Record<ScaleTab, (props: PanelProps) => ReactNode> = {
  ecog: EcogPanel,
  pps: PpsPanel,
  ppi: PpiPanel,
  opioides: OpioidConverter,
  hipodermoclise: HypodermoclysisPanel,
};

function scaleTab(value: string): ScaleTab | undefined {
  return SCALE_TABS.find(({ id }) => id === value)?.id;
}

/** Ferramentas e escalas: ECOG, PPS, PPI, conversor de opioides e hipodermóclise. */
export function ScalesSection({ state, dispatch }: PanelProps) {
  return (
    <Tabs
      value={state.scaleTab}
      onValueChange={(value) => {
        const tab = scaleTab(value);
        if (tab) dispatch({ type: 'select-scale-tab', tab });
      }}
    >
      <TabsList aria-label="Escala ou ferramenta">
        {SCALE_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SCALE_TABS.map((tab) => {
        const Panel = PANELS[tab.id];
        return (
          <TabsContent key={tab.id} value={tab.id}>
            <Panel state={state} dispatch={dispatch} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
