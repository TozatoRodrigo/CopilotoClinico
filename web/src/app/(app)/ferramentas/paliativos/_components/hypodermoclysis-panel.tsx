'use client';

import type { Dispatch, ReactNode } from 'react';
import { MagnifyingGlass, Warning } from '@phosphor-icons/react';
import {
  COMPATIBILITY_DRUGS,
  COMPATIBILITY_LEGEND,
  COMPATIBILITY_MATRIX,
  compatibilityDisagreements,
  compatibilityGaps,
  DEVICE_COLUMNS,
  DEVICE_NOTE,
  DEXAMETHASONE_NOTE,
  HYPODERMOCLYSIS_COMPLICATIONS,
  HYPODERMOCLYSIS_CONTRAINDICATIONS,
  HYPODERMOCLYSIS_HEADINGS,
  HYPODERMOCLYSIS_INDICATIONS,
  HYPODERMOCLYSIS_NOTE,
  HYPODERMOCLYSIS_PROCEDURE,
  HYPODERMOCLYSIS_SITE_WARNING,
  HYPODERMOCLYSIS_TABS,
  MEDICATION_FIELDS,
  NO_MEDICATION_FOUND,
  PUNCTURE_DEVICES,
  PUNCTURE_SITES,
  searchSubcutaneousMedications,
  SOLUTION_COLUMNS,
  SUBCUTANEOUS_MEDICATIONS_SOURCE,
  SUBCUTANEOUS_SOLUTIONS,
  type CompatibilityCell,
  type HypodermoclysisTab,
} from '@clinical-tools/palliative/hypodermoclysis';
import type { PalliativeAction, PalliativeState } from '@clinical-tools/palliative/state';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
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
import { BulletList, NoteCallout, NumberedSteps, SubHeading } from './blocks';

interface PanelProps {
  state: PalliativeState;
  dispatch: Dispatch<PalliativeAction>;
}

function Indications() {
  return (
    <div className="flex flex-col gap-3">
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.indications}</SubHeading>
      <BulletList items={HYPODERMOCLYSIS_INDICATIONS} />
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.contraindications}</SubHeading>
      <BulletList items={HYPODERMOCLYSIS_CONTRAINDICATIONS} emphasis="risco" />
      <NoteCallout note={HYPODERMOCLYSIS_SITE_WARNING} />
    </div>
  );
}

function Technique() {
  return (
    <div className="flex flex-col gap-3">
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.sites}</SubHeading>
      <ul className="grid grid-cols-2 gap-2">
        {PUNCTURE_SITES.map((site, index) => (
          <li
            key={site.region}
            className={cn(
              'flex flex-col gap-0.5 rounded-md border border-border px-3 py-2',
              // A última (coxa) ocupa a linha inteira, como no ANY.
              index === PUNCTURE_SITES.length - 1 && 'col-span-2',
            )}
          >
            <span className="text-sm font-medium text-foreground">{site.region}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{site.volume}</span>
          </li>
        ))}
      </ul>
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.devices}</SubHeading>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{DEVICE_COLUMNS.device}</TableHead>
              <TableHead scope="col">{DEVICE_COLUMNS.gauge}</TableHead>
              <TableHead scope="col">{DEVICE_COLUMNS.dwell}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PUNCTURE_DEVICES.map((device) => (
              <TableRow key={device.device}>
                <TableCell>{device.device}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{device.gauge}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {device.dwell}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
      <p className="text-xs text-pretty text-muted-foreground">{DEVICE_NOTE}</p>
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.procedure}</SubHeading>
      <NumberedSteps steps={HYPODERMOCLYSIS_PROCEDURE} />
    </div>
  );
}

