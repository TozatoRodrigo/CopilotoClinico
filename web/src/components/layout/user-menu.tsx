'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CaretUpDown,
  Gear,
  MoonStars,
  SignOut,
  SquaresFour,
  Stethoscope,
  Sun,
  UserCircle,
} from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { useAuth, type AppRole } from '@/lib/auth-store';
import { useTheme } from '@/components/providers/theme-provider';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { LogoMark } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<AppRole, string> = {
  physician: 'Médico',
  compliance: 'Compliance',
  admin: 'Admin',
};

export function initialsOf(name: string | null | undefined, fallback = 'Dr'): string {
  const parts = (name ?? '').replace(/^dr[a]?\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase();
}

export function UserAvatar({ className }: { className?: string }) {
  const { physician } = useAuth();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-gray-tag text-[0.625rem] font-semibold text-tone-gray-ink',
        className,
      )}
    >
      {initialsOf(physician?.name)}
    </span>
  );
}

function UserMenuContent({
  align,
  context,
}: {
  align: 'start' | 'end';
  context: 'app' | 'admin';
}) {
  const { physician, logout, role } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { isOnline } = useOnlineStatus();
  const router = useRouter();
  const isStaff = role === 'compliance' || role === 'admin';

  async function handleLogout() {
    await apiClient.post('/auth/logout').catch(() => undefined);
    logout();
    router.push('/login');
  }

  return (
    <DropdownMenuContent align={align} className="w-72">
      <div className="flex items-start gap-2.5 px-2 pt-2 pb-2.5">
        <UserAvatar className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {physician?.name ?? 'Médico'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {physician?.email ?? 'Sessão ativa'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>
            {physician && (
              <span className="text-xs text-muted-foreground">
                CRM {physician.crmUf}-{physician.crmNumber}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 rounded-full',
                  isOnline ? 'bg-clinical-green' : 'bg-clinical-amber',
                )}
              />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=perfil">
            <UserCircle className="text-muted-foreground" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=seguranca">
            <Gear className="text-muted-foreground" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          }}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="text-muted-foreground" />
          ) : (
            <MoonStars className="text-muted-foreground" />
          )}
          {resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        </DropdownMenuItem>
        {isStaff && context === 'app' && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <SquaresFour className="text-muted-foreground" />
              Console administrativo
            </Link>
          </DropdownMenuItem>
        )}
        {context === 'admin' && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <Stethoscope className="text-muted-foreground" />
              Voltar ao Plantão
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
        <SignOut />
        Sair
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/**
 * Seletor de "workspace" do topo do sidebar (como no Notion): marca + nome do
 * produto + nome do médico; abre o menu da conta.
 */
export function WorkspaceSwitcher({
  context = 'app',
  title = 'Copiloto Clínico',
}: {
  context?: 'app' | 'admin';
  title?: string;
}) {
  const { physician } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do usuário"
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none aria-expanded:bg-hover"
        >
          <LogoMark size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-tight font-semibold text-foreground">
              {title}
            </span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {physician?.name ?? 'Médico'}
            </span>
          </span>
          <CaretUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <UserMenuContent align="start" context={context} />
    </DropdownMenu>
  );
}

/** Avatar compacto que abre o menu da conta (barra superior no mobile). */
export function UserAvatarMenu({ context = 'app' }: { context?: 'app' | 'admin' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do usuário"
          className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:size-10"
        >
          <UserAvatar />
        </button>
      </DropdownMenuTrigger>
      <UserMenuContent align="end" context={context} />
    </DropdownMenu>
  );
}
