'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowElbowDownLeft,
  Calculator,
  ClipboardText,
  Gear,
  MagnifyingGlass,
  Microphone,
  MoonStars,
  Sun,
  Toolbox,
  UserCircle,
} from '@phosphor-icons/react';
import { useEncounterList } from '@/lib/clinical-queries';
import { useAuth } from '@/lib/auth-store';
import { useTheme } from '@/components/providers/theme-provider';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { HOME_ITEM, appSectionsFor } from '@/components/layout/nav-config';
import { calculatorName, searchTools } from '@clinical-tools/catalog';
import { isFerramentasEnabled } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';

/**
 * Busca/ações rápidas (⌘K) no estilo do "Search" do Notion: campo grande sem
 * borda no topo, resultados agrupados, navegação por teclado (↑ ↓ ↵ esc).
 * Busca casos no backend (`GET /encounters?search=`) e filtra páginas/ações
 * localmente.
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ElementType;
  group: 'Ações' | 'Páginas' | 'Ferramentas' | 'Casos';
  keywords?: string;
  run: () => void;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  finalized: 'Assinado',
  cancelled: 'Cancelado',
};

/**
 * ADR-017 — ferramentas e calculadoras já portadas entram na busca do ⌘K pelo
 * nome e pelos sinônimos (a mesma busca do hub: "iot" acha a Via aérea). Só
 * com texto digitado, para não encher a lista inicial; as "em breve" não
 * aparecem porque não abrem.
 */
const MAX_TOOL_COMMANDS = 5;

function toolCommands(query: string, go: (href: string) => void): Command[] {
  if (!isFerramentasEnabled() || query.length < 2) return [];
  const commands: Command[] = [];
  for (const result of searchTools(query)) {
    if (result.status !== 'disponivel') continue;
    if (result.kind === 'tool') {
      const { tool } = result;
      commands.push({
        id: `tool-${tool.id}`,
        label: tool.name,
        hint: 'Ferramenta',
        icon: Toolbox,
        group: 'Ferramentas',
        run: () =>
          go(tool.id === 'calculadoras' ? '/ferramentas/calculadoras' : `/ferramentas/${tool.id}`),
      });
      if (commands.length === MAX_TOOL_COMMANDS) break;
      continue;
    }
    const { id } = result.calculator;
    commands.push({
      id: `calc-${id}`,
      label: calculatorName(result.calculator),
      hint: 'Calculadora',
      icon: Calculator,
      group: 'Ferramentas',
      run: () => go(`/ferramentas/calculadoras/${id}`),
    });
    if (commands.length === MAX_TOOL_COMMANDS) break;
  }
  return commands;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { role } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const searching = deferredQuery.length >= 2;
  const casesQuery = useEncounterList(
    searching ? { search: deferredQuery, limit: 6 } : { limit: 6 },
  );

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const staticCommands = useMemo<Command[]>(() => {
    const pages = [HOME_ITEM, ...appSectionsFor(role).flatMap((s) => s.items)];
    return [
      {
        id: 'new-case',
        label: 'Novo caso',
        hint: 'Capturar por voz ou texto',
        icon: Microphone,
        group: 'Ações',
        keywords: 'novo atendimento criar caso voz',
        run: () => go('/encounters/new'),
      },
      {
        id: 'toggle-theme',
        label: resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro',
        icon: resolvedTheme === 'dark' ? Sun : MoonStars,
        group: 'Ações',
        keywords: 'tema escuro claro dark light noite',
        run: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          onClose();
        },
      },
      ...pages.map<Command>((item) => ({
        id: `page-${item.href}`,
        label: item.label,
        icon: item.icon,
        group: 'Páginas',
        run: () => go(item.href),
      })),
      {
        id: 'page-settings',
        label: 'Configurações',
        icon: Gear,
        group: 'Páginas',
        keywords: 'seguranca privacidade mfa senha',
        run: () => go('/settings?tab=seguranca'),
      },
      {
        id: 'page-profile',
        label: 'Perfil',
        icon: UserCircle,
        group: 'Páginas',
        keywords: 'crm especialidade nome',
        run: () => go('/settings?tab=perfil'),
      },
    ];
    // `go` só depende de router/onClose, estáveis durante a vida do dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, resolvedTheme, setTheme]);

  const commands = useMemo<Command[]>(() => {
    const q = normalize(deferredQuery);
    const filtered = q
      ? staticCommands.filter((c) => normalize(`${c.label} ${c.keywords ?? ''}`).includes(q))
      : staticCommands;
    const cases = (casesQuery.data?.data ?? []).map<Command>((enc) => ({
      id: `case-${enc.id}`,
      label: enc.chiefComplaint ?? enc.patientRef ?? 'Consulta rápida',
      hint: [enc.chiefComplaint ? enc.patientRef : null, STATUS_LABEL[enc.status] ?? enc.status]
        .filter(Boolean)
        .join(' · '),
      icon: ClipboardText,
      group: 'Casos',
      run: () => go(`/encounters/${enc.id}`),
    }));
    return [...filtered, ...toolCommands(deferredQuery, go), ...cases];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, staticCommands, casesQuery.data]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    // jsdom não implementa scrollIntoView.
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (commands.length === 0 ? 0 : (i + 1) % commands.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (commands.length === 0 ? 0 : (i - 1 + commands.length) % commands.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commands[activeIndex]?.run();
    }
  }

  const groups = (['Ações', 'Páginas', 'Ferramentas', 'Casos'] as const)
    .map((group) => ({
      group,
      items: commands
        .map((command, index) => ({ command, index }))
        .filter(({ command }) => command.group === group),
    }))
    .filter((g) => g.items.length > 0 || (g.group === 'Casos' && casesQuery.isFetching));

  const activeId = commands[activeIndex]?.id;

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <MagnifyingGlass className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar casos, páginas e ações…"
          aria-label="Buscar casos, páginas e ações"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={activeId ? `cmd-${activeId}` : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-fg-tertiary"
        />
        <Kbd>esc</Kbd>
      </div>

      <div
        ref={listRef}
        id="command-palette-list"
        role="listbox"
        aria-label="Resultados"
        className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
      >
        {groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nada encontrado para “{deferredQuery}”.
          </p>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group} role="group" aria-label={group} className="pb-1">
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {group === 'Casos' ? (searching ? 'Casos encontrados' : 'Casos recentes') : group}
              </p>
              {items.length === 0 && group === 'Casos' && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</p>
              )}
              {items.map(({ command, index }) => {
                const Icon = command.icon;
                const active = index === activeIndex;
                return (
                  <div
                    key={command.id}
                    id={`cmd-${command.id}`}
                    role="option"
                    aria-selected={active}
                    data-index={index}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => command.run()}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm',
                      active ? 'bg-hover text-foreground' : 'text-foreground',
                    )}
                  >
                    <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 truncate">{command.label}</span>
                    {command.hint && (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {command.hint}
                      </span>
                    )}
                    <span className="flex-1" />
                    {active && (
                      <ArrowElbowDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="hidden items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> abrir
        </span>
      </div>
    </>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[620px]"
      >
        <DialogTitle className="sr-only">Ações rápidas</DialogTitle>
        <DialogDescription className="sr-only">
          Busque casos, abra páginas ou execute ações. Use as setas para navegar.
        </DialogDescription>
        <PaletteBody onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
