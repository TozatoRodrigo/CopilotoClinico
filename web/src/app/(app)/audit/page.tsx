"use client";

import { useState } from "react";
import { useAuditEntries, type AuditFilters } from "@/lib/clinical-queries";
import type { AuditEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { AuditHash } from "@/components/domain/audit-hash";
import { toast } from "sonner";

const ENTITY_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "encounter", label: "Atendimento" },
  { value: "document", label: "Documento" },
  { value: "ai_interaction", label: "Interação IA" },
  { value: "consent", label: "Consentimento" },
];

// DEC-005: rótulos em PT-BR para os eventos do loop de decisão conversacional do copiloto.
const ACTION_LABELS: Record<string, string> = {
  COPILOT_QUESTIONS_EMITTED: "Copiloto enviou perguntas de esclarecimento",
  COPILOT_QUESTION_ANSWERED: "Médico respondeu perguntas do copiloto",
  COPILOT_ANALYSIS_REFINED: "Copiloto refinou a análise",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function downloadJson(data: AuditEntry[], filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [filters, setFilters] = useState<AuditFilters>({
    entity: "",
    entityId: "",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(filters);
  const auditQuery = useAuditEntries(appliedFilters, offset, limit);
  const entries: AuditEntry[] = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const loading = auditQuery.isPending;
  const error = auditQuery.error?.message ?? null;

  function applyFilters() {
    setOffset(0);
    setAppliedFilters(filters);
  }

  function handleExport() {
    if (entries.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }
    downloadJson(entries, `audit-export-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success("Exportação realizada com sucesso.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Trilha de Auditoria
        </h1>
        <p className="text-muted-foreground">
          Registro imutável de todas as ações no sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Entidade</Label>
              <Select
                value={filters.entity}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, entity: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "_all"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID da Entidade</Label>
              <Input
                value={filters.entityId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, entityId: e.target.value }))
                }
                placeholder="ID..."
              />
            </div>
            <div className="space-y-2">
              <Label>Data início</Label>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, from: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Data fim</Label>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, to: e.target.value }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button onClick={applyFilters} className="w-full">
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} registro(s) encontrado(s)
        </p>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Exportar JSON
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void auditQuery.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState
              title="Nenhum registro de auditoria encontrado"
              description="Ajuste os filtros ou aguarde novas ações no sistema."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/*
            S22-DS-01 — layout responsivo (era grid fixo de 5 colunas que
            quebrava no mobile). Agora:
            - Desktop (sm+): grid de 5 colunas (Data/Hora / Ação / Entidade / ID / IP)
            - Mobile (< sm): cada entrada vira um card com label em cima de cada valor
            Linhas expansíveis continuam funcionando (aria-expanded + aria-controls
            atendem S22-A11Y-01 — antes era div role=button sem aria-expanded).
          */}
          <ul className="space-y-2 sm:hidden" aria-label="Entradas de auditoria">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <li key={entry.id} className="list-none">
                  <button
                    type="button"
                    className="block w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={isExpanded}
                    aria-controls={`audit-payload-${entry.id}`}
                    onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Data/Hora
                        </span>
                        <span className="min-w-0 flex-1 text-right text-sm">{formatDate(entry.createdAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Ação
                        </span>
                        <span className="min-w-0 flex-1 text-right text-sm font-medium">
                          {actionLabel(entry.action)}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Entidade
                        </span>
                        <span className="min-w-0 flex-1 text-right text-sm">{entry.entity}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          ID
                        </span>
                        <span className="min-w-0 flex-1 text-right text-sm">
                          <AuditHash
                            hash={entry.entityId}
                            href={entry.entity === "Encounter" ? `/encounters/${entry.entityId}/result` : undefined}
                          />
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          IP
                        </span>
                        <span className="min-w-0 flex-1 text-right font-mono text-xs">{entry.ip ?? "—"}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div
                        id={`audit-payload-${entry.id}`}
                        className="mt-3 overflow-x-auto rounded bg-background p-3 text-xs"
                      >
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(entry.payload, null, 2)}</pre>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hidden rounded-lg border sm:block">
            <div
              className="grid grid-cols-[1fr_1.4fr_1fr_1fr_0.8fr] gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              aria-hidden="true"
            >
              <span>Data/Hora</span>
              <span>Ação</span>
              <span>Entidade</span>
              <span>ID</span>
              <span>IP</span>
            </div>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id}>
                  <button
                    type="button"
                    className="grid w-full grid-cols-[1fr_1.4fr_1fr_1fr_0.8fr] gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-expanded={isExpanded}
                    aria-controls={`audit-payload-${entry.id}`}
                    onClick={() =>
                      setExpandedId((prev) => (prev === entry.id ? null : entry.id))
                    }
                  >
                    <span>{formatDate(entry.createdAt)}</span>
                    <span className="font-medium">{actionLabel(entry.action)}</span>
                    <span>{entry.entity}</span>
                    <span
                      className="truncate"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <AuditHash
                        hash={entry.entityId}
                        href={entry.entity === "Encounter" ? `/encounters/${entry.entityId}/result` : undefined}
                      />
                    </span>
                    <span className="font-mono text-xs">{entry.ip ?? "—"}</span>
                  </button>
                  {isExpanded && (
                    <div
                      id={`audit-payload-${entry.id}`}
                      className="border-t bg-muted/20 px-4 py-3"
                    >
                      <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {offset + 1}–{Math.min(offset + limit, total)} de {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total || auditQuery.isFetching}
              onClick={() => setOffset((prev) => prev + limit)}
            >
              Próximo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
