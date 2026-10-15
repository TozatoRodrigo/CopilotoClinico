'use client';

import { useEffect, useState } from 'react';
import type { TepReferenceSectionId } from '@clinical-tools/tep/links';
import { TEP_REFERENCE, type TepReferenceBlock } from '@clinical-tools/tep/reference';
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
import { CorBadge, Notice, TepLinkAction } from './tep-parts';

function Block({ block }: { block: TepReferenceBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h4 className="pt-2 text-sm font-semibold text-foreground">{block.text}</h4>;
    case 'paragraph':
      return (
        <p className="text-[0.9375rem] text-pretty">
          {block.cor ? (
            <>
              <CorBadge cor={block.cor} />{' '}
            </>
          ) : null}
          {block.text}
        </p>
      );
    case 'checklist':
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem]">
          {block.items.map((item) => (
            <li key={item} className="text-pretty">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <Callout tone="blue" title={block.title}>
          {block.text}
        </Callout>
      );
    case 'drug':
      return (
        <div className="flex flex-col gap-0.5 text-[0.9375rem]">
          <p className="text-pretty">
            <span className="font-semibold">{block.name}</span> — {block.text}
            {block.cor ? (
              <>
                {' '}
                <CorBadge cor={block.cor} />
              </>
            ) : null}
          </p>
          {block.details?.map((detail) => (
            <p key={detail} className="text-sm text-pretty text-muted-foreground">
              {detail}
            </p>
          ))}
          {block.warning ? (
            <p className="text-sm font-medium text-pretty text-tone-orange">{block.warning}</p>
          ) : null}
          {block.link ? <TepLinkAction link={block.link} /> : null}
        </div>
      );
    case 'parameter':
      return (
        <div className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2">
          <p className="text-sm font-semibold">{block.name}</p>
          <p className="text-sm font-medium">{block.threshold}</p>
          <p className="text-sm text-pretty text-muted-foreground">{block.data}</p>
        </div>
      );
    case 'table':
      return (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                {block.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map(([first, second]) => (
                <TableRow key={first}>
                  <TableCell className="align-top whitespace-normal">{first}</TableCell>
                  <TableCell className="align-top whitespace-normal">{second}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      );
    case 'alert':
      return <Notice notice={block.notice} />;
  }
}

/**
 * Aba Referência do TEP: as sete seções da referência rápida do ANY. A seção
 * pedida pelo roteiro ("Ver contraindicações") já abre aberta e rola até ela.
 */
export function TepReference({ focus }: { focus: TepReferenceSectionId | null }) {
  // A aba monta de novo a cada visita (Radix Tabs): o estado inicial basta.
  const [open, setOpen] = useState<ReadonlySet<TepReferenceSectionId>>(
    () => new Set(focus ? [focus] : []),
  );

  useEffect(() => {
    if (focus) document.getElementById(`tep-ref-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus]);

  return (
    <div className="flex flex-col divide-y divide-border">
      {TEP_REFERENCE.map((section) => (
        <div key={section.id} id={`tep-ref-${section.id}`} className="scroll-mt-14 py-1">
          <Disclosure
            title={section.title}
            triggerClassName="min-h-11"
            open={open.has(section.id)}
            onOpenChange={(isOpen) =>
              setOpen((current) => {
                const next = new Set(current);
                if (isOpen) next.add(section.id);
                else next.delete(section.id);
                return next;
              })
            }
          >
            <div className="flex flex-col gap-3 pt-1">
              {section.blocks.map((block, index) => (
                <Block key={`${section.id}-${index}`} block={block} />
              ))}
            </div>
          </Disclosure>
        </div>
      ))}
    </div>
  );
}
