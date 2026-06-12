"use client";

import { use } from "react";
import { useEncounterDetail } from "@/lib/clinical-queries";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { EncounterContext } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em Revisão",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  finalized: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const CONTEXT_LABELS: Record<string, string> = {
  hasCT: "TC",
  isSus: "SUS",
  hasLab: "Laboratório",
  hasICU: "UTI",
};

const VERTICAL_LABELS: Record<string, string> = {
  trauma: "Trauma",
  cardiac: "Cardíaco",
  pediatric: "Pediátrico",
  neuro: "Neuro",
  general: "Geral",
};

export default function EncounterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const encounterQuery = useEncounterDetail(id);
  const encounter = encounterQuery.data;
  const documents = encounter?.documents ?? [];
  const loading = encounterQuery.isPending;
  const error = encounterQuery.error?.message ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !encounter) {
    return (
      <div className="space-y-6">
        <Button variant="outline" asChild>
          <a href="/dashboard">Voltar</a>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error ?? "Atendimento não encontrado."}</span>
            <Button variant="outline" size="sm" onClick={() => void encounterQuery.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const activeContexts = Object.entries(CONTEXT_LABELS).filter(
    ([key]) => encounter.context[key as keyof EncounterContext]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={encounter.patientRef}
        description={`Atendimento ${encounter.id}`}
      >
        <Button variant="outline" asChild>
          <a href="/dashboard">Voltar</a>
        </Button>
        <Button asChild>
          <a href={`/encounters/${id}/capture`}>Analisar com Copiloto</a>
        </Button>
      </PageHeader>

      <SectionCard title="Informações">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Paciente</p>
            <p className="font-medium">{encounter.patientRef}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Vertical</p>
            <p className="font-medium">{VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge className={STATUS_CLASSES[encounter.status] ?? ""}>
              {STATUS_LABELS[encounter.status] ?? encounter.status}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data</p>
            <p className="font-medium">
              {new Date(encounter.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        {activeContexts.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">Contexto</p>
            <div className="flex flex-wrap gap-2">
              {activeContexts.map(([, label]) => (
                <Badge key={label} variant="secondary">{label}</Badge>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Documentos" badge={String(documents.length)}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum documento vinculado a este atendimento.
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{doc.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant={doc.confirmedBy ? "default" : "outline"}>
                  {doc.confirmedBy ? "Confirmado" : "Rascunho"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
