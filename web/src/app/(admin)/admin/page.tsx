'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CaretRight,
  ChartBar,
  Database,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  SquaresFour,
  Warning,
  type Icon,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import {
  useCrmVerifications,
  useGuidelineSources,
  usePendingGuidelineChunks,
} from '@/lib/clinical-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard, StatStrip } from '@/components/ui/stat-card';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import {
  DEFAULT_COST_DAYS,
  DEFAULT_PROJECTED_USERS,
  formatCost,
  useAiCostReport,
} from './_lib/ai-cost';
import { formatDay, formatRelative, isReviewOverdue, REVIEW_CYCLE_MONTHS } from './_lib/format';
import { ColumnChart } from './_components/charts';
import { specialtyLabel } from '@/components/domain/suggest-guideline-dialog';

type ConsoleRole = 'compliance' | 'admin';

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: Icon;
  roles: ConsoleRole[];
  /**
   * S20-UX-01 — feature flag para esconder lançadores não prontos.
   */
  enabled?: boolean;
}

/**
 * PI-02 — Analytics também para Compliance, alinhado ao sidebar
 * (nav-config.ts) e ao RBAC do backend em /analytics/cost.
 */
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
    roles: ['compliance', 'admin'],
  },
];

const ROLE_LABEL: Record<ConsoleRole, string> = { admin: 'Admin', compliance: 'Compliance' };

const PREVIEW_LIMIT = 4;

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm px-1.5 py-0.5 text-[0.8125rem] whitespace-nowrap text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-2"
    >
      {children}
    </Link>
  );
}

/** Linha de lista compacta do Notion: a linha inteira é o link. */
function ListRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-11 items-center gap-3 px-2 py-2 transition-colors duration-75 hover:bg-hover/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-inset"
      >
        {children}
        <CaretRight
          className="size-3.5 shrink-0 text-fg-tertiary transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border border-y border-border" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function ListMessage({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 border-y border-border px-2 py-2.5 text-sm text-muted-foreground">
      {icon}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="max-sm:h-10">
      Tentar novamente
    </Button>
  );
}

