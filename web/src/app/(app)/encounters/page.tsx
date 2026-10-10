"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  ClipboardText,
  MagnifyingGlass,
  Plus,
  Tag,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEncounterList } from "@/lib/clinical-queries";
import type { EncounterSummary } from "@/lib/types";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  encounterTitle,
  formatDateTime,
  formatRelative,
  formatShortDateTime,
  getVerticalMeta,
  VERTICAL_OPTIONS,
} from "./_components/encounter-meta";
import { SeverityTag, StatusTag, VerticalTag } from "./_components/encounter-tags";
import { FilterPill } from "./_components/filter-pill";
import { EncountersTableSkeleton } from "./_components/skeletons";

/**
 * Views de status da database (abas sublinhadas do Notion). Substituem o
 * <select> de status e as antigas pills "Ativos"/"Assinados". Não existe view
 * "Meus": GET /encounters já é escopado ao médico logado
 * (EncountersService.findByPhysician), então seria um filtro sem efeito.
 */
const STATUS_VIEWS = [
  { value: "all", label: "Todos" },
  { value: "in_review", label: "Em revisão" },
  { value: "draft", label: "Rascunhos" },
  { value: "finalized", label: "Assinados" },
  { value: "cancelled", label: "Cancelados" },
] as const;

const VERTICAL_FILTER_OPTIONS = [
  { value: "", label: "Todas as verticais" },
  ...VERTICAL_OPTIONS,
] as const;

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

type DatePresetKey = "today" | "7d" | "30d";

function buildDatePresets(): { key: DatePresetKey; label: string; from: string; to: string }[] {
  const today = todayISO();
  return [
    { key: "today", label: "Hoje", from: today, to: today },
    { key: "7d", label: "Últimos 7 dias", from: daysAgoISO(7), to: today },
    { key: "30d", label: "Últimos 30 dias", from: daysAgoISO(30), to: today },
  ];
}

