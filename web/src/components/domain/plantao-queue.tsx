"use client";

import * as React from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import type { EncounterSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const VERTICAL_LABELS: Record<string, string> = {
  trauma: "Trauma",
  cardiac: "Cardíaco",
  pediatric: "Pediátrico",
  neuro: "Neuro",
  general: "Geral",
};

/**
 * PI-01 — janelas de reavaliação por gravidade. Origem: pedido literal do
 * Dr. Ripardo em reunião ("esse aqui eu tenho que avaliar rápido, esse
 * cara vai morrer mais rápido... o avião já tinha embicado" sobre
 * transição de cuidado mal feita).
 *
 * HIPÓTESE DE PRODUTO, NÃO RECOMENDAÇÃO CLÍNICA — estes minutos ainda não
 * têm assinatura do Dr. Gustavo/Dr. Ripardo. Validar antes do piloto.
 * Idealmente configurável por instituição; hoje é constante de código
 * porque não existe (ainda) um mecanismo de configuração por instituição
 * no produto — revisitar quando existir.
 */
const REASSESSMENT_WINDOW_MS: Record<"critical" | "high" | "moderate" | "none", number> = {
  critical: 15 * 60_000,
  high: 30 * 60_000,
  moderate: 60 * 60_000,
  none: 120 * 60_000,
};

/**
 * Este alerta NUNCA é triagem e não substitui julgamento clínico — a
 * ausência de alerta não significa "paciente bem". Ver copy no cabeçalho
 * da fila (needsReassessmentCount) e no próprio badge (aria-label).
 */
function needsReassessment(encounter: EncounterSummary): boolean {
  // Só faz sentido para casos ainda em curso — finalizado/cancelado não
  // precisa de reavaliação.
  if (encounter.status !== "draft" && encounter.status !== "in_review") return false;

  const referenceTime = encounter.lastInteractionAt ?? encounter.createdAt;
  const elapsedMs = Date.now() - new Date(referenceTime).getTime();
  const windowKey = encounter.highestRedFlagSeverity ?? "none";
  return elapsedMs >= REASSESSMENT_WINDOW_MS[windowKey];
}

function formatElapsed(updatedAt: string): { text: string; variant: "amber" | "ink" | "green" } {
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) return { text: "agora", variant: "ink" };
  if (minutes < 60) {
    return {
      text: `${minutes} min`,
      variant: minutes > 30 ? "amber" : "ink",
    };
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return { text: `${hours}h ${mins.toString().padStart(2, "0")}`, variant: "ink" };
  }
  const time = new Date(updatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { text: time, variant: "ink" };
}

function getElapsedLabel(status: string): string {
  switch (status) {
    case "in_review":
      return "em revisão";
    case "draft":
      return "rascunho";
    case "finalized":
      return "confirmado";
    default:
      return status;
  }
}

const STATUS_TAG: Record<string, { label: string; variant: "default" | "secondary" | "success" }> = {
  in_review: { label: "Em revisão", variant: "default" },
  draft: { label: "Sem análise", variant: "secondary" },
  finalized: { label: "Assinado", variant: "success" },
};

function CaseRow({ encounter }: { encounter: EncounterSummary }) {
  const elapsed = formatElapsed(encounter.updatedAt);
  const label = getElapsedLabel(encounter.status);
  const isReview = encounter.status === "in_review";
  const isDraft = encounter.status === "draft";
  const isFinalized = encounter.status === "finalized";
  const statusTag = STATUS_TAG[encounter.status];

  // PI-01 — codifica em forma (ícone + texto), não só cor, para não
  // depender de percepção de cor sob pressão de plantão. A tonalidade
  // (crítico vs. os demais) é reforço secundário, não o único sinal.
  const overdue = needsReassessment(encounter);
  const isCriticalOverdue = overdue && encounter.highestRedFlagSeverity === "critical";

  const elapsedColor =
    elapsed.variant === "amber"
      ? "text-clinical-amber"
      : isFinalized
        ? "text-clinical-green"
        : "text-foreground";

  const actionLabel = isReview ? "Retomar" : isDraft ? "Capturar" : "Ver";

  return (
    <Link
      href={`/encounters/${encounter.id}`}
      className={cn(
        "group grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-2 py-2.5 transition-colors duration-75 hover:bg-hover/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset md:grid-cols-[5.5rem_1fr_7rem_6rem_5.5rem] md:gap-4",
        isCriticalOverdue && "bg-tone-red-bg/70 hover:bg-tone-red-bg",
        overdue && !isCriticalOverdue && "bg-tone-orange-bg/70 hover:bg-tone-orange-bg",
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-[0.9375rem] font-semibold tabular-nums md:text-base", elapsedColor)}>
          {elapsed.text}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>

      <div className="min-w-0">
        {/* RD-E7 — título é a queixa (derivada da 1ª análise de IA) quando
            disponível; sem análise ainda, cai para patientRef, como hoje. */}
        <p className="truncate text-sm font-medium text-foreground md:text-[0.9375rem]">
          {/* S25-QC-01 — mesmo fallback defensivo de encounters/page.tsx. */}
          {encounter.chiefComplaint ?? encounter.patientRef ?? "Consulta rápida"}
        </p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* PI-01 — visível em qualquer largura de tela: é o sinal mais
              importante da linha, e o médico usa isto no celular. */}
          {overdue && (
            <span
              className={cn(
                "inline-flex h-5 items-center gap-1 rounded-[3px] px-1.5 text-xs font-medium",
                isCriticalOverdue
                  ? "bg-tone-red-tag text-tone-red-ink"
                  : "bg-tone-orange-tag text-tone-orange-ink",
              )}
              role="status"
              aria-label="Reavaliação recomendada — não substitui julgamento clínico"
            >
              <WarningCircle
                className={cn("size-3", isCriticalOverdue ? "text-tone-red" : "text-tone-orange")}
                weight="fill"
                aria-hidden="true"
              />
              Reavaliar
            </span>
          )}
          <span className="truncate text-[0.8125rem] text-muted-foreground">
            {encounter.chiefComplaint && (
              <span>{encounter.patientRef ?? "Consulta rápida"}</span>
            )}
            <span className="md:hidden">
              {encounter.chiefComplaint ? " · " : ""}
              {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
            </span>
          </span>
        </div>
      </div>

      <span className="hidden md:block">
        {statusTag && <Badge variant={statusTag.variant}>{statusTag.label}</Badge>}
      </span>

      <span className="hidden text-[0.8125rem] text-muted-foreground md:block">
        {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
      </span>

      <span
        className={cn(
          "inline-flex h-7 items-center justify-center justify-self-end rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors",
          isReview && "bg-primary text-primary-foreground group-hover:bg-[var(--brand-hover)]",
          isDraft && "border border-input bg-background text-foreground",
          !isReview && !isDraft && "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {actionLabel}
      </span>
    </Link>
  );
}

export interface PlantaoQueueProps {
  encounters: EncounterSummary[];
  loading?: boolean;
}

export function PlantaoQueue({ encounters, loading = false }: PlantaoQueueProps) {
  const sorted = React.useMemo(() => {
    const order = { in_review: 0, draft: 1, finalized: 2, cancelled: 3 };
    return [...encounters].sort((a, b) => {
      const so = order[a.status as keyof typeof order] ?? 9;
      const bo = order[b.status as keyof typeof order] ?? 9;
      if (so !== bo) return so - bo;
      // PI-01 — dentro do mesmo status, casos aguardando reavaliação sobem
      // ao topo: é exatamente o momento — "ambiente de caos, para pra
      // respirar" — em que o médico precisa saber quem olhar primeiro.
      const aOverdue = needsReassessment(a);
      const bOverdue = needsReassessment(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [encounters]);

  // PI-01 — contador no topo da fila inteira (não só os 5 exibidos aqui),
  // para o médico saber de cara se há algo pendente mesmo fora da vista.
  const reassessmentCount = React.useMemo(
    () => encounters.filter(needsReassessment).length,
    [encounters],
  );

  return (
    <section aria-labelledby="plantao-queue-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plantao-queue-title" className="text-lg font-semibold tracking-[-0.01em]">
          Fila do plantão
        </h2>
        {reassessmentCount > 0 && (
          <span className="inline-flex h-5 items-center gap-1 rounded-[3px] bg-tone-orange-tag px-1.5 text-xs font-medium text-tone-orange-ink">
            <WarningCircle className="size-3 text-tone-orange" weight="fill" aria-hidden="true" />
            {reassessmentCount} aguardando reavaliação
          </span>
        )}
        <span className="flex-1" />
        <Link
          href="/encounters"
          className="rounded-sm px-1.5 py-0.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          Ver todos os casos →
        </Link>
      </div>
      {reassessmentCount > 0 && (
        <p className="-mt-1 text-[0.8125rem] text-muted-foreground">
          Sugestão de prioridade por tempo e gravidade — não substitui julgamento clínico.
        </p>
      )}

      {loading ? (
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-3">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 border-y border-border py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum caso no plantão</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            Comece um novo caso para ver a fila aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {sorted.slice(0, 5).map((enc) => (
            <CaseRow key={enc.id} encounter={enc} />
          ))}
        </div>
      )}
    </section>
  );
}
