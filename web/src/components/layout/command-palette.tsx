'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowElbowDownLeft,
  BookOpen,
  Calculator,
  Cards,
  ClipboardText,
  Drop,
  Gear,
  MagnifyingGlass,
  Microphone,
  MoonStars,
  Sun,
  Toolbox,
  UserCircle,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react';
import { useEncounterList } from '@/lib/clinical-queries';
import { useAuth } from '@/lib/auth-store';
import { messages } from '@/lib/messages';
import { useTheme } from '@/components/providers/theme-provider';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { HOME_ITEM, appSectionsFor } from '@/components/layout/nav-config';
import { calculatorName, searchTools } from '@clinical-tools/catalog';
import { infusionHref, searchInfusionItems } from '@clinical-tools/infusions/items';
import { isFerramentasEnabled } from '@/lib/feature-flags';
import { reviewedCardHref } from '@/lib/reviewed-card';
import {
  UNIFIED_SEARCH_DEBOUNCE_MS,
  serverSearchQuery,
  useDebouncedValue,
  useUnifiedSearch,
} from '@/lib/unified-search';
import type {
  CardSearchHit,
  CaseSearchHit,
  EncounterSummary,
  ProtocolSearchHit,
  UnifiedSearchGroup,
  UnifiedSearchGroupResult,
} from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Busca/ações rápidas (⌘K) no estilo do "Search" do Notion: campo grande sem
 * borda no topo, resultados agrupados, navegação por teclado (↑ ↓ ↵ esc).
 *
 * CC-502 — busca única: páginas, ações e ferramentas são filtradas aqui, a
 * cada tecla e sem sinal; cartões revisados, protocolos e casos vêm de
 * `GET /search`, depois de uma pausa na digitação, e a busca anterior é
 * cancelada. Sem a busca, os casos recentes.
 */

type Group = 'Ações' | 'Páginas' | 'Ferramentas' | 'Cartões' | 'Protocolos' | 'Casos';

/** Ordem na tela e no teclado: o que é local antes do que vem do servidor. */
const GROUP_ORDER: readonly Group[] = [
  'Ações',
  'Páginas',
  'Ferramentas',
  'Cartões',
  'Protocolos',
  'Casos',
];

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ElementType;
  group: Group;
  keywords?: string;
  run: () => void;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  finalized: 'Assinado',
  cancelled: 'Cancelado',
};

/**
 * ADR-017 — ferramentas e calculadoras já portadas entram na busca do ⌘K pelo
 * nome e pelos sinônimos (a mesma busca do hub: "pcr" acha o ACLS, "wells" o
 * TEP), e as drogas de Infusões abrem direto na calculadora delas ("nora" →
 * Noradrenalina). Só com texto digitado, para não encher a lista inicial; as
 * "em breve" não aparecem porque não abrem.
 */
const MAX_TOOL_COMMANDS = 5;

/** A lista de calculadoras tem rota própria; as demais ferramentas, /ferramentas/<id>. */
function toolPath(id: string): string {
  return id === 'calculadoras' ? '/ferramentas/calculadoras' : `/ferramentas/${id}`;
}

function toolCommands(query: string, go: (href: string) => void): Command[] {
  if (!isFerramentasEnabled() || query.length < 2) return [];
  const commands: Command[] = searchInfusionItems(query).map((item) => ({
    id: `infusao-${item.id}`,
    label: item.name,
    hint: 'Infusões contínuas',
    icon: Drop,
    group: 'Ferramentas',
    run: () => go(infusionHref(item.id)),
  }));
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
        run: () => go(toolPath(tool.id)),
      });
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
  }
  return commands.slice(0, MAX_TOOL_COMMANDS);
}

/** "12/10", no fuso do plantão. */
function caseDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function caseCommand(
  encounter: Pick<EncounterSummary, 'id' | 'patientRef' | 'chiefComplaint' | 'status'>,
  details: Array<string | null>,
  go: (href: string) => void,
): Command {
  return {
    id: `case-${encounter.id}`,
    label: encounter.chiefComplaint ?? encounter.patientRef ?? 'Consulta rápida',
    hint: [
      encounter.chiefComplaint ? encounter.patientRef : null,
      ...details,
      STATUS_LABEL[encounter.status] ?? encounter.status,
    ]
      .filter(Boolean)
      .join(' · '),
    icon: ClipboardText,
    group: 'Casos',
    run: () => go(`/encounters/${encounter.id}`),
  };
}