/** "2026-10-08" → "08/10" (rótulo curto do intervalo personalizado). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return month && day ? `${day}/${month}` : iso;
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
  // "Personalizado…" escolhido no filtro de período, antes de haver datas.
  const [customRangeOpen, setCustomRangeOpen] = useState(false);

  // Sincroniza input quando a URL muda externamente (ex: clearFilters).
  // Ajuste durante o render (padrão do React) em vez de setState num effect.
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchInput(search);
  }

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
  // encadeado — ex.: dateFrom + dateTo de um preset de período).
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
    setCustomRangeOpen(false);
    router.replace("/encounters", { scroll: false });
  }, [router]);

  const hasActiveFilters = Boolean(status || vertical || search || dateFrom || dateTo);
  const meta = encountersQuery.data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 0;

  const datePresets = useMemo(() => buildDatePresets(), []);
  const activePreset = datePresets.find((p) => p.from === dateFrom && p.to === dateTo);
  const hasDateRange = Boolean(dateFrom || dateTo);
  // "Personalizado…" tem prioridade: mesmo partindo de um preset, o médico
  // vê os dois campos de data para ajustar o intervalo.
  const periodValue = customRangeOpen
    ? "custom"
    : activePreset
      ? activePreset.key
      : hasDateRange
        ? "custom"
        : "";
  const periodLabel =
    periodValue === "custom"
      ? hasDateRange
        ? `${dateFrom ? shortDate(dateFrom) : "…"} – ${dateTo ? shortDate(dateTo) : "…"}`
        : "Personalizado"
      : activePreset?.label;

  function handlePeriodChange(value: string) {
    if (value === "custom") {
      setCustomRangeOpen(true);
      return;
    }
    setCustomRangeOpen(false);
    const preset = datePresets.find((p) => p.key === value);
    setParams({ dateFrom: preset?.from ?? "", dateTo: preset?.to ?? "" });
  }

  const currentView = status || "all";
  const rows = encountersQuery.data?.data ?? [];

  return (
    <Page width="wide">
      <PageHeader
        icon={ClipboardText}
        title="Casos"
        description="Todos os seus atendimentos, do rascunho ao documento assinado."
      />

      <Tabs
        value={currentView}
        onValueChange={(value) => setParam("status", value === "all" ? "" : value)}
        activationMode="manual"
        className="gap-3"
      >
        {/* Barra de view: abas de status à esquerda; busca + "Novo" à direita. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-b sm:border-border">
          <TabsList aria-label="Filtrar por status" className="max-sm:w-full sm:border-b-0">
            {STATUS_VIEWS.map((view) => (
              <TabsTrigger key={view.value} value={view.value}>
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-2 sm:py-1">
            <div className="relative flex-1 sm:w-60 sm:flex-none">
              <label htmlFor="enc-search" className="sr-only">
                Buscar por referência do paciente
              </label>
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="enc-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar paciente"
                className="h-7 pl-8 text-[0.8125rem] max-sm:h-10 md:text-[0.8125rem]"
                aria-label="Buscar por referência do paciente"
              />
            </div>
            <Button asChild size="sm" className="max-sm:h-10">
              <Link href="/encounters/new" aria-label="Novo caso">
                <Plus weight="bold" aria-hidden="true" />
                Novo
              </Link>
            </Button>
          </div>
        </div>

        {/*
          S22-A11Y-02 — filtros responsivos: pílulas que quebram linha no
          mobile, cada uma um <select> nativo com <label> associado (ver
          FilterPill). S23-ENC-01 — presets de período ("Hoje / 7 dias /
          30 dias") aplicam o intervalo de uma vez; "Personalizado…" abre os
          dois campos de data só quando o médico realmente precisa.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill
            id="enc-vertical"
            label="Vertical"
            srLabel="Filtrar por vertical"
            icon={Tag}
            value={vertical}
            options={VERTICAL_FILTER_OPTIONS}
            onChange={(value) => setParam("vertical", value)}
          />
          <FilterPill
            id="enc-period"
            label="Período"
            srLabel="Filtrar por período"
            icon={CalendarBlank}
            value={periodValue}
            valueLabel={periodLabel}
            active={hasDateRange}
            options={[
              { value: "", label: "Qualquer data" },
              ...datePresets.map((p) => ({ value: p.key, label: p.label })),
              { value: "custom", label: "Personalizado…" },
            ]}
            onChange={handlePeriodChange}
          />

          {periodValue === "custom" && (
            <div className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
              <label htmlFor="enc-date-from" className="sr-only">
                Data inicial
              </label>
              <Input
                id="enc-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setParam("dateFrom", event.target.value)}
                className="h-7 w-[8.75rem] text-[0.8125rem] max-sm:h-10 md:text-[0.8125rem]"
              />
              <span aria-hidden="true">até</span>
              <label htmlFor="enc-date-to" className="sr-only">
                Data final
              </label>
              <Input
                id="enc-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setParam("dateTo", event.target.value)}
                className="h-7 w-[8.75rem] text-[0.8125rem] max-sm:h-10 md:text-[0.8125rem]"
              />
            </div>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground max-sm:h-10"
            >
              <X aria-hidden="true" />
              Limpar filtros
            </Button>
          )}

          {meta && (
            <p
              className="ml-auto text-[0.8125rem] text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {meta.total} caso{meta.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <TabsContent value={currentView} className="flex flex-col gap-2">
          {encountersQuery.isPending && (
            // S22-DS-01 — DataTable tem loading interno, mas como há lógica de
            // paginação/filtros em volta, mantemos um skeleton dedicado no
            // formato da database para preservar o layout durante o fetch.
            <EncountersTableSkeleton />
          )}

          {encountersQuery.error && (
            <Alert variant="destructive">
              <WarningCircle weight="fill" aria-hidden="true" />
              <AlertTitle>Não foi possível carregar os casos</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
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
                S22-DS-01 — <DataTable> responsiva: database do Notion no
                desktop (≥ 640px) e lista com divisórias no mobile, onde uma
                coluna-resumo junta título, status e metadados.
              */}
              <DataTable
                ariaLabel="Lista de atendimentos"
                rows={rows}
                getRowId={(e) => e.id}
                getRowHref={(e) => `/encounters/${e.id}`}
                columns={COLUMNS}
                className={cn(
                  // @container: as colunas aparecem conforme a largura REAL
                  // da página (sidebar aberta ou recolhida), não a da janela.
                  "@container transition-opacity duration-150",
                  encountersQuery.isPlaceholderData && "opacity-60",
                )}
                emptyState={
                  hasActiveFilters ? (
                    <EmptyState
                      icon={<MagnifyingGlass />}
                      title="Nenhum caso encontrado"
                      description="Ajuste os filtros ou a busca para localizar outro caso."
                      actionLabel="Limpar filtros"
                      onAction={clearFilters}
                      className="border-y border-border"
                    />
                  ) : (
                    <EmptyState
                      icon={<ClipboardText />}
                      title="Nenhum caso ainda"
                      description="Crie um novo caso para começar — ele aparece aqui e no Plantão."
                      actionLabel="Novo caso"
                      actionHref="/encounters/new"
                      className="border-y border-border"
                    />
                  )
                }
              />

              {totalPages > 1 && (
                <nav
                  aria-label="Paginação"
                  className="flex items-center justify-between gap-3 px-1 text-[0.8125rem] text-muted-foreground"
                >
                  <p className="tabular-nums">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setParam("page", String(page - 1))}
                      className="max-sm:h-10"
                    >
                      <ArrowLeft aria-hidden="true" />
                      Anterior
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setParam("page", String(page + 1))}
                      className="max-sm:h-10"
                    >
                      Próxima
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </nav>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function CaseTitle({
  encounter,
  className,
}: {
  encounter: EncounterSummary;
  className?: string;
}) {
  const Icon = getVerticalMeta(encounter.vertical).icon;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        title={encounterTitle(encounter)}
        className={cn(
          "truncate font-medium",
          encounter.status === "cancelled" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {/* RD-E7 — título é a queixa derivada da 1ª análise de IA quando
            disponível; sem análise ainda, cai para patientRef (mesma regra do
            Plantão). S25-QC-01 — GET /encounters já exclui consultas rápidas
            por padrão (patientRef null); "Consulta rápida" é só defensivo. */}
        {encounterTitle(encounter)}
      </span>
    </span>
  );
}

function UpdatedAt({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className="text-muted-foreground tabular-nums">
      {formatRelative(iso)}
    </time>
  );
}

const COLUMNS: DataTableColumn<EncounterSummary>[] = [
  // Mobile: uma linha-resumo por caso, como a lista do app do Notion.
  {
    key: "summary",
    header: "Caso",
    hideOnDesktop: true,
    cardLabel: null,
    cell: (e) => (
      <span className="flex flex-col gap-1.5 text-left">
        <span className="flex items-start justify-between gap-3">
          <CaseTitle encounter={e} />
          <StatusTag status={e.status} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
          <span>
            {e.chiefComplaint && <>{e.patientRef ?? "Consulta rápida"} · </>}
            <UpdatedAt iso={e.updatedAt} />
          </span>
          <VerticalTag vertical={e.vertical} />
          {e.highestRedFlagSeverity && <SeverityTag severity={e.highestRedFlagSeverity} />}
        </span>
      </span>
    ),
  },
  {
    key: "title",
    header: "Caso",
    hideOnMobile: true,
    className: "min-w-[12rem]",
    cell: (e) => (
      <CaseTitle
        encounter={e}
        className="max-w-[12rem] @2xl:max-w-[14rem] @4xl:max-w-[18rem] @min-[60rem]:max-w-[22rem] @6xl:max-w-[26rem]"
      />
    ),
  },
  {
    key: "patientRef",
    header: "Paciente",
    hideOnMobile: true,
    className: "hidden whitespace-nowrap @4xl:table-cell",
    cell: (e) =>
      e.patientRef ? (
        <span className="text-foreground">{e.patientRef}</span>
      ) : (
        <span className="text-muted-foreground">Não identificado</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    hideOnMobile: true,
    className: "w-px whitespace-nowrap",
    cell: (e) => <StatusTag status={e.status} />,
  },
  {
    key: "vertical",
    header: "Vertical",
    hideOnMobile: true,
    className: "hidden w-px whitespace-nowrap @2xl:table-cell",
    cell: (e) => <VerticalTag vertical={e.vertical} />,
  },
  {
    key: "severity",
    header: "Gravidade",
    hideOnMobile: true,
    className: "w-px whitespace-nowrap",
    cell: (e) =>
      e.highestRedFlagSeverity ? (
        <SeverityTag severity={e.highestRedFlagSeverity} />
      ) : (
        <>
          <span className="text-fg-tertiary" aria-hidden="true">
            —
          </span>
          <span className="sr-only">Sem red flags</span>
        </>
      ),
  },
  {
    key: "updatedAt",
    header: "Atualizado",
    hideOnMobile: true,
    className: "w-px whitespace-nowrap",
    cell: (e) => <UpdatedAt iso={e.updatedAt} />,
  },
  {
    key: "createdAt",
    header: "Criado",
    hideOnMobile: true,
    className: "hidden w-px whitespace-nowrap @6xl:table-cell",
    cell: (e) => (
      <time
        dateTime={e.createdAt}
        title={formatDateTime(e.createdAt)}
        className="text-muted-foreground tabular-nums"
      >
        {formatShortDateTime(e.createdAt)}
      </time>
    ),
  },
];
