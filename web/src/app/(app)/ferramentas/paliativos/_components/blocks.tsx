'use client';

import type { ReactNode } from 'react';
import { Info, Lightbulb, Warning, WarningOctagon } from '@phosphor-icons/react';
import type {
  ClinicalNote,
  ContentBlock,
  MedicationColumns,
  MedicationRow,
  NoteKind,
  TimedSign,
  TitledText,
} from '@clinical-tools/palliative/content';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import type { Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Peças de conteúdo do roteiro de paliativos (CC-329). O motor diz o peso do
 * destaque e a tela escolhe o tom (ADR-017): a nota neutra fica cinza (o
 * verde do ANY é "conduta confirmada" no Copiloto), informação azul, atenção
 * laranja e risco vermelho. O título vai sempre junto: estado nunca só por cor.
 */
export const NOTE_TONE: Record<NoteKind, Tone> = {
  nota: 'gray',
  informacao: 'blue',
  atencao: 'orange',
  risco: 'red',
};

const NOTE_ICON: Record<NoteKind, ReactNode> = {
  nota: <Lightbulb />,
  informacao: <Info />,
  atencao: <Warning />,
  risco: <WarningOctagon />,
};

export function NoteCallout({ note, className }: { note: ClinicalNote; className?: string }) {
  return (
    <Callout
      tone={NOTE_TONE[note.kind]}
      icon={NOTE_ICON[note.kind]}
      title={note.title}
      className={className}
    >
      {note.text}
    </Callout>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground">{children}</h3>;
}

export function BulletList({ items, emphasis }: { items: readonly string[]; emphasis?: 'risco' }) {
  return (
    <ul
      className={cn(
        'flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] text-foreground',
        emphasis === 'risco' && 'marker:text-tone-red',
      )}
    >
      {items.map((item) => (
        <li key={item} className="text-pretty">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Passos numerados (REDMAP, NURSE, técnica da hipodermóclise). */
export function NumberedSteps({ steps }: { steps: readonly TitledText[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3 rounded-md border border-border px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-gray-tag text-xs font-semibold text-tone-gray-ink tabular-nums"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{step.title}</span>
            <span className="block text-sm text-pretty text-muted-foreground">
              {step.description}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MedicationTable({
  columns,
  rows,
}: {
  columns: MedicationColumns;
  rows: readonly MedicationRow[];
}) {
  return (
    <TableWrapper>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{columns.name}</TableHead>
            <TableHead scope="col">{columns.dose}</TableHead>
            {columns.detail ? <TableHead scope="col">{columns.detail}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="tabular-nums">{row.dose}</TableCell>
              {columns.detail ? (
                <TableCell className="text-muted-foreground">{row.detail ?? ''}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}

function SignsTable({ rows, caption }: { rows: readonly TimedSign[]; caption: string }) {
  return (
    <TableWrapper>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.sign}>
              <TableCell>{row.sign}</TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {row.time}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'note':
      return <NoteCallout note={block.note} />;
    case 'heading':
      return <SubHeading>{block.text}</SubHeading>;
    case 'text':
      return <p className="text-sm text-muted-foreground">{block.text}</p>;
    case 'list':
      return <BulletList items={block.items} emphasis={block.emphasis} />;
    case 'medications':
      return <MedicationTable columns={block.columns} rows={block.rows} />;
    case 'signs':
      return <SignsTable rows={block.rows} caption={block.caption} />;
    case 'group':
      return (
        <Disclosure
          title={
            <span className="flex items-center gap-2">
              <Badge variant="gray">Degrau {block.badge}</Badge>
              {block.title}
            </span>
          }
          className="border-b border-border last:border-b-0 [&>button]:min-h-11"
          contentClassName="pl-0"
        >
          <div className="flex flex-col gap-3 pt-1">
            <ContentBlocks blocks={block.blocks} />
          </div>
        </Disclosure>
      );
  }
}

/** Desenha uma lista de blocos do motor, na ordem. */
export function ContentBlocks({ blocks }: { blocks: readonly ContentBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <Block key={`${block.kind}-${index}`} block={block} />
      ))}
    </div>
  );
}

/** Seção que abre e fecha, com alvo de toque de 44 px no título. */
export function Section({
  title,
  meta,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Disclosure
      title={title}
      meta={meta}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className="border-b border-border last:border-b-0 [&>button]:min-h-11"
      contentClassName="pl-0"
    >
      <div className="flex flex-col gap-3 pt-1 pb-2">{children}</div>
    </Disclosure>
  );
}
