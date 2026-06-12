"use client";

import Link from "next/link";
import { useDashboardStats, useEncounterList } from "@/lib/clinical-queries";
import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataMetric } from "@/components/domain/data-metric";
import { EmptyState } from "@/components/domain/empty-state";
import { DEMO_CASE_PRESETS } from "@/lib/demo-case-presets";

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

export default function DashboardPage() {
  const { physician } = useAuth();
  const encountersQuery = useEncounterList({ limit: 5 });
  const statsQuery = useDashboardStats();
  const encounters = encountersQuery.data?.data ?? [];
  const loading = encountersQuery.isPending || statsQuery.isPending;
  const error = encountersQuery.error?.message ?? statsQuery.error?.message ?? null;

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

      {/* Banner IAM-001 — CRM não verificado.
          Exibido enquanto crmVerified=false para manter honestidade sobre
          o estado real do sistema. Remoção depende de verificação real (R1). */}
      {physician && !physician.crmVerified && (
        <Alert className="border-orange-500/50 bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
          <AlertTitle className="font-semibold">
            CRM não verificado
          </AlertTitle>
          <AlertDescription>
            Seu CRM ({physician.crmUf} {physician.crmNumber}) ainda não foi validado contra o
            Conselho Federal de Medicina. Documentos gerados serão marcados como{" "}
            <strong>&quot;CRM pendente de verificação&quot;</strong>. A verificação automática estará
            disponível em breve.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <DataMetric
              label="Atendimentos Hoje"
              value={statsQuery.data?.todayCount ?? 0}
              loading={loading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <DataMetric
              label="Revisões Pendentes"
              value={statsQuery.data?.pendingReviews ?? 0}
              loading={loading}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <DataMetric
              label="Documentos Confirmados"
              value={statsQuery.data?.confirmedDocuments ?? 0}
              loading={loading}
            />
          </CardContent>
        </Card>
      </div>

      <SectionCard title="Casos Piloto da Rodada 2" badge={String(DEMO_CASE_PRESETS.length)}>
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
      </SectionCard>

      <SectionCard title="Atendimentos Recentes" badge={String(encounters.length)}>
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
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
                  void encountersQuery.refetch();
                  void statsQuery.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!loading && !error && encounters.length === 0 && (
          <EmptyState
            title="Nenhum atendimento encontrado"
            description="Os atendimentos que você criar aparecerão aqui."
            actionLabel="Novo Atendimento"
            actionHref="/encounters/new"
          />
        )}
        {!loading && !error && encounters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Paciente</th>
                  <th className="pb-2 font-medium">Vertical</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {encounters.map((enc) => (
                  <tr key={enc.id} className="border-b last:border-0">
                    <td className="py-2">{enc.patientRef}</td>
                    <td className="py-2">{VERTICAL_LABELS[enc.vertical] ?? enc.vertical}</td>
                    <td className="py-2">
                      <Badge variant={STATUS_VARIANTS[enc.status] ?? "outline"}>
                        {STATUS_LABELS[enc.status] ?? enc.status}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {new Date(enc.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/encounters/${enc.id}`}>Ver</a>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
