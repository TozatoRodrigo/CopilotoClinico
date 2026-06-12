"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DEMO_CASE_PRESETS } from "@/lib/demo-case-presets";

interface Encounter {
  id: string;
  patientRef: string;
  vertical: string;
  status: string;
  context: {
    hasCT: boolean;
    isSus: boolean;
    hasLab: boolean;
    hasICU: boolean;
  };
  createdAt: string;
}

interface EncountersResponse {
  data: Encounter[];
  total: number;
}

interface DashboardStats {
  todayCount: number;
  pendingReviews: number;
  confirmedDocuments: number;
}

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
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [encountersResponse, statsResponse] = await Promise.all([
          apiClient.get<EncountersResponse>("/encounters"),
          apiClient.get<DashboardStats>("/encounters/stats"),
        ]);
        setEncounters(encountersResponse.data.slice(0, 5));
        setStats(statsResponse);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Erro ao carregar atendimentos.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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
            <strong>"CRM pendente de verificação"</strong>. A verificação automática estará
            disponível em breve.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Atendimentos Hoje</p>
            {loading ? (
              <Skeleton className="mt-1 h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold">{stats?.todayCount ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Revisões Pendentes</p>
            {loading ? (
              <Skeleton className="mt-1 h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold">{stats?.pendingReviews ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Documentos Confirmados</p>
            {loading ? (
              <Skeleton className="mt-1 h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold">{stats?.confirmedDocuments ?? 0}</p>
            )}
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && encounters.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum atendimento encontrado.
          </p>
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
