'use client';

import Link from 'next/link';
import {
  BookOpen,
  CaretRight,
  ClipboardText,
  Gear,
  House,
  List,
  MagnifyingGlass,
  Microphone,
  Plus,
  ShieldCheck,
  Stethoscope,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useDashboardStats, useEncounterList } from '@/lib/clinical-queries';
import { ConnectionStatus } from '@/components/domain/connection-status';
import { OfflineQueueBadge } from '@/components/domain/offline-queue-badge';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { useAuth, type AppRole } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ClinicalSidebar, type NavItem } from '@/components/layout/clinical-sidebar';
import { FocusRail } from '@/components/layout/focus-rail';

const FEATURE_COMMAND_K_ENABLED = true;

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  physician: [
    { href: '/dashboard', label: 'Plantão', icon: House },
    { href: '/encounters', label: 'Casos', icon: ClipboardText },
    { href: '/guidelines', label: 'Diretrizes', icon: BookOpen },
  ],
  compliance: [
    { href: '/dashboard', label: 'Plantão', icon: House },
    { href: '/encounters', label: 'Casos', icon: ClipboardText },
    { href: '/guidelines', label: 'Diretrizes', icon: BookOpen },
    { href: '/audit', label: 'Auditoria', icon: ShieldCheck },
    { href: '/admin', label: 'Console', icon: Gear },
  ],
  admin: [
    { href: '/dashboard', label: 'Plantão', icon: House },
    { href: '/encounters', label: 'Casos', icon: ClipboardText },
    { href: '/guidelines', label: 'Diretrizes', icon: BookOpen },
    { href: '/audit', label: 'Auditoria', icon: ShieldCheck },
    { href: '/admin', label: 'Console', icon: Gear },
  ],
};

const MOBILE_TABS: NavItem[] = [
  { href: '/dashboard', label: 'Plantão', icon: House },
  { href: '/encounters/new', label: 'Novo', icon: Plus },
  { href: '/encounters', label: 'Casos', icon: ClipboardText },
  { href: '/guidelines', label: 'Diretrizes', icon: BookOpen },
];

const COMMAND_LINKS = [
  {
    href: '/dashboard',
    label: 'Ir para painel',
    description: 'Visão geral, métricas e retomada de fluxo.',
  },
  {
    href: '/encounters/new',
    label: 'Novo atendimento',
    description: 'Começar captura de um caso.',
  },
  { href: '/encounters', label: 'Atendimentos', description: 'Fila rápida de casos recentes.' },
  { href: '/guidelines', label: 'Diretrizes', description: 'Acesso rápido ao catálogo clínico.' },
  {
    href: '/settings',
    label: 'Configurações',
    description: 'Preferências, shell e conectividade.',
  },
];

// Tech debt cleanup: ThemeToggle movido para components/layout/theme-toggle.tsx
// (antes era duplicado em app-shell e admin-shell).

