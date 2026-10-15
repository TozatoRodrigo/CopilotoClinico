'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CaretDoubleRight,
  ClipboardText,
  IdentificationCard,
  List,
  MagnifyingGlass,
  Microphone,
  Plus,
} from '@phosphor-icons/react';
import { useDashboardStats, useEncounterList } from '@/lib/clinical-queries';
import { useAuth } from '@/lib/auth-store';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { OfflineQueueBadge } from '@/components/domain/offline-queue-badge';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { CommandPalette } from '@/components/layout/command-palette';
import { RouteBreadcrumbs } from '@/components/layout/route-breadcrumbs';
import { UserAvatarMenu, WorkspaceSwitcher } from '@/components/layout/user-menu';
import {
  SidebarLink,
  SidebarSearchButton,
  WorkspaceSidebar,
} from '@/components/layout/workspace-sidebar';
import {
  APP_SECTIONS_BY_ROLE,
  HOME_ITEM,
  isNavItemActive,
  type NavItem,
} from '@/components/layout/nav-config';
import { LogoMark } from '@/components/brand/logo';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

const NEW_CASE_ITEM: NavItem = {
  href: '/encounters/new',
  label: 'Novo caso',
  icon: Plus,
  exact: true,
};

/** Rotas de foco (captura, análise, edição): sidebar começa recolhida. */
function isFocusPath(pathname: string): boolean {
  return (
    /\/encounters\/[^/]+\/(capture|result|conversation)/.test(pathname) ||
    /\/encounters\/[^/]+\/documents\/[^/]+\/edit/.test(pathname)
  );
}

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function OnlineRow() {
  const { isOnline } = useOnlineStatus();
  return (
    <p className="flex h-[30px] items-center gap-2 px-2 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', isOnline ? 'bg-clinical-green' : 'bg-clinical-amber')}
      />
      {isOnline ? 'Online · fila sincronizada' : 'Offline · salvando localmente'}
    </p>
  );
}

function SidebarContents({
  onSearch,
  onCollapse,
  onNavigate,
}: {
  onSearch: () => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const { role, physician } = useAuth();

  // UX — contadores no sidebar (Plantão/Casos). Reaproveita os mesmos
  // hooks/queryKeys das páginas de Plantão e Casos — cache de 30s
  // (queryProvider) evita chamadas extras quando o médico já visitou essas
  // telas nesta sessão.
  const stats = useDashboardStats();
  const cases = useEncounterList({ limit: 1 });
  const sections = APP_SECTIONS_BY_ROLE[role].map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.href === '/encounters' ? { ...item, count: cases.data?.meta?.total } : item,
    ),
  }));
  const home = { ...HOME_ITEM, count: stats.data?.pendingReviews || undefined };

  return (
    <WorkspaceSidebar
      header={<WorkspaceSwitcher />}
      onCollapse={onCollapse}
      onNavigate={onNavigate}
      topItems={
        <>
          <SidebarSearchButton onClick={onSearch} />
          <SidebarLink item={home} onNavigate={onNavigate} />
          <SidebarLink item={NEW_CASE_ITEM} accent onNavigate={onNavigate} />
        </>
      }
      sections={sections}
      footer={
        <>
          {physician && !physician.crmVerified && (
            <Link
              href="/verificacao-crm"
              onClick={onNavigate}
              className="flex h-[30px] items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <IdentificationCard className="size-[18px] text-clinical-amber" aria-hidden="true" />
              <span className="flex-1 truncate">Verificar CRM</span>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-clinical-amber" />
            </Link>
          )}
          <OnlineRow />
        </>
      }
    />
  );
}

const MOBILE_TABS: NavItem[] = [
  HOME_ITEM,
  { href: '/encounters', label: 'Casos', icon: ClipboardText, excludePrefixes: ['/encounters/new'] },
];
const MOBILE_TABS_END: NavItem[] = [{ href: '/guidelines', label: 'Diretrizes', icon: BookOpen }];

function MobileTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.6875rem] font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-[22px]" weight={active ? 'fill' : 'regular'} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export interface AppShellProps {
  children: React.ReactNode;
  /** @deprecated o shell decide pelo pathname; mantido por compatibilidade. */
  variant?: 'full' | 'focus';
}

