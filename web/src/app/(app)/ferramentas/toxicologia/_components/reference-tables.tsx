'use client';

import { useState } from 'react';
import { Info, WarningCircle } from '@phosphor-icons/react';
import {
  isTableTabId,
  TABLE_TABS,
  type TableBlock,
  type TableRowHighlight,
  type TableTabId,
} from '@clinical-tools/toxicology/tables';
import { Callout } from '@/components/ui/callout';
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
import { useLocationHash } from './use-location-hash';

/** Ênfase em negrito; risco e atenção também na cor do tom (o rótulo é o texto da linha). */
const HIGHLIGHT_CLASS: Record<TableRowHighlight, string> = {
  critical: 'font-semibold text-tone-red',
  attention: 'font-semibold text-tone-orange',
  emphasis: 'font-semibold text-foreground',
};

function Block({ block }: { block: TableBlock }) {
  switch (block.kind) {
    case 'comparison':
      return (
        <div className="flex flex-col">
          {block.cards.map((card) => (
            <Disclosure
              key={card.title}
              title={card.title}
              className="border-b border-border py-1 last:border-0 [&>button]:min-h-12"
            >
              <dl className="flex flex-col divide-y divide-border text-sm">
                {card.rows.map((row) => (
                  <div key={row.label} className="flex gap-3 py-1.5">
                    <dt className="w-24 shrink-0 text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          ))}
        </div>
      );
    case 'note':
      return (
        <Callout
          tone={block.tone === 'critical' ? 'red' : 'gray'}
          icon={block.tone === 'critical' ? <WarningCircle /> : <Info />}
        >
          <strong className="font-semibold">{block.lead}:</strong> {block.text}
        </Callout>
      );
    case 'table':
      return (
        <div className="flex flex-col gap-2">
          {block.title ? (
            <h3 className="text-sm font-semibold text-foreground">{block.title}</h3>
          ) : null}
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{block.headers[0]}</TableHead>
                  <TableHead>{block.headers[1]}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell
                      className={cn(
                        'w-[38%] align-top whitespace-normal',
                        row.highlight ? HIGHLIGHT_CLASS[row.highlight] : 'text-foreground',
                      )}
                    >
                      {row.label}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal text-muted-foreground">
                      {row.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </div>
      );
  }
}

/**
 * Tabelas de consulta (CC-323): toxíndromes lado a lado, ECG, odores,
 * pupilas e bombas-relógio, como as abas do ANY. `#bombas` no endereço abre a
 * aba das bombas-relógio (link dos critérios de destino).
 */
export function ReferenceTables() {
  const hash = useLocationHash();
  const [chosen, setChosen] = useState<TableTabId | null>(null);
  const active: TableTabId = chosen ?? (isTableTabId(hash) ? hash : 'toxindromes');

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (isTableTabId(value)) setChosen(value);
      }}
    >
      <TabsList aria-label="Tabelas de consulta">
        {TABLE_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="max-sm:min-h-10">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABLE_TABS.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="flex flex-col gap-4 pt-2">
          {tab.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
