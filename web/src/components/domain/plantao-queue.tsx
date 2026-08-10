"use client";

import * as React from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import type { EncounterSummary } from "@/lib/types";
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

function CaseRow({ encounter }: { encounter: EncounterSummary }) {
  const elapsed = formatElapsed(encounter.updatedAt);
  const label = getElapsedLabel(encounter.status);
  const isReview = encounter.status === "in_review";
  const isDraft = encounter.status === "draft";
  const isFinalized = encounter.status === "finalized";

  // PI-01 — codifica em forma (ícone + texto), não só cor, para não
  // depender de percepção de cor sob pressão de plantão. A tonalidade
  // (crítico vs. os demais) é reforço secundário, não o único sinal.
  const overdue = needsReassessment(encounter);
  const isCriticalOverdue = overdue && encounter.highestRedFlagSeverity === "critical";

  const elapsedColor =
    elapsed.variant === "amber"
      ? "text-[var(--amber)]"
      : isFinalized
        ? "text-[var(--green)]"
        : "text-[var(--ink)]";

  const steps = [isDraft || isReview || isFinalized, isReview || isFinalized, isFinalized];
  const stepLabels = isDraft
    ? "capturar caso"
    : isReview
      ? "análise feita"
      : isFinalized
        ? "completo"
        : "";

  let actionLabel = "Ver";
  let actionClass = "text-[var(--ink-soft)]";
  if (isReview) {
    actionLabel = "Retomar";
    actionClass =
      "bg-[var(--teal)] text-white";
  } else if (isDraft) {
    actionLabel = "Capturar";
    actionClass =
      "border border-[var(--line)] bg-card text-[var(--ink)]";
  } else if (isFinalized) {
    actionLabel = "Ver";
    actionClass = "text-[var(--ink-soft)]";
  }

  return (
    <Link
      href={`/encounters/${encounter.id}`}
      className={cn(
        "grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-[14px] border bg-card p-4 shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--teal)]/30 md:grid-cols-[100px_1.5fr_auto_1fr_140px_90px] md:gap-4",
        isCriticalOverdue
          ? "border-[var(--error)]/50 bg-[var(--error-bg)]"
          : overdue
            ? "border-[var(--amber)]/50 bg-[var(--amber-bg)]"
            : "border-[var(--line)]",
      )}
    >
      <div className="min-w-0">
        <p className={cn("font-mono text-base font-semibold md:text-xl", elapsedColor)}>
          {elapsed.text}
        </p>
        <p className="text-[0.65rem] text-[var(--ink-soft)] md:text-[0.7rem]">{label}</p>
        {/* PI-01 — visível em qualquer largura de tela (não escondida em
            mobile como os badges de status abaixo): é o sinal mais
            importante da linha, e o médico usa isto no celular. */}
        {overdue && (
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
              isCriticalOverdue
                ? "bg-[var(--error)] text-white"
                : "bg-[var(--amber)] text-[var(--amber-foreground)]",
            )}
            role="status"
            aria-label="Reavaliação recomendada — não substitui julgamento clínico"
          >
            <WarningCircle className="size-3" weight="fill" aria-hidden="true" />
            Reavaliar
          </span>
        )}
      </div>

      <div className="min-w-0">
        {/* RD-E7 — título é a queixa (derivada da 1ª análise de IA) quando
            disponível; sem análise ainda, cai para patientRef, como hoje. */}
        <p
          className={cn(
            "truncate text-[0.85rem] font-semibold md:text-[0.9rem]",
            !encounter.chiefComplaint && "font-mono",
          )}
        >
          {encounter.chiefComplaint ?? encounter.patientRef}
        </p>
        <p className="truncate text-[0.75rem] text-[var(--ink-soft)] md:text-[0.8rem]">
          {encounter.chiefComplaint && (
            <span className="font-mono">{encounter.patientRef} · </span>
          )}
          {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
        </p>
      </div>

      {isReview && (
        <span className="hidden items-center gap-1 rounded-full bg-[var(--teal-tint)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--teal-deep)] md:inline-flex">
          em revisão
        </span>
      )}
      {isDraft && (
        <span className="hidden rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--ink-soft)] md:inline-flex">
          sem análise
        </span>
      )}
      {isFinalized && (
        <span className="hidden items-center gap-1 rounded-full border border-[var(--green)]/30 bg-[var(--green-bg)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--green-foreground)] md:inline-flex">
          assinado
        </span>
      )}

      <span className="hidden text-[0.75rem] text-[var(--ink-soft)] md:block">
        {VERTICAL_LABELS[encounter.vertical] ?? encounter.vertical}
      </span>

      <div className="hidden items-center gap-1.5 md:flex">
        {steps.map((done, i) => (
          <span
            key={i}
            className="h-[5px] w-[22px] rounded-[3px]"
            style={{ background: done ? "var(--teal)" : isFinalized ? "var(--green)" : "var(--line)" }}
          />
        ))}
        <span className="ml-1 text-[0.65rem] text-[var(--ink-soft)]">{stepLabels}</span>
      </div>

      <span
        className={cn(
          "flex h-[34px] items-center justify-center rounded-[10px] px-3 text-[0.8rem] font-semibold md:h-[38px]",
          actionClass,
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
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold tracking-[-0.01em]">Fila do plantão</h2>
          {reassessmentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--amber)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--amber-foreground)]">
              <WarningCircle className="size-3" weight="fill" aria-hidden="true" />
              {reassessmentCount} aguardando reavaliação
            </span>
          )}
        </div>
        <Link
          href="/encounters"
          className="text-[0.8rem] font-medium text-[var(--teal)] hover:text-[var(--teal-deep)]"
        >
          Ver todos os casos →
        </Link>
      </div>
      {reassessmentCount > 0 && (
        <p className="-mt-1.5 text-[0.7rem] text-[var(--ink-soft)]">
          Sugestão de prioridade por tempo e gravidade — não substitui julgamento clínico.
        </p>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-[14px] border border-[var(--line)] bg-card md:h-[72px]"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--line)] py-12 text-center">
          <p className="text-sm font-medium text-[var(--ink)]">Nenhum caso no plantão</p>
          <p className="text-xs text-[var(--ink-soft)]">
            Comece um novo caso para ver a fila aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.slice(0, 5).map((enc) => (
            <CaseRow key={enc.id} encounter={enc} />
          ))}
        </div>
      )}
    </div>
  );
}