function foundCaseCommand(hit: CaseSearchHit, go: (href: string) => void): Command {
  return caseCommand(
    hit,
    [caseDate(hit.createdAt), hit.syndrome ? messages.understanding.syndromes[hit.syndrome] : null],
    go,
  );
}

function cardCommand(hit: CardSearchHit, go: (href: string) => void): Command {
  return {
    id: `card-${hit.id}`,
    label: hit.topic,
    hint: hit.question,
    icon: Cards,
    group: 'Cartões',
    run: () => go(reviewedCardHref(hit.id)),
  };
}

/** O protocolo abre nas Diretrizes já buscando pelo título dele — nunca pela busca digitada. */
function protocolCommand(hit: ProtocolSearchHit, go: (href: string) => void): Command {
  const version = /^\d/.test(hit.sourceVersion) ? `v${hit.sourceVersion}` : hit.sourceVersion;
  return {
    id: `protocol-${hit.source}`,
    label: hit.source,
    hint: [hit.institutional ? 'Da instituição' : 'Diretriz', version].join(' · '),
    icon: BookOpen,
    group: 'Protocolos',
    run: () => go(`/guidelines?q=${encodeURIComponent(hit.source)}`),
  };
}

type RemoteGroup = Extract<Group, 'Cartões' | 'Protocolos' | 'Casos'>;

/** Estado da busca no servidor para a busca digitada agora. */
type RemoteState =
  | { status: 'idle' | 'offline' | 'loading' | 'error' }
  | { status: 'ready'; failed: RemoteGroup[] };

const REMOTE_GROUPS: readonly RemoteGroup[] = ['Cartões', 'Protocolos', 'Casos'];

const REMOTE_GROUP_KEY: Record<RemoteGroup, UnifiedSearchGroup> = {
  Cartões: 'cards',
  Protocolos: 'protocols',
  Casos: 'cases',
};

const REMOTE_GROUP_NOUN: Record<RemoteGroup, string> = {
  Cartões: 'cartões',
  Protocolos: 'protocolos',
  Casos: 'casos',
};

function isRemoteGroup(group: Group): group is RemoteGroup {
  return (REMOTE_GROUPS as readonly Group[]).includes(group);
}

