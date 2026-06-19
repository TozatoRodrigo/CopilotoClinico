'use client';

import Link from 'next/link';
import {
  BookOpen,
  CaretRight,
  ClipboardText,
  Gear,
  House,
  Keyboard,
  MagnifyingGlass,
  MoonStars,
  Plus,
  ShieldCheck,
  Stethoscope,
  Sun,
} from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { ConnectionStatus } from '@/components/domain/connection-status';
import { OfflineQueueBadge } from '@/components/domain/offline-queue-badge';
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

type NavLink = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: typeof House;
};

/**
 * S20-UX-01 — Feature flag local para o ⌘K (palette de ações rápidas).
 *
 * O componente existe e está preservado, mas hoje é um placeholder exposto em
 * produção com copy de roadmap ("entra na F3"). Até a implementação funcional
 * (busca real por atendimentos, diretrizes, ações), o botão é ocultado e o
 * listener de teclado é desativado — evita falsa expectativa do usuário.
 *
 * Para reativar (em dev/staging): mudar para `true`.
 */
const FEATURE_COMMAND_K_ENABLED = false;

const NAV_BY_ROLE: Record<AppRole, NavLink[]> = {
  physician: [
    { href: '/dashboard', label: 'Painel', icon: House },
    { href: '/encounters', label: 'Atendimentos', shortLabel: 'Casos', icon: ClipboardText },
    { href: '/guidelines', label: 'Diretrizes', shortLabel: 'Guias', icon: BookOpen },
  ],
  compliance: [
    { href: '/dashboard', label: 'Painel', icon: House },
    { href: '/audit', label: 'Auditoria', shortLabel: 'Audit', icon: ShieldCheck },
    { href: '/guidelines', label: 'Diretrizes', shortLabel: 'Guias', icon: BookOpen },
    { href: '/admin', label: 'Console', shortLabel: 'Admin', icon: Gear },
  ],
  admin: [
    { href: '/dashboard', label: 'Painel', icon: House },
    { href: '/audit', label: 'Auditoria', shortLabel: 'Audit', icon: ShieldCheck },
    { href: '/guidelines', label: 'Diretrizes', shortLabel: 'Guias', icon: BookOpen },
    { href: '/admin', label: 'Console', shortLabel: 'Admin', icon: Gear },
  ],
};

const MOBILE_TABS: NavLink[] = [
  { href: '/dashboard', label: 'Painel', icon: House },
  { href: '/encounters/new', label: 'Novo', icon: Plus },
  { href: '/encounters', label: 'Atendimentos', shortLabel: 'Casos', icon: ClipboardText },
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

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  if (!resolvedTheme) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <span className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-pressed={resolvedTheme === 'dark'}
      aria-label={
        resolvedTheme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'
      }
    >
      {resolvedTheme === 'dark' ? <MoonStars className="size-4" /> : <Sun className="size-4" />}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}

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
        variant="outline"
        className="hidden min-w-44 justify-between md:flex"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <MagnifyingGlass className="size-4" />
          Ações rápidas
        </span>
        <Badge variant="outline">⌘K</Badge>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-9 w-9"
        onClick={() => setOpen(true)}
      >
        <Keyboard className="size-4" />
        <span className="sr-only">Abrir ações rápidas</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle variant="brand">Ações rápidas</DialogTitle>
            <DialogDescription>
              Scaffold inicial da paleta global. A busca funcional entra na F3.
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

function MobileNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useAuth();
  const links = NAV_BY_ROLE[role];

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 md:px-6">
          <MobileNav links={links} />
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold md:mr-6">
            <Stethoscope className="size-5 text-primary" />
            <span className="hidden md:inline">Copiloto Clínico</span>
          </Link>
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-1 text-sm"
          >
            {links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/*
              S23-CLIN-03 — badge de fila offline visível no header.
              Só aparece quando há itens pendentes (count > 0).
            */}
            <OfflineQueueBadge />
            <QuickActions />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        aria-label="Conteúdo principal"
        className="flex-1 container px-4 py-6 pb-24 md:px-6 md:pb-6"
      >
        {children}
      </main>
      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-2 backdrop-blur md:hidden"
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
                <span>{tab.shortLabel ?? tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
