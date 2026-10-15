'use client';

import type { ElementType, ReactNode } from 'react';
import Link from 'next/link';
import {
  Baby,
  Calculator,
  Drop,
  Gauge,
  HandHeart,
  Heartbeat,
  MagnifyingGlass,
  Pill,
  Skull,
  Star,
  Syringe,
  Virus,
  Wind,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { CalculatorCatalogEntry } from '@clinical-tools/calculator-catalog';
import {
  calculatorName,
  TOOL_GROUPS,
  type ToolEntry,
  type ToolGroupId,
  type ToolSearchResult,
} from '@clinical-tools/catalog';
import { getCalculator } from '@clinical-tools/registry';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MAX_FAVORITES, type FavoriteKey, type FavoriteToggleOutcome } from '@/lib/tool-favorites';
import { cn } from '@/lib/utils';

/** Ícone de cada grupo do hub (só UI; o motor não conhece ícone). */
export const GROUP_ICON: Record<ToolGroupId, ElementType> = {
  calculadoras: Calculator,
  ressuscitacao: Heartbeat,
  'via-aerea': Wind,
  'choque-sepse': Drop,
  pediatria: Baby,
  toxicologia: Skull,
  metabolico: Syringe,
  ventilacao: Gauge,
  'sedacao-dor': Pill,
  paliativos: HandHeart,
  infecciosas: Virus,
};

const GROUP_LABEL = new Map<string, string>(TOOL_GROUPS.map(({ id, label }) => [id, label]));

export function calculatorHref(id: string): string {
  return `/ferramentas/calculadoras/${id}`;
}

/** Endereço da ferramenta; `null` enquanto ela estiver "em breve". */
export function toolHref(tool: ToolEntry): string | null {
  if (tool.status !== 'disponivel') return null;
  return tool.id === 'calculadoras' ? '/ferramentas/calculadoras' : `/ferramentas/${tool.id}`;
}

export interface FavoriteControl {
  isFavorite: (key: FavoriteKey) => boolean;
  toggle: (key: FavoriteKey) => FavoriteToggleOutcome;
}

export function FavoriteButton({
  favoriteKey,
  name,
  favorites,
}: {
  favoriteKey: FavoriteKey;
  name: string;
  favorites: FavoriteControl;
}) {
  const active = favorites.isFavorite(favoriteKey);
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Tirar ${name} dos favoritos` : `Favoritar ${name}`}
      title={active ? 'Tirar dos favoritos' : 'Favoritar'}
      onClick={() => {
        if (favorites.toggle(favoriteKey) === 'limit-reached') {
          toast.info(`Limite de ${MAX_FAVORITES} favoritos. Tire um para incluir outro.`);
        }
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <Star
        className={cn('size-5', active && 'text-foreground')}
        weight={active ? 'fill' : 'regular'}
        aria-hidden="true"
      />
    </button>
  );
}

interface EntryRowProps {
  icon: ElementType;
  name: string;
  description?: ReactNode;
  href: string | null;
  favoriteKey: FavoriteKey;
  favorites: FavoriteControl;
}

/**
 * Linha de ferramenta: a linha inteira abre (alvo de toque de 48px) e a
 * estrela fica ao lado, fora do link. "Em breve" não abre nem vira favorito.
 */
export function EntryRow({
  icon: Icon,
  name,
  description,
  href,
  favoriteKey,
  favorites,
}: EntryRowProps) {
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-medium',
            href ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {name}
        </span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {href ? null : <Badge variant="gray">Em breve</Badge>}
    </>
  );
  return (
    <li className="flex items-center gap-1">
      {href ? (
        <Link
          href={href}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2 py-2">{body}</div>
      )}
      {href ? <FavoriteButton favoriteKey={favoriteKey} name={name} favorites={favorites} /> : null}
    </li>
  );
}

export function ToolRow({ tool, favorites }: { tool: ToolEntry; favorites: FavoriteControl }) {
  return (
    <EntryRow
      icon={GROUP_ICON[tool.group]}
      name={tool.name}
      description={tool.description}
      href={toolHref(tool)}
      favoriteKey={`tool:${tool.id}`}
      favorites={favorites}
    />
  );
}

export function CalculatorRow({
  calculator,
  favorites,
  showCategory = false,
}: {
  calculator: CalculatorCatalogEntry;
  favorites: FavoriteControl;
  showCategory?: boolean;
}) {
  const definition = getCalculator(calculator.id);
  const description = [
    showCategory ? `Calculadora · ${calculator.category}` : null,
    definition?.description,
  ]
    .filter(Boolean)
    .join(' — ');
  return (
    <EntryRow
      icon={Calculator}
      name={calculatorName(calculator)}
      description={description}
      href={definition ? calculatorHref(calculator.id) : null}
      favoriteKey={`calc:${calculator.id}`}
      favorites={favorites}
    />
  );
}

export function SearchResultRow({
  result,
  favorites,
}: {
  result: ToolSearchResult;
  favorites: FavoriteControl;
}) {
  if (result.kind === 'calculator') {
    return <CalculatorRow calculator={result.calculator} favorites={favorites} showCategory />;
  }
  return (
    <EntryRow
      icon={GROUP_ICON[result.tool.group]}
      name={result.tool.name}
      description={`${GROUP_LABEL.get(result.tool.group) ?? ''} · ${result.tool.description}`}
      href={toolHref(result.tool)}
      favoriteKey={`tool:${result.tool.id}`}
      favorites={favorites}
    />
  );
}

export function ToolSearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <label htmlFor="ferramentas-busca" className="sr-only">
        {label}
      </label>
      <MagnifyingGlass
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id="ferramentas-busca"
        type="search"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 pl-9 text-base max-sm:h-11 md:text-sm"
      />
    </div>
  );
}