function Medications({ state, dispatch }: PanelProps) {
  const medications = searchSubcutaneousMedications(state.medicationQuery);
  return (
    <div className="flex flex-col gap-3">
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.medications}</SubHeading>
      <div className="relative">
        <label htmlFor="paliativos-busca-medicamento" className="sr-only">
          Buscar medicamento por via subcutânea
        </label>
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="paliativos-busca-medicamento"
          type="search"
          autoComplete="off"
          value={state.medicationQuery}
          onChange={(event) => dispatch({ type: 'search-medication', query: event.target.value })}
          placeholder="Buscar medicamento"
          className="h-11 pl-9 text-base max-sm:h-11 md:text-sm"
        />
      </div>
      {medications.length === 0 ? (
        <p role="status" className="py-4 text-center text-sm text-muted-foreground">
          {NO_MEDICATION_FOUND}
        </p>
      ) : (
        <ul aria-label="Medicações por via subcutânea" className="flex flex-col gap-2">
          {medications.map((medication) => (
            <li
              key={medication.name}
              className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5"
            >
              <h4 className="text-sm font-semibold text-foreground">{medication.name}</h4>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted-foreground">{MEDICATION_FIELDS.dose}</dt>
                <dd className="text-foreground">{medication.dose}</dd>
                <dt className="text-muted-foreground">{MEDICATION_FIELDS.dilution}</dt>
                <dd className="text-foreground">{medication.dilution}</dd>
              </dl>
              {medication.note ? (
                <p className="text-xs text-pretty text-muted-foreground">{medication.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{SUBCUTANEOUS_MEDICATIONS_SOURCE}</p>
    </div>
  );
}

function Solutions() {
  return (
    <div className="flex flex-col gap-3">
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.solutions}</SubHeading>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{SOLUTION_COLUMNS.solution}</TableHead>
              <TableHead scope="col">{SOLUTION_COLUMNS.maxDose}</TableHead>
              <TableHead scope="col">{SOLUTION_COLUMNS.guidance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SUBCUTANEOUS_SOLUTIONS.map((solution) => (
              <TableRow key={solution.solution}>
                <TableCell className="font-medium">{solution.solution}</TableCell>
                <TableCell className="tabular-nums">{solution.maxDose}</TableCell>
                <TableCell className="text-muted-foreground">{solution.guidance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </div>
  );
}

const CELL_TEXT: Record<CompatibilityCell, { short: string; spoken: string }> = {
  C: { short: 'C', spoken: 'compatível' },
  I: { short: 'I', spoken: 'incompatível' },
  'sem-dado': { short: 's/d', spoken: 'sem dado, aguarda revisão' },
};

function Compatibility() {
  const gaps = compatibilityGaps().length;
  const disagreements = compatibilityDisagreements().length;
  return (
    <div className="flex flex-col gap-3">
      <SubHeading>{HYPODERMOCLYSIS_HEADINGS.compatibility}</SubHeading>
      <Callout tone="orange" icon={<Warning />} title="Matriz aguardando revisão clínica">
        A matriz de origem tem 14 valores por linha para 15 colunas: {gaps} células ficam marcadas
        “s/d” (sem dado) até a revisão. Em {disagreements} pares a linha e a coluna dizem coisas
        diferentes.
      </Callout>
      <TableWrapper>
        <Table className="min-w-[640px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead
                scope="col"
                className="sticky left-0 z-10 bg-background"
                aria-label="Medicamento"
              />
              {COMPATIBILITY_DRUGS.map((drug) => (
                <TableHead key={drug.id} scope="col" className="px-1 text-center text-xs">
                  <abbr title={drug.name} className="no-underline">
                    {drug.abbreviation}
                  </abbr>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPATIBILITY_DRUGS.map((row) => (
              <TableRow key={row.id}>
                <TableHead
                  scope="row"
                  className={cn(
                    'sticky left-0 z-10 bg-background text-xs font-medium',
                    row.id === 'dexametasona' ? 'text-tone-red' : 'text-foreground',
                  )}
                >
                  {row.name}
                </TableHead>
                {COMPATIBILITY_MATRIX[row.id].map((cell, index) => {
                  const column = COMPATIBILITY_DRUGS[index];
                  const text = CELL_TEXT[cell];
                  return (
                    <TableCell
                      key={column?.id ?? index}
                      title={`${row.name} × ${column?.name ?? ''}: ${text.spoken}`}
                      className={cn(
                        'px-1 text-center font-semibold',
                        cell === 'I' && 'text-tone-red',
                        cell === 'sem-dado' && 'bg-tone-orange-bg text-tone-orange-ink',
                      )}
                    >
                      <span aria-hidden="true">{text.short}</span>
                      <span className="sr-only">{text.spoken}</span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
      <NoteCallout note={DEXAMETHASONE_NOTE} />
      <p className="text-xs text-muted-foreground">
        {COMPATIBILITY_LEGEND} s/d = sem dado — aguarda revisão.
      </p>
    </div>
  );
}

function Complications() {
  return (
    <ul className="flex flex-col gap-2">
      {HYPODERMOCLYSIS_COMPLICATIONS.map((item) => (
        <li
          key={item.title}
          className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2.5"
        >
          <span className="text-sm font-semibold text-foreground">{item.title}</span>
          <span className="text-sm text-pretty text-muted-foreground">{item.description}</span>
        </li>
      ))}
    </ul>
  );
}

const PANELS: Record<HypodermoclysisTab, (props: PanelProps) => ReactNode> = {
  indicacoes: Indications,
  tecnica: Technique,
  medicacoes: Medications,
  solucoes: Solutions,
  compatibilidade: Compatibility,
  complicacoes: Complications,
};

function hypodermoclysisTab(value: string): HypodermoclysisTab | undefined {
  return HYPODERMOCLYSIS_TABS.find(({ id }) => id === value)?.id;
}

/** Hipodermóclise: indicações, técnica, as 19 drogas, soluções, compatibilidade e complicações. */
export function HypodermoclysisPanel({ state, dispatch }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <NoteCallout note={HYPODERMOCLYSIS_NOTE} />
      <Tabs
        value={state.hypodermoclysisTab}
        onValueChange={(value) => {
          const tab = hypodermoclysisTab(value);
          if (tab) dispatch({ type: 'select-hypodermoclysis-tab', tab });
        }}
      >
        <TabsList aria-label="Seção da hipodermóclise">
          {HYPODERMOCLYSIS_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {HYPODERMOCLYSIS_TABS.map((tab) => {
          const Panel = PANELS[tab.id];
          return (
            <TabsContent key={tab.id} value={tab.id}>
              <Panel state={state} dispatch={dispatch} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
