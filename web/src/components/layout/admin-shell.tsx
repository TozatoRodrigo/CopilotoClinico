'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ChartBar,
  Database,
  Gear,
  House,
  MoonStars,
  ShieldCheck,
  ShieldWarning,
  Stethoscope,
  Sun,
  UserCircle,
  Users,
} from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth, type AppRole } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type AdminSection = {
  href: string;
  label: string;
  icon: typeof House;
  roles: AppRole[];
  /**
   * S20-UX-01 — feature flag local para esconder items não prontos.
   * `false` remove o item do nav (código preservado para reativação).
   * Default: true.
   */
  enabled?: boolean;
};

const ADMIN_SECTIONS: AdminSection[] = [
  { href: '/admin', label: 'Visão geral', icon: House, roles: ['compliance', 'admin'] },
  {
    href: '/admin/crm-verifications',
    label: 'Verificações CRM',
    icon: ShieldCheck,
    roles: ['compliance', 'admin'],
  },
  {
    href: '/admin/diretrizes',
    label: 'Diretrizes',
    icon: Database,
    roles: ['compliance', 'admin'],
  },
  { href: '/audit', label: 'Auditoria', icon: ShieldWarning, roles: ['compliance', 'admin'] },
  { href: '/admin/analytics', label: 'Analytics', icon: ChartBar, roles: ['admin'] },
  // S20-UX-01 — placeholders expostos como funcionais. Escondidos até terem
  // implementação real (gerenciamento de usuários e configurações de sistema).
  // As rotas /admin/users e /admin/sistema continuam acessíveis via URL direta
  // (guard de rota por papel será tratado na Sprint 25).
  { href: '/admin/users', label: 'Usuários', icon: Users, roles: ['admin'], enabled: false },
  { href: '/admin/sistema', label: 'Sistema', icon: Gear, roles: ['admin'], enabled: false },
];

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  if (!resolvedTheme) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <span className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
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

function AdminUserMenu() {
  const { physician, logout, role } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await apiClient.post('/auth/logout').catch(() => undefined);
    logout();
    router.push('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
          aria-label="Abrir menu do usuário"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
              {(physician?.name ?? 'Ad').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col text-left sm:flex">
            <span className="text-xs font-medium leading-tight">{physician?.name ?? 'Admin'}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{role}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Conta administrativa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <Stethoscope className="size-4" />
              Voltar ao workspace
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings?tab=perfil">
              <UserCircle className="size-4" />
              Perfil
            </Link>
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

function MobileSidebar({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden">
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
          <span className="sr-only">Menu admin</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="px-4 py-3 text-sm font-semibold text-primary">
          Console Admin
        </SheetTitle>
        <nav aria-label="Navegação administrativa móvel" className="flex flex-col gap-0.5 px-2">
          {sections.map((section) => {
            const isActive =
              pathname === section.href ||
              (section.href !== '/admin' && pathname.startsWith(section.href + '/'));
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {section.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useAuth();

  // S20-UX-01 — filtra items marcados como enabled:false (placeholders não prontos).
  const sections = ADMIN_SECTIONS.filter(
    (s) => s.roles.includes(role) && s.enabled !== false,
  );
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    setNow(new Date().toLocaleString('pt-BR'));
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar lg:flex">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ShieldCheck className="size-5 text-primary" weight="duotone" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight text-sidebar-foreground">
              Console Admin
            </span>
            <span className="text-[10px] font-mono text-muted-foreground leading-tight">
              Copiloto Clínico
            </span>
          </div>
        </div>

        <nav aria-label="Navegação administrativa" className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Operação
          </div>
          {sections.map((section) => {
            const isActive =
              pathname === section.href ||
              (section.href !== '/admin' && pathname.startsWith(section.href + '/'));
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t px-3 py-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Voltar ao workspace
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col lg:pl-60">
        {/* Top bar — dense, data-oriented */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <MobileSidebar sections={sections} />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {role.toUpperCase()}
            </Badge>
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              {now}
            </span>
          </div>
          <div className="flex-1" />
          <ThemeToggle />
          <AdminUserMenu />
        </header>

        {/* Content */}
        <main
          id="admin-main-content"
          aria-label="Conteúdo administrativo"
          className="flex-1 overflow-x-hidden px-4 py-5 pb-20 lg:px-6 lg:pb-5"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