export function AppShell({ children, variant }: AppShellProps) {
  const pathname = usePathname();
  const focusRoute = variant ? variant === 'focus' : isFocusPath(pathname);

  // O AppShell só monta no client (o layout de (app) mostra um spinner até o
  // auth hidratar), então ler o localStorage no inicializador é seguro.
  const [storedCollapsed, setStoredCollapsed] = useState(readStoredCollapsed);
  // Override manual vale só para a rota atual (reabrir numa tela de foco não
  // muda a preferência das demais telas).
  const [override, setOverride] = useState<{ path: string; collapsed: boolean } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const collapsed =
    override?.path === pathname ? override.collapsed : focusRoute ? true : storedCollapsed;

  const setCollapsed = useCallback(
    (next: boolean) => {
      setOverride({ path: pathname, collapsed: next });
      if (!focusRoute) {
        setStoredCollapsed(next);
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
        } catch {
          /* armazenamento indisponível (aba privada) — só não persiste */
        }
      }
    },
    [pathname, focusRoute],
  );

  // ⌘\ recolhe/expande o sidebar (atalho do Notion).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setCollapsed(!collapsed);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, setCollapsed]);

  const openSearch = useCallback(() => {
    setMobileOpen(false);
    setPaletteOpen(true);
  }, []);

  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {/* Sidebar desktop */}
      <aside
        aria-label="Barra lateral"
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-200 ease-out md:block',
          collapsed ? 'w-0 border-r-0' : 'w-60',
        )}
      >
        <div className="h-full w-60" inert={collapsed}>
          <SidebarContents onSearch={openSearch} onCollapse={() => setCollapsed(true)} />
        </div>
      </aside>

      {/* Sidebar mobile (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[280px] gap-0 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContents onSearch={openSearch} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-1 bg-background/95 px-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 md:px-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground md:hidden"
          >
            <List className="size-5" />
          </button>
          <Link href="/dashboard" aria-label="Plantão" className="mr-1 flex items-center md:hidden">
            <LogoMark size="sm" />
          </Link>
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir barra lateral"
              title="Expandir barra lateral (⌘\)"
              className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground md:flex"
            >
              <CaretDoubleRight className="size-4" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <RouteBreadcrumbs />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <OfflineQueueBadge />
            {collapsed && (
              <button
                type="button"
                onClick={openSearch}
                aria-label="Buscar"
                title="Buscar (⌘K)"
                className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground md:flex"
              >
                <MagnifyingGlass className="size-4" />
              </button>
            )}
            <ThemeToggle size="sm" />
            <div className="md:hidden">
              <UserAvatarMenu />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          aria-label="Conteúdo principal"
          className="flex-1 px-4 pt-6 pb-28 sm:px-8 md:pt-10 md:pb-16 lg:px-16 xl:px-24"
        >
          {children}
        </main>
      </div>

      {/* Barra inferior mobile (estilo app do Notion) */}
      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <div className="mx-auto flex max-w-md items-center px-2">
          {MOBILE_TABS.map((tab) => (
            <MobileTab key={tab.href} item={tab} pathname={pathname} />
          ))}
          {/* UX — nas telas de foco (captura/análise/edição) o atalho de novo
              caso por voz fica neutro: médicos tocavam nele por engano e
              perdiam o que estavam fazendo. */}
          <div className="flex flex-1 justify-center">
            <Link
              href="/encounters/new"
              aria-label="Novo caso por voz"
              className={cn(
                'flex size-11 items-center justify-center rounded-full transition-transform active:scale-95',
                focusRoute
                  ? 'bg-tone-gray-bg text-muted-foreground'
                  : 'bg-primary text-primary-foreground shadow-md',
              )}
            >
              {focusRoute ? (
                <Plus className="size-5" weight="bold" />
              ) : (
                <Microphone className="size-5" weight="fill" />
              )}
            </Link>
          </div>
          {MOBILE_TABS_END.map((tab) => (
            <MobileTab key={tab.href} item={tab} pathname={pathname} />
          ))}
          <button
            type="button"
            onClick={openSearch}
            aria-label="Buscar"
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.6875rem] font-medium text-muted-foreground"
          >
            <MagnifyingGlass className="size-[22px]" aria-hidden="true" />
            <span>Buscar</span>
          </button>
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
