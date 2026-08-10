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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEncounterList } from "@/lib/clinical-queries";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

/**
 * S23-ENC-01 — presets de data rápidos.
 * Evita o médico precisar abrir 2 date pickers para "casos de hoje".
 */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildDatePresets(): { label: string; from: string; to: string }[] {
  const today = todayISO();
  return [
    { label: "Hoje", from: today, to: today },
    { label: "7 dias", from: daysAgoISO(7), to: today },
    { label: "30 dias", from: daysAgoISO(30), to: today },
  ];
}

/**
 * UX — pills de filtro rápido acima da lista, no espírito do redesign
 * (Redesign.dc.html): um clique para os recortes mais comuns. "Meus" do
 * mockup fica de fora — GET /encounters já é escopado ao médico logado
 * (EncountersService.findByPhysician), então seria um filtro sem efeito.
 */
function buildQuickFilters(): { label: string; status: string; from: string; to: string }[] {
  const today = todayISO();
  return [
    { label: "Ativos", status: "in_review", from: "", to: "" },
    { label: "Hoje", status: "", from: today, to: today },
    { label: "Assinados", status: "finalized", from: "", to: "" },
  ];
}

export default function EncountersIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const status = searchParams.get("status") ?? "";
  const vertical = searchParams.get("vertical") ?? "";
  const search = searchParams.get("search") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  // S23-ENC-01 — estado local do input de busca para debounce.
  // Antes cada tecla gerava router.push (spam de API + poluição do histórico).
  // Agora o estado é local; o debounce (300ms) propaga para a URL.
  const [searchInput, setSearchInput] = useState(search);

  // Sincroniza input quando a URL muda externamente (ex: clearFilters).
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

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
      // S23-ENC-01 — router.replace em vez de push para não poluir histórico
      // (cada letra digitada não deve virar entrada de "voltar").
      router.replace(`/encounters?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // UX — variante de setParam que aplica várias chaves de uma vez a partir
  // do MESMO snapshot de searchParams (evita 2ª chamada pisar na 1ª, já que
  // ambas partiriam do mesmo `searchParams` da closure se fossem setParam
  // encadeado — ver pills de filtro rápido abaixo).
  const setParams = useCallback(
    (entries: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete("page");
      router.replace(`/encounters?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Debounce do input de busca: só atualiza a URL 300ms após o último digito.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      setParam("search", searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const clearFilters = useCallback(() => {
    router.replace("/encounters", { scroll: false });
  }, [router]);

  const hasActiveFilters = status || vertical || search || dateFrom || dateTo;
  const meta = encountersQuery.data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 0;

  const datePresets = useMemo(() => buildDatePresets(), []);
  const quickFilters = useMemo(() => buildQuickFilters(), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seus casos"
        description="Localize e filtre seus atendimentos para retomar o caso certo."
      >
        <Button asChild>
          <Link href="/encounters/new">
            <Plus className="size-4" />
            Novo Atendimento
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((qf) => {
          const active = status === qf.status && dateFrom === qf.from && dateTo === qf.to;
          return (
            <button
              key={qf.label}
              type="button"
              aria-pressed={active}
              onClick={() => setParams({ status: qf.status, dateFrom: qf.from, dateTo: qf.to })}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors",
                active
                  ? "bg-clinical-teal-tint font-semibold text-clinical-teal-deep"
                  : "border border-clinical-line bg-card text-muted-foreground hover:border-clinical-teal/40",
              )}
            >
              {qf.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {/*
          S22-A11Y-02 — filtros responsivos. Antes era `flex md:flex-row` com
          inputs de largura fixa que estouravam 320px. Agora coluna no mobile
          (cada filtro ocupa largura total) e row no desktop.
          Os <select>/<input type=date> nativos ganham w-full para touch-friendly.
          Labels associadas para acessibilidade (S22-A11Y-01) — nativos em mobile
          são mais acessíveis que shadcn Select para o teclado iOS.
        */}
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <label htmlFor="enc-search" className="sr-only">
              Buscar por referência do paciente
            </label>
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="enc-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por referência do paciente"
              className="pl-9"
              aria-label="Buscar por referência do paciente"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="space-y-1">
              <label htmlFor="enc-status" className="sr-only">
                Filtrar por status
              </label>
              <select
                id="enc-status"
                value={status}
                onChange={(event) => setParam("status", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="enc-vertical" className="sr-only">
                Filtrar por vertical
              </label>
              <select
                id="enc-vertical"
                value={vertical}
                onChange={(event) => setParam("vertical", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
              >
                {VERTICAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="enc-date-from" className="sr-only">
                Data inicial
              </label>
              <input
                id="enc-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setParam("dateFrom", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-36"
                placeholder="De"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="enc-date-to" className="sr-only">
                Data final
              </label>
              <input
                id="enc-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setParam("dateTo", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-36"
                placeholder="Até"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpar filtros">
                <X className="size-4" />
              </Button>
            )}
          </div>

          {/*
            S23-ENC-01 — presets de data rápidos. Botões "Hoje / 7 dias / 30 dias"
            aplicam intervalo de uma única vez em vez de abrir 2 date pickers.
            Raramente o médico quer um intervalo customizado — casos recentes
            é o caso de uso dominante.
          */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Intervalo:</span>
            {datePresets.map((preset) => {
              const active = dateFrom === preset.from && dateTo === preset.to;
              return (
                <Button
                  key={preset.label}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setParam("dateFrom", preset.from);
                    setParam("dateTo", preset.to);
                  }}
                  aria-pressed={active}
                >
                  {preset.label}
                </Button>
              );
            })}
            {(dateFrom || dateTo) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setParam("dateFrom", "");
                  setParam("dateTo", "");
                }}
              >
                Limpar intervalo
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

      {encountersQuery.isPending && (
        // S22-DS-01 — DataTable tem loading interno, mas como há lógica de
        // paginação/filtros em volta, mantemos um skeleton dedicado para
        // preservar o layout durante o fetch.
        <EncountersTableSkeleton />
      )}

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
          {/*
            S22-DS-01 — migrado para <DataTable> responsiva. Antes era uma
            <table> inline que quebrava no mobile (overflow horizontal em 320px).
            Agora vira cards empilhados em < 640px com colunas priorizadas
            (Paciente / Status / Atualizado; Vertical fica só no desktop).
          */}
          <DataTable
            ariaLabel="Lista de atendimentos"
            rows={encountersQuery.data?.data ?? []}
            getRowId={(e) => e.id}
            getRowHref={(e) => `/encounters/${e.id}`}
            emptyTitle={
              hasActiveFilters
                ? "Nenhum atendimento encontrado"
                : "Nenhum atendimento disponível"
            }
            emptyDescription={
              hasActiveFilters
                ? "Ajuste os filtros para localizar outro caso."
                : "Crie um novo atendimento para começar."
            }
            emptyActionLabel={hasActiveFilters ? undefined : "Novo Atendimento"}
            emptyActionHref={hasActiveFilters ? undefined : "/encounters/new"}
            columns={[
              {
                key: "patientRef",
                header: "Paciente",
                // RD-E7 — título é a queixa derivada da 1ª análise de IA
                // quando disponível; sem análise ainda, cai para patientRef
                // (mesma regra usada na fila do Plantão).
                cell: (e) =>
                  e.chiefComplaint ? (
                    <span className="flex flex-col">
                      <span className="font-medium">{e.chiefComplaint}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {e.patientRef}
                      </span>
                    </span>
                  ) : (
                    <span className="font-medium">{e.patientRef}</span>
                  ),
              },
              {
                key: "vertical",
                header: "Vertical",
                cell: (e) => (
                  <span className="text-muted-foreground">
                    {VERTICAL_LABELS[e.vertical] ?? e.vertical}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: "status",
                header: "Status",
                cell: (e) => (
                  <Badge
                    variant={STATUS_VARIANTS[e.status] ?? "outline"}
                    className="font-mono text-xs"
                  >
                    {STATUS_LABELS[e.status] ?? e.status}
                  </Badge>
                ),
              },
              {
                key: "updatedAt",
                header: "Atualizado",
                cell: (e) => (
                  <time
                    dateTime={e.updatedAt}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    {new Date(e.updatedAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                ),
              },
            ]}
          />

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
  // S22-DS-01 — DataTable tem loading skeleton próprio, mas mantemos este
  // skeleton para o caso de a query ainda não ter sido iniciada (first paint).
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
