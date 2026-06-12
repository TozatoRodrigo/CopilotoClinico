"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
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

interface AuditFilters {
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

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
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [filters, setFilters] = useState<AuditFilters>({
    entity: "",
    entityId: "",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(filters);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const params: Record<string, string> = {
          limit: String(limit),
          offset: String(offset),
        };
        if (appliedFilters.entity && appliedFilters.entity !== "_all")
          params.entity = appliedFilters.entity;
        if (appliedFilters.entityId)
          params.entityId = appliedFilters.entityId;
        if (appliedFilters.from) params.from = appliedFilters.from;
        if (appliedFilters.to) params.to = appliedFilters.to;

        const result = await apiClient.get<
          { data: AuditEntry[]; total: number } | AuditEntry[]
        >("/audit", params);

        if (Array.isArray(result)) {
          setEntries(result);
          setTotal(result.length);
        } else {
          setEntries(result.data);
          setTotal(result.total);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar auditoria.",
        );
      } finally {
        setLoading(false);
      }
    }
    void fetchData();
  }, [appliedFilters, offset]);

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
          <AlertDescription>{error}</AlertDescription>
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
          <div className="rounded-lg border">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-2 text-sm font-medium">
              <span>Data/Hora</span>
              <span>Ação</span>
              <span>Entidade</span>
              <span>ID</span>
              <span>IP</span>
            </div>
            {entries.map((entry) => (
              <div key={entry.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="grid w-full grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm text-left hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === entry.id ? null : entry.id,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId((prev) =>
                        prev === entry.id ? null : entry.id,
                      );
                    }
                  }}
                >
                  <span>{formatDate(entry.createdAt)}</span>
                  <span className="font-medium">{actionLabel(entry.action)}</span>
                  <span>{entry.entity}</span>
                  <span className="truncate" onClick={(e) => e.stopPropagation()}>
                    <AuditHash
                      hash={entry.entityId}
                      href={entry.entity === "Encounter" ? `/encounters/${entry.entityId}/result` : undefined}
                    />
                  </span>
                  <span className="font-mono text-xs">{entry.ip ?? "—"}</span>
                </div>
                {expandedId === entry.id && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
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
              disabled={offset + limit >= total}
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
