'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, List } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { RouteBreadcrumbs } from '@/components/layout/route-breadcrumbs';
import { UserAvatarMenu, WorkspaceSwitcher } from '@/components/layout/user-menu';
import { WorkspaceSidebar } from '@/components/layout/workspace-sidebar';
import { adminSectionsFor, type AdminFeature } from '@/components/layout/nav-config';
import { useMentoringEnabled } from '@/lib/mentoring-queries';
import { LogoMark } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * Console administrativo — mesma linguagem do workspace clínico (sidebar do
 * Notion), com seções de operação e relógio ao vivo na barra superior.
 */

function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useAuth();
  // CC-707 — "Mentoria" só aparece com COPILOT_MENTORING ligada.
  const mentoring = useMentoringEnabled();
  const features = new Set<AdminFeature>(mentoring ? ['mentoring'] : []);
  return (
    <WorkspaceSidebar
      header={<WorkspaceSwitcher context="admin" title="Console admin" />}
      sections={adminSectionsFor(role, features)}
      onNavigate={onNavigate}
      footer={
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex h-[30px] items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <ArrowLeft className="size-[18px] text-muted-foreground" aria-hidden="true" />
          Voltar ao Plantão
        </Link>
      }
    />
  );
}

function LiveClock() {
  // S25-ADM-02 — relógio client-side que ticka a cada segundo, para dar
  // sentido de "ao vivo" ao console (vazio até hidratar).
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
        }),
      );
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline" suppressHydrationWarning>
      {now}
    </span>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <aside
        aria-label="Barra lateral administrativa"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border lg:block"
      >
        <AdminSidebar />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[280px] gap-0 p-0">
          <SheetTitle className="sr-only">Menu do console</SheetTitle>
          <AdminSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 bg-background/95 px-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:px-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu admin"
            className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground lg:hidden"
          >
            <List className="size-5" />
          </button>
          <span className="lg:hidden">
            <LogoMark size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <RouteBreadcrumbs />
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {role === 'admin' ? 'Admin' : 'Compliance'}
          </Badge>
          <LiveClock />
          <ThemeToggle size="sm" />
          <div className="lg:hidden">
            <UserAvatarMenu context="admin" />
          </div>
        </header>

        <main
          id="admin-main-content"
          aria-label="Conteúdo administrativo"
          className="flex-1 overflow-x-hidden px-4 pt-6 pb-16 sm:px-8 md:pt-10 lg:px-12 xl:px-16"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
