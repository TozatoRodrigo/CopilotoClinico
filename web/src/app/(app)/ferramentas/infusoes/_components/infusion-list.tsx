'use client';

import { CaretRight } from '@phosphor-icons/react';
import {
  INFUSION_GROUPS,
  INFUSION_ITEMS,
  searchInfusionItems,
  type InfusionGroupId,
  type InfusionItem,
} from '@clinical-tools/infusions/items';
import { SectionHeader } from '@/components/layout/page-header';

export interface InfusionListProps {
  query: string;
  onOpen: (id: string) => void;
  /** Linha de apoio de cada item ("mcg/kg/min · 64 mcg/mL"). */
  describe: (item: InfusionItem) => string;
  /** Grupo que vem primeiro (`?grupo=`): a sedação, quando a Via aérea manda para cá. */
  firstGroup?: InfusionGroupId | null;
}

function ItemRow({
  item,
  onOpen,
  description,
}: {
  item: InfusionItem;
  onOpen: (id: string) => void;
  description: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        </span>
        <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Lista da tela de Infusões: por grupo, na ordem do ANY, ou o resultado da
 * busca. Tocar no item abre a calculadora dele.
 */
export function InfusionList({ query, onOpen, describe, firstGroup }: InfusionListProps) {
  if (query.trim() !== '') {
    const results = searchInfusionItems(query);
    return (
      <section aria-label="Resultados da busca" className="flex flex-col gap-2">
        <SectionHeader title="Resultados" count={results.length} as="h2" />
        {results.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">
            Nenhuma droga encontrada para “{query.trim()}”.
          </p>
        ) : (
          <ul className="flex flex-col">
            {results.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={onOpen} description={describe(item)} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  const groups = firstGroup
    ? [...INFUSION_GROUPS].sort((a, b) => Number(b.id === firstGroup) - Number(a.id === firstGroup))
    : INFUSION_GROUPS;
  return (
    <>
      {groups.map((group) => {
        const items = INFUSION_ITEMS.filter((item) => item.group === group.id);
        const headingId = `infusoes-grupo-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId} className="flex flex-col gap-2">
            <SectionHeader
              title={<span id={headingId}>{group.label}</span>}
              count={items.length}
              className="border-b border-border pb-1.5"
            />
            <ul className="flex flex-col">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} onOpen={onOpen} description={describe(item)} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
