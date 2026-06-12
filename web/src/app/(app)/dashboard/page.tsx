"use client";

import Link from "next/link";
import { useDashboardStats, useEncounterList } from "@/lib/clinical-queries";
import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DEMO_CASE_PRESETS } from "@/lib/demo-case-presets";
import { cn } from "@/lib/utils";

const VERTICAL_LABELS: Record<string, string> = {
  trauma: "Trauma",
  cardiac: "Cardíaco",
  pediatric: "Pediátrico",
  neuro: "Neuro",
  general: "Geral",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em Revisão",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  in_review: "secondary",
  finalized: "default",
  cancelled: "destructive",
};

const STATUS_HREFS: Record<string, string> = {
  draft: "/encounters?status=draft",
  in_review: "/encounters?status=in_review",
  finalized: "/encounters?status=finalized",
};

export default function DashboardPage() {
  const { physician } = useAuth();
  const statsQuery = useDashboardStats();
  const recentQuery = useEncounterList({ limit: 5 });
  const draftsQuery = useEncounterList({ status: "draft", limit: 3 });
  const reviewsQuery = useEncounterList({ status: "in_review", limit: 3 });

  const loading = statsQuery.isPending || recentQuery.isPending;
  const error =
    statsQuery.error?.message ?? recentQuery.error?.message ?? null;

  const recentEncounters = recentQuery.data?.data ?? [];
  const drafts = draftsQuery.data?.data ?? [];
  const reviews = reviewsQuery.data?.data ?? [];
  const inProgress = [...drafts, ...reviews].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel"
        description={`Bem-vindo de volta, Dr. ${physician?.name?.split(" ")[0] ?? "Médico"}`}
      >
        <Button asChild>
          <Link href="/encounters/new">Novo Atendimento</Link>
        </Button>
      </PageHeader>

      {physician && !physician.crmVerified && (
        <Alert className="border-orange-500/50 bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
          <AlertTitle className="font-semibold">CRM não verificado</AlertTitle>
          <AlertDescription>
            Seu CRM ({physician.crmUf} {physician.crmNumber}) ainda não foi validado contra o
            Conselho Federal de Medicina. Documentos gerados serão marcados como{" "}
            <strong>&quot;CRM pendente de verificação&quot;</strong>. A verificação automática estará
            disponível em breve.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <MetricsSkeleton />
      ) : (
        <div className="divide-x divide-border overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-3">
            <MetricLink
              href={`/encounters?dateFrom=${todayStr}&dateTo=${todayStr}`}
              label="Hoje"
              value={statsQuery.data?.todayCount ?? 0}
            />
            <MetricLink
              href="/encounters?status=in_review"
              label="Revisões"
              value={statsQuery.data?.pendingReviews ?? 0}
            />
            <MetricLink
              href="/encounters"
              label="Confirmados"
              value={statsQuery.data?.confirmedDocuments ?? 0}
            />
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void statsQuery.refetch();
                void recentQuery.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && inProgress.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continuar de onde parou</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/encounters?status=draft">Ver todos</Link>
            </Button>
          </div>
          <div className="space-y-2">
            {inProgress.slice(0, 3).map((enc) => (
              <Link
                key={enc.id}
                href={`/encounters/${enc.id}`}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{enc.patientRef}</span>
                  <Badge variant={STATUS_VARIANTS[enc.status] ?? "outline"} className="font-mono text-xs">
                    {STATUS_LABELS[enc.status] ?? enc.status}
                  </Badge>
                </div>
                <time
                  dateTime={enc.updatedAt}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {new Date(enc.updatedAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </time>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Casos Piloto</h2>
          <span className="text-sm text-muted-foreground">
            {DEMO_CASE_PRESETS.length} casos
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {DEMO_CASE_PRESETS.map((preset) => (
            <Card key={preset.slug} className="border-border/60">
              <CardContent className="flex h-full flex-col gap-4 pt-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{preset.title}</p>
                    <Badge variant="outline">
                      {VERTICAL_LABELS[preset.vertical] ?? preset.vertical}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{preset.summary}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {preset.context.isSus && <Badge variant="secondary">SUS</Badge>}
                  {preset.context.hasLab && <Badge variant="secondary">Laboratório</Badge>}
                  {preset.context.hasICU && <Badge variant="secondary">UTI</Badge>}
                  {preset.context.hasCT && <Badge variant="secondary">TC</Badge>}
                </div>

                <Button asChild className="mt-auto w-full">
                  <Link href={`/encounters/new?demoCase=${preset.slug}`}>
                    Abrir Caso Demo
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Atendimentos Recentes</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/encounters">Ver todos</Link>
          </Button>
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!loading && recentEncounters.length === 0 && (
          <EmptyState
            title="Nenhum atendimento encontrado"
            description="Os atendimentos que você criar aparecerão aqui."
            actionLabel="Criar primeiro atendimento"
            actionHref="/encounters/new"
          />
        )}

        {!loading && recentEncounters.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Paciente</th>
                  <th className="px-4 py-2.5">Vertical</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentEncounters.map((enc) => (
                  <tr
                    key={enc.id}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                    onClick={() => {
                      const href = STATUS_HREFS[enc.status]
                        ? `/encounters/${enc.id}`
                        : `/encounters/${enc.id}`;
                      window.location.href = href;
                    }}
                    tabIndex={0}
                    role="link"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        window.location.href = `/encounters/${enc.id}`;
                      }
                    }}
                  >
                    <td className="px-4 py-2.5 font-medium">{enc.patientRef}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {VERTICAL_LABELS[enc.vertical] ?? enc.vertical}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={STATUS_VARIANTS[enc.status] ?? "outline"}
                        className="font-mono text-xs"
                      >
                        {STATUS_LABELS[enc.status] ?? enc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <time dateTime={enc.createdAt} className="font-mono text-xs text-muted-foreground">
                        {new Date(enc.createdAt).toLocaleDateString("pt-BR")}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-1 px-4 py-4 text-center transition-colors hover:bg-muted/50",
      )}
    >
      <span className="font-mono text-3xl font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Link>
  );
}

function MetricsSkeleton() {
  return (
    <div className="divide-x divide-border overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-4 py-4">
            <Skeleton className="h-9 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
