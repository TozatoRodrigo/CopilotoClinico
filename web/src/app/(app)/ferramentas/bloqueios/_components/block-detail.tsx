'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CaretRight, Lightbulb, Syringe } from '@phosphor-icons/react';
import { getRegionalBlock, type RegionalBlockId } from '@clinical-tools/blocks/content';
import { blockSectionHref } from '@clinical-tools/blocks/sections';
import { Callout } from '@/components/ui/callout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { SectionHeader } from '@/components/layout/page-header';
import { BlocksPage, CheckboxRow } from './blocks-ui';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <SectionHeader
        title={<span id={id}>{title}</span>}
        className="border-b border-border pb-1.5"
      />
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-foreground">
      {items.map((item) => (
        <li key={item} className="text-pretty">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Material como checklist, como no ANY: marcar é só apoio de memória na tela,
 * não fica salvo nem vai para a nota.
 */
function MaterialChecklist({ items }: { items: readonly string[] }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item}>
          <CheckboxRow
            label={item}
            checked={checked.has(item)}
            onCheckedChange={(on) =>
              setChecked((current) => {
                const next = new Set(current);
                if (on) next.add(item);
                else next.delete(item);
                return next;
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** /ferramentas/bloqueios/<id> — ficha de um bloqueio. */
export function BlockDetailScreen({ id }: { id: RegionalBlockId }) {
  const block = getRegionalBlock(id);
  return (
    <BlocksPage
      icon={Syringe}
      title={block.name}
      description={`${block.region} · ${block.volume} · ${block.type}`}
    >
      <Section id="bloqueio-indicacoes" title="Indicações">
        <BulletList items={block.indications} />
        {block.tip ? (
          <Callout tone="blue" icon={<Lightbulb />} title={block.tip.title}>
            {block.tip.text}
          </Callout>
        ) : null}
      </Section>

      <Section id="bloqueio-contraindicacoes" title="Contraindicações">
        <BulletList items={block.contraindications} />
      </Section>

      <Section id="bloqueio-material" title="Material">
        <MaterialChecklist items={block.material} />
      </Section>

      <Section id="bloqueio-tecnica" title="Técnica">
        <ol className="flex flex-col gap-2.5">
          {block.technique.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-[0.9375rem] text-foreground">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-blue-tag text-xs font-semibold text-tone-blue-ink tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-pretty">
                <span className="sr-only">Passo {index + 1}: </span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="bloqueio-anestesico" title="Anestésico local">
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Droga</TableHead>
                <TableHead>Concentração</TableHead>
                <TableHead>Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.anesthetics.map((row) => (
                <TableRow key={row.drug}>
                  <TableCell className="font-medium">{row.drug}</TableCell>
                  <TableCell className="tabular-nums">{row.concentration}</TableCell>
                  <TableCell className="tabular-nums">{row.volume}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
        <Link
          href={blockSectionHref('dose-maxima')}
          className="inline-flex min-h-10 items-center gap-1 self-start rounded-md text-sm text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          Dose máxima pelo peso
          <CaretRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Section>
    </BlocksPage>
  );
}
