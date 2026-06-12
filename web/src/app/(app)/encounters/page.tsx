"use client";

import Link from "next/link";
import { Funnel, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useEncounterList } from "@/lib/clinical-queries";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/domain/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

const STATUS_VARIANTS: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  in_review: "secondary",
  finalized: "default",
  cancelled: "destructive",
};

export default function EncountersIndexPage() {
  const [query, setQuery] = useState("");
  const encountersQuery = useEncounterList(20);
  const filtered = useMemo(() => {
    const encounters = encountersQuery.data?.data ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return encounters;
    return encounters.filter((encounter) =>
      [encounter.patientRef, encounter.id, encounter.vertical]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [encountersQuery.data?.data, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimentos"
        description="Hub enxuto para retomar casos, abrir novos e preparar a lista completa da sprint B2."
      >
        <Button asChild>
          <Link href="/encounters/new">
            <Plus className="size-4" />
            Novo Atendimento
          </Link>
        </Button>
      </PageHeader>

      <SectionCard title="Busca rápida" badge="Scaffold">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por paciente, ID ou vertical"
              className="pl-9"
            />
          </div>
          <Button variant="outline" disabled>
            <Funnel className="size-4" />
            Filtros completos em B2
          </Button>
        </div>
      </SectionCard>

      {encountersQuery.isPending && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      )}

      {encountersQuery.error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{encountersQuery.error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void encountersQuery.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!encountersQuery.isPending && !encountersQuery.error && (
        <SectionCard title="Casos recentes" badge={String(filtered.length)}>
          {filtered.length === 0 ? (
            <EmptyState
              title={query ? "Nenhum atendimento encontrado" : "Nenhum atendimento disponível"}
              description={
                query
                  ? "Ajuste o termo de busca para localizar outro caso."
                  : "Crie um novo atendimento para começar a montar sua fila."
              }
              actionLabel="Novo Atendimento"
              actionHref="/encounters/new"
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((encounter) => (
                <Link
                  key={encounter.id}
                  href={`/encounters/${encounter.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-clinical-teal/40 hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{encounter.patientRef}</p>
                      <Badge variant={STATUS_VARIANTS[encounter.status] ?? "outline"}>
                        {STATUS_LABELS[encounter.status] ?? encounter.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {encounter.id} · {encounter.vertical}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(encounter.updatedAt).toLocaleString("pt-BR")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
