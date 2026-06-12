"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Funnel,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useCallback, useMemo } from "react";
import { useEncounterList } from "@/lib/clinical-queries";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "in_review", label: "Em revisão" },
  { value: "finalized", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

const VERTICAL_OPTIONS = [
  { value: "", label: "Todas as verticais" },
  { value: "trauma", label: "Trauma" },
  { value: "cardiac", label: "Cardíaco" },
  { value: "pediatric", label: "Pediátrico" },
  { value: "neuro", label: "Neuro" },
  { value: "general", label: "Geral" },
] as const;

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

const VERTICAL_LABELS: Record<string, string> = {
  trauma: "Trauma",
  cardiac: "Cardíaco",
  pediatric: "Pediátrico",
  neuro: "Neuro",
  general: "Geral",
};

const PAGE_SIZE = 20;

export default function EncountersIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const status = searchParams.get("status") ?? "";
  const vertical = searchParams.get("vertical") ?? "";
  const search = searchParams.get("search") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const filters = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(status && { status }),
      ...(vertical && { vertical }),
      ...(search && { search }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    }),
    [page, status, vertical, search, dateFrom, dateTo],
  );

  const encountersQuery = useEncounterList(filters);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (key !== "page") next.delete("page");
      router.push(`/encounters?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push("/encounters", { scroll: false });
  }, [router]);

  const hasActiveFilters = status || vertical || search || dateFrom || dateTo;
  const meta = encountersQuery.data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atendimentos"
        description="Localize e filtre seus atendimentos para retomar o caso certo."
      >
        <Button asChild>
          <Link href="/encounters/new">
            <Plus className="size-4" />
            Novo Atendimento
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setParam("search", event.target.value)}
              placeholder="Buscar por referência do paciente"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(event) => setParam("status", event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={vertical}
              onChange={(event) => setParam("vertical", event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {VERTICAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setParam("dateFrom", event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="De"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setParam("dateTo", event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Até"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpar filtros">
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <Funnel className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {meta?.total ?? "—"} resultado{(meta?.total ?? 0) !== 1 ? "s" : ""}
            </span>
            {status && (
              <Badge variant="secondary" className="text-xs">
                {STATUS_LABELS[status] ?? status}
              </Badge>
            )}
            {vertical && (
              <Badge variant="secondary" className="text-xs">
                {VERTICAL_LABELS[vertical] ?? vertical}
              </Badge>
            )}
            {search && (
              <Badge variant="secondary" className="text-xs">
                &ldquo;{search}&rdquo;
              </Badge>
            )}
            {(dateFrom || dateTo) && (
              <Badge variant="secondary" className="text-xs">
                {dateFrom || "…"} — {dateTo || "…"}
              </Badge>
            )}
          </div>
        )}
      </div>

      {encountersQuery.isPending && <EncountersTableSkeleton />}

      {encountersQuery.error && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar atendimentos</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{encountersQuery.error.message}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void encountersQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!encountersQuery.isPending && !encountersQuery.error && (
        <>
          {encountersQuery.data?.data.length === 0 ? (
            <EmptyState
              title={
                hasActiveFilters
                  ? "Nenhum atendimento encontrado"
                  : "Nenhum atendimento disponível"
              }
              description={
                hasActiveFilters
                  ? "Ajuste os filtros para localizar outro caso."
                  : "Crie um novo atendimento para começar."
              }
              actionLabel={hasActiveFilters ? undefined : "Novo Atendimento"}
              actionHref={hasActiveFilters ? undefined : "/encounters/new"}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Vertical</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {encountersQuery.data?.data.map((encounter) => (
                    <tr
                      key={encounter.id}
                      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                      onClick={() => router.push(`/encounters/${encounter.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/encounters/${encounter.id}`);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Ver atendimento ${encounter.patientRef}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{encounter.patientRef}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">
                          {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_VARIANTS[encounter.status] ?? "outline"}
                          className="font-mono text-xs"
                        >
                          {STATUS_LABELS[encounter.status] ?? encounter.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <time
                          dateTime={encounter.updatedAt}
                          className="font-mono text-xs text-muted-foreground"
                        >
                          {new Date(encounter.updatedAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages} · {meta?.total} atendimento
                {(meta?.total ?? 0) !== 1 ? "s" : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setParam("page", String(page - 1))}
                >
                  <ArrowLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setParam("page", String(page + 1))}
                >
                  Próxima
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EncountersTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Paciente</th>
            <th className="px-4 py-3">Vertical</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, index) => (
            <tr key={index} className="border-b last:border-0">
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-28" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