function QuickActions() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // S20-UX-01 — listener desativado quando a feature está oculta.
    if (!FEATURE_COMMAND_K_ENABLED) return;

    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // S20-UX-01 — não renderiza o botão nem o dialog quando a feature está oculta.
  // Código preservado abaixo para reativação rápida quando a busca funcional
  // estiver pronta.
  if (!FEATURE_COMMAND_K_ENABLED) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass className="size-4" />
        <span className="sr-only">Ações rápidas (⌘K)</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle variant="brand">Ações rápidas</DialogTitle>
            <DialogDescription>
              Navegação rápida. A busca funcional entra na F3.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                readOnly
                value="Busque atalhos, diretrizes e atendimentos em breve…"
                className="pl-9 text-muted-foreground"
                aria-label="Busca rápida em scaffold"
              />
            </div>
            <div className="space-y-2">
              {COMMAND_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 transition-colors hover:border-clinical-teal/40 hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{link.label}</p>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                  <CaretRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserMenu() {
  const { physician, logout, role } = useAuth();
  const router = useRouter();
  const { isOnline } = useOnlineStatus();

  async function handleLogout() {
    await apiClient.post('/auth/logout').catch(() => undefined);
    logout();
    router.push('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {(physician?.name ?? 'Dr').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="sr-only">Abrir menu do usuário</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Conta</DropdownMenuLabel>
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-medium">{physician?.name ?? 'Médico'}</p>
            <p className="text-xs text-muted-foreground">{physician?.email ?? 'Sessão ativa'}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{role}</Badge>
              <ConnectionStatus
                status={isOnline ? 'online' : 'offline'}
                className="border-none bg-transparent px-0 py-0"
              />
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings?tab=perfil">
              <Stethoscope className="size-4" />
              Perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings?tab=seguranca">
              <Gear className="size-4" />
              Configurações
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/guidelines')}>
            <BookOpen className="size-4" />
            Diretrizes
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => void handleLogout()}>
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNavSheet({ links }: { links: NavItem[] }) {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          style={{ color: 'var(--sidebar-dark-text)' }}
        >
          <List className="size-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetTitle className="text-primary font-semibold">Copiloto Clínico</SheetTitle>
        <p className="mt-2 text-sm text-muted-foreground">Navegação contextual do papel atual.</p>
        <nav aria-label="Navegação móvel" className="flex flex-col gap-1 mt-6">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export interface AppShellProps {
  children: React.ReactNode;
  variant?: 'full' | 'focus';
}

export function AppShell({ children, variant }: AppShellProps) {
  const pathname = usePathname();
  const { role } = useAuth();
  const links = NAV_BY_ROLE[role];

  // UX — contadores no rail desktop (Plantão/Casos). Reaproveita os mesmos
  // hooks/queryKeys já usados pelas páginas de Plantão e Casos — cache de 30s
  // (queryProvider) evita chamadas extras quando o médico já visitou essas
  // telas nesta sessão.
  const sidebarStats = useDashboardStats();
  const sidebarCases = useEncounterList({ limit: 1 });
  const sidebarLinks = links.map((item) => {
    if (item.href === '/dashboard') {
      return { ...item, count: sidebarStats.data?.pendingReviews };
    }
    if (item.href === '/encounters') {
      return { ...item, count: sidebarCases.data?.meta?.total };
    }
    return item;
  });

  const isFocusRoute =
    /\/encounters\/[^/]+\/(capture|result)/.test(pathname) ||
    /\/encounters\/[^/]+\/documents\/[^/]+\/edit/.test(pathname);
  const effectiveVariant = variant ?? (isFocusRoute ? 'focus' : 'full');

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        {effectiveVariant === 'focus' ? (
          <FocusRail navItems={links} />
        ) : (
          <ClinicalSidebar navItems={sidebarLinks} showOnlineStatus />
        )}
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile dark header */}
        <header
          className="flex h-14 items-center justify-between px-4 md:hidden"
          style={{ background: 'var(--sidebar-dark-bg)' }}
        >
          <div className="flex items-center gap-2">
            <MobileNavSheet links={links} />
            <div className="flex items-center gap-1.5">
              <Stethoscope
                className="size-4"
                style={{ color: 'var(--sidebar-dark-accent)' }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--sidebar-dark-text-bright)' }}
              >
                Copiloto Clínico
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <OfflineQueueBadge />
            <div style={{ color: 'var(--sidebar-dark-text)' }}>
              <ThemeToggle />
            </div>
            <UserMenu />
          </div>
        </header>

        {/* Desktop floating controls */}
        <div className="absolute right-4 top-4 z-30 hidden items-center gap-1 md:flex">
          <OfflineQueueBadge />
          <QuickActions />
          <ThemeToggle />
          <UserMenu />
        </div>

        {/* Main content */}
        <main
          id="main-content"
          aria-label="Conteúdo principal"
          className="flex-1 overflow-hidden px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8"
        >
          {children}
        </main>

        {/* Mobile FAB + bottom nav */}
        <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
          <Link
            href="/encounters/new"
            aria-label="Novo caso por voz"
            className="absolute -top-[72px] right-6 flex h-16 w-16 items-center justify-center rounded-full shadow-[0_6px_20px_rgba(14,124,123,0.4)] transition-transform active:scale-95"
            style={{ background: 'var(--teal)' }}
          >
            <Microphone className="size-7 text-white" weight="bold" />
          </Link>
          <nav
            aria-label="Navegação inferior"
            className="border-t bg-background/95 px-4 py-2 backdrop-blur"
          >
          <div className="mx-auto flex max-w-md items-center justify-between gap-2">
            {MOBILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