function groupItems<T>(result: UnifiedSearchGroupResult<T>): T[] {
  return result.status === 'ok' ? result.items : [];
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { role } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { isOnline } = useOnlineStatus();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Busca no servidor: só a partir de 2 caracteres, depois da pausa na digitação.
  const typedServerQuery = serverSearchQuery(deferredQuery);
  const searching = typedServerQuery !== null;
  const serverQuery = useDebouncedValue(typedServerQuery, UNIFIED_SEARCH_DEBOUNCE_MS);
  const search = useUnifiedSearch(serverQuery, { online: isOnline });
  const recentCases = useEncounterList({ limit: 6 });

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

  // Resultado do servidor só vale para a busca que está no campo: enquanto a
  // pausa não passou ou a resposta não chegou, nada de lista velha (o ↵ não
  // pode abrir um caso de outra busca).
  const remote: RemoteState = !searching
    ? { status: 'idle' }
    : !isOnline
      ? { status: 'offline' }
      : serverQuery !== typedServerQuery ||
          search.isPending ||
          (search.isError && search.isFetching)
        ? { status: 'loading' }
        : search.isError || !search.data
          ? { status: 'error' }
          : {
              status: 'ready',
              failed: REMOTE_GROUPS.filter(
                (group) => search.data[REMOTE_GROUP_KEY[group]].status === 'error',
              ),
            };

  const commands = useMemo<Command[]>(() => {
    const q = normalize(deferredQuery);
    const filtered = q
      ? staticCommands.filter((c) => normalize(`${c.label} ${c.keywords ?? ''}`).includes(q))
      : staticCommands;
    const found =
      remote.status === 'ready' && search.data
        ? [
            ...groupItems(search.data.cards).map((hit) => cardCommand(hit, go)),
            ...groupItems(search.data.protocols).map((hit) => protocolCommand(hit, go)),
            ...groupItems(search.data.cases).map((hit) => foundCaseCommand(hit, go)),
          ]
        : [];
    const recent = searching
      ? []
      : (recentCases.data?.data ?? []).map((encounter) => caseCommand(encounter, [], go));
    const all = [...filtered, ...toolCommands(deferredQuery, go), ...found, ...recent];
    // A ordem do teclado é a da tela: grupo a grupo.
    return GROUP_ORDER.flatMap((group) => all.filter((command) => command.group === group));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, staticCommands, remote.status, search.data, searching, recentCases.data]);

  const safeIndex = commands.length === 0 ? 0 : Math.min(activeIndex, commands.length - 1);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`);
    // jsdom não implementa scrollIntoView.
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(commands.length === 0 ? 0 : (safeIndex + 1) % commands.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        commands.length === 0 ? 0 : (safeIndex - 1 + commands.length) % commands.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commands[safeIndex]?.run();
    }
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: commands
      .map((command, index) => ({ command, index }))
      .filter(({ command }) => command.group === group),
  }));
  const failedGroups: readonly Group[] = remote.status === 'ready' ? remote.failed : [];
  const recentLoading = !searching && recentCases.isFetching;
  const visibleGroups = groups.filter(
    ({ group, items }) =>
      items.length > 0 || failedGroups.includes(group) || (group === 'Casos' && recentLoading),
  );
  const nothingFound =
    commands.length === 0 &&
    (remote.status === 'ready' || remote.status === 'idle') &&
    failedGroups.length === 0 &&
    !recentLoading;

  const activeId = commands[safeIndex]?.id;

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <MagnifyingGlass
          className="size-[18px] shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ferramentas, cartões, protocolos e casos…"
          aria-label="Buscar ferramentas, cartões, protocolos, casos, páginas e ações"
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
        aria-busy={remote.status === 'loading'}
        className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
      >
        {visibleGroups.map(({ group, items }) => (
          <div key={group} role="group" aria-label={group} className="pb-1">
            <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
              {group === 'Casos' ? (searching ? 'Casos encontrados' : 'Casos recentes') : group}
            </p>
            {items.length === 0 && group === 'Casos' && !searching && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</p>
            )}
            {items.length === 0 && isRemoteGroup(group) && failedGroups.includes(group) && (
              <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <WarningCircle className="size-4 shrink-0" aria-hidden="true" />
                Não foi possível buscar {REMOTE_GROUP_NOUN[group]} agora.
              </p>
            )}
            {items.map(({ command, index }) => {
              const Icon = command.icon;
              const active = index === safeIndex;
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
                    <ArrowElbowDownLeft
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <RemoteStatus state={remote} onRetry={() => void search.refetch()} />

        {nothingFound && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nada encontrado para “{deferredQuery}”.
          </p>
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

/**
 * O que a busca no servidor está fazendo, abaixo do que já é local: buscando,
 * sem conexão (ferramentas seguem funcionando) ou com erro, com nova tentativa.
 */
function RemoteStatus({ state, onRetry }: { state: RemoteState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return (
      <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
        Buscando cartões, protocolos e casos…
      </p>
    );
  }
  if (state.status === 'offline') {
    return (
      <p role="status" className="flex items-start gap-2 px-2 py-2 text-sm text-muted-foreground">
        <WifiSlash className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Sem conexão: cartões, protocolos e casos precisam de internet.
          {isFerramentasEnabled() && ' As ferramentas funcionam sem sinal.'}
        </span>
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="status" className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
        <WarningCircle className="size-4 shrink-0" aria-hidden="true" />
        <span>Não foi possível buscar cartões, protocolos e casos.</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-sm font-medium text-foreground underline underline-offset-2 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          Tentar de novo
        </button>
      </p>
    );
  }
  return null;
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
          Busque ferramentas, cartões revisados, protocolos e casos, abra páginas ou execute ações.
          Use as setas para navegar.
        </DialogDescription>
        <PaletteBody onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
