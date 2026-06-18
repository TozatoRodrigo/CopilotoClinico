'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ChartBar,
  Database,
  House,
  ShieldCheck,
  ShieldWarning,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: typeof House;
  roles: ('compliance' | 'admin')[];
  /**
   * S20-UX-01 — feature flag para esconder lançadores não prontos.
   */
  enabled?: boolean;
}

const QUICK_LINKS: QuickLink[] = [
  {
    href: '/admin/crm-verifications',
    label: 'Verificações CRM',
    description: 'Fila de aprovação e rejeição de CRM médico',
    icon: ShieldCheck,
    roles: ['compliance', 'admin'],
  },
  {
    href: '/admin/diretrizes',
    label: 'Diretrizes',
    description: 'Ingestão de diretrizes e catálogo de fontes',
    icon: Database,
    roles: ['compliance', 'admin'],
  },
  {
    href: '/audit',
    label: 'Auditoria',
    description: 'Trilha imutável de todas as ações no sistema',
    icon: ShieldWarning,
    roles: ['compliance', 'admin'],
  },
  {
    href: '/admin/analytics',
    label: 'Analytics',
    description: 'Métricas de uso, custos e performance',
    icon: ChartBar,
    roles: ['admin'],
  },
  // S20-UX-01 — placeholder de Usuários removido do overview (rota ainda não
  // implementada; item de nav já está oculto no admin-shell). Reativar quando
  // a gestão de usuários estiver pronta (Sprint 25+).
];

export default function AdminOverviewPage() {
  const { role, physician } = useAuth();
  const availableLinks = QUICK_LINKS.filter(
    (l) => l.roles.some((r) => r === role) && l.enabled !== false,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Console Administrativo</h1>
          <Badge variant="secondary" className="font-mono text-[10px]">{role.toUpperCase()}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Visão operacional — {physician?.name ?? 'Administrador'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="mt-2 text-sm font-semibold">{link.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{link.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