export default function AdminOverviewPage() {
  const { role, physician } = useAuth();
  const consoleRole: ConsoleRole | null = role === 'compliance' || role === 'admin' ? role : null;
  const links = QUICK_LINKS.filter(
    (link) => consoleRole !== null && link.roles.includes(consoleRole) && link.enabled !== false,
  );
  const canSeeAnalytics = links.some((link) => link.href === '/admin/analytics');

  // S25-ADM-02 — fetch de pendências para mostrar counts no overview.
  const crmQuery = useCrmVerifications('PENDING');
  const chunksQuery = usePendingGuidelineChunks();
  const sourcesQuery = useGuidelineSources();
  // Mesma chave do painel de custo em /admin/analytics (cache compartilhado).
  const costQuery = useAiCostReport(
    DEFAULT_COST_DAYS,
    canSeeAnalytics ? DEFAULT_PROJECTED_USERS : null,
  );

  const crmPending = crmQuery.data ?? [];
  const crmPendingCount = crmPending.length;
  const pendingChunks = chunksQuery.data ?? [];
  const activeSources = (sourcesQuery.data ?? []).filter((s) => s.active);
  const overdueCount = activeSources.filter((s) => isReviewOverdue(s.validFrom)).length;
  const cost = costQuery.data;

  const metricsLoading = crmQuery.isPending || chunksQuery.isPending || sourcesQuery.isPending;

  return (
    <Page width="default">
      <PageHeader
        icon={SquaresFour}
        eyebrow={
          <>
            {consoleRole ? ROLE_LABEL[consoleRole] : 'Console'} · {physician?.name ?? 'Administrador'}
          </>
        }
        title="Console"
        description="Visão operacional — o que pede ação agora e o estado de cada área do console."
      />

      {/* S25-ADM-02 — métricas de pendência */}
      {metricsLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
          <StatCard
            label="CRMs aguardando verificação"
            value={crmQuery.error ? '—' : crmPendingCount}
            sublabel={crmPendingCount === 1 ? 'solicitação na fila' : 'solicitações na fila'}
            variant={crmPendingCount > 0 ? 'highlight' : 'default'}
          />
          <StatStrip
            className="max-sm:flex-col max-sm:divide-x-0 max-sm:divide-y"
            items={[
              { label: 'Trechos em revisão', value: chunksQuery.error ? '—' : pendingChunks.length },
              { label: 'Fontes ativas', value: sourcesQuery.error ? '—' : activeSources.length },
              ...(canSeeAnalytics
                ? [
                    {
                      label: `Custo de IA · ${DEFAULT_COST_DAYS}d`,
                      value: cost ? formatCost(cost.totals.totalCost) : costQuery.isPending ? '…' : '—',
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}

      {/* Verificações CRM — fila que pede ação */}
      <section className="flex flex-col gap-2" aria-labelledby="overview-crm">
        <SectionHeader
          title={<span id="overview-crm">Verificações CRM</span>}
          count={
            crmPendingCount > 0 ? (
              <Badge variant="warning">
                {crmPendingCount} pendente{crmPendingCount !== 1 ? 's' : ''}
              </Badge>
            ) : undefined
          }
          action={<SectionLink href="/admin/crm-verifications">Abrir fila →</SectionLink>}
        />
        {crmQuery.isPending ? (
          <ListSkeleton />
        ) : crmQuery.error ? (
          <ListMessage
            icon={<Warning className="size-4 shrink-0 text-tone-red" weight="fill" aria-hidden="true" />}
            action={<RetryButton onClick={() => void crmQuery.refetch()} />}
          >
            Não foi possível carregar a fila de CRM.
          </ListMessage>
        ) : crmPendingCount === 0 ? (
          <ListMessage icon={<SealCheck className="size-4 shrink-0 text-tone-green" weight="fill" aria-hidden="true" />}>
            Fila zerada — nenhuma solicitação aguardando análise.
          </ListMessage>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {crmPending.slice(0, PREVIEW_LIMIT).map((item) => (
              <ListRow key={item.id} href="/admin/crm-verifications">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.physician.name ?? item.physician.email}
                  </p>
                  <p className="truncate text-[0.8125rem] text-muted-foreground">
                    <span className="font-mono">
                      CRM-{item.physician.crmUf} {item.physician.crmNumber}
                    </span>
                    {item.physician.name ? ` · ${item.physician.email}` : null}
                  </p>
                </div>
                <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
                  {formatRelative(item.requestedAt)}
                </span>
              </ListRow>
            ))}
          </ul>
        )}
        {crmPendingCount > PREVIEW_LIMIT && (
          <p className="px-2 text-xs text-muted-foreground">
            +{crmPendingCount - PREVIEW_LIMIT} na fila
          </p>
        )}
      </section>

      {/* Curadoria de diretrizes (KB-002) */}
      <section className="flex flex-col gap-2" aria-labelledby="overview-guidelines">
        <SectionHeader
          title={<span id="overview-guidelines">Curadoria de diretrizes</span>}
          count={
            pendingChunks.length > 0 ? (
              <Badge variant="warning">{pendingChunks.length} em revisão</Badge>
            ) : undefined
          }
          action={<SectionLink href="/admin/diretrizes">Abrir diretrizes →</SectionLink>}
        />
        {overdueCount > 0 && (
          <Callout tone="orange" icon={<Warning weight="fill" />}>
            {overdueCount} fonte(s) com revisão vencida (&gt; {REVIEW_CYCLE_MONTHS} meses). Atualize ou reingira a fonte.
          </Callout>
        )}
        {chunksQuery.isPending ? (
          <ListSkeleton rows={2} />
        ) : chunksQuery.error ? (
          <ListMessage
            icon={<Warning className="size-4 shrink-0 text-tone-red" weight="fill" aria-hidden="true" />}
            action={<RetryButton onClick={() => void chunksQuery.refetch()} />}
          >
            Não foi possível carregar os trechos em revisão.
          </ListMessage>
        ) : pendingChunks.length === 0 ? (
          <ListMessage icon={<SealCheck className="size-4 shrink-0 text-tone-green" weight="fill" aria-hidden="true" />}>
            Nenhum trecho aguardando curadoria.
          </ListMessage>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {pendingChunks.slice(0, PREVIEW_LIMIT).map((chunk) => (
              <ListRow key={chunk.id} href="/admin/diretrizes">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {chunk.source} <span className="font-normal text-muted-foreground">v{chunk.sourceVersion}</span>
                  </p>
                  <p className="truncate text-[0.8125rem] text-muted-foreground">{chunk.text}</p>
                </div>
                <Badge variant="brown" className="hidden sm:inline-flex">
                  {specialtyLabel(chunk.specialty)}
                </Badge>
                <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
                  {formatRelative(chunk.createdAt)}
                </span>
              </ListRow>
            ))}
          </ul>
        )}
      </section>

      {/* PI-02 — resumo de custo de IA */}
      {canSeeAnalytics && (
        <section className="flex flex-col gap-2" aria-labelledby="overview-cost">
          <SectionHeader
            title={<span id="overview-cost">Custo de IA</span>}
            count={`últimos ${DEFAULT_COST_DAYS} dias`}
            action={<SectionLink href="/admin/analytics">Ver analytics →</SectionLink>}
          />
          <div className="flex flex-col gap-4 rounded-lg border border-border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6">
            {costQuery.isPending ? (
              <Skeleton className="h-14 w-full" />
            ) : costQuery.error || !cost ? (
              <div className="flex flex-1 items-center gap-2.5 text-sm text-muted-foreground">
                <Warning className="size-4 shrink-0 text-tone-red" weight="fill" aria-hidden="true" />
                <span className="flex-1">Não foi possível carregar o custo de IA.</span>
                <RetryButton onClick={() => void costQuery.refetch()} />
              </div>
            ) : (
              <>
                <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-[auto_auto]">
                  <div>
                    <dt className="text-[0.8125rem] text-muted-foreground">Total</dt>
                    <dd className="text-xl leading-tight font-semibold">{formatCost(cost.totals.totalCost)}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.8125rem] text-muted-foreground">Por caso</dt>
                    <dd className="text-xl leading-tight font-semibold">{formatCost(cost.totals.avgCostPerCase)}</dd>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground tabular-nums">
                    {cost.totals.interactionCount} análises · {cost.totals.encounterCount} casos
                  </div>
                </dl>
                {cost.byDay.length > 0 && (
                  <ColumnChart
                    compact
                    height={56}
                    className="min-w-0 flex-1"
                    data={cost.byDay.map((d) => ({ key: d.date, label: formatDay(d.date), value: d.cost }))}
                    formatValue={formatCost}
                    figureLabel={`Custo diário de IA nos últimos ${DEFAULT_COST_DAYS} dias. Detalhes em Analytics.`}
                  />
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Lançadores — páginas do console como lista do Notion */}
      <section className="flex flex-col gap-2" aria-labelledby="overview-areas">
        <SectionHeader title={<span id="overview-areas">Áreas do console</span>} />
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {links.map((link) => {
            const LinkIcon = link.icon;
            const pending =
              link.href === '/admin/crm-verifications'
                ? crmPendingCount
                : link.href === '/admin/diretrizes'
                  ? pendingChunks.length
                  : 0;
            return (
              <li key={link.href} className="border-b border-border">
                <Link
                  href={link.href}
                  className="group flex min-h-14 items-center gap-3 rounded-sm px-2 py-2.5 transition-colors duration-75 hover:bg-hover/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <LinkIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {link.label}
                      {/* S25-ADM-02 — badge de pendentes */}
                      {pending > 0 && (
                        <Badge variant="warning">
                          {pending} pendente{pending !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-[0.8125rem] text-muted-foreground">
                      {link.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-fg-tertiary transition-colors group-hover:text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}
