"use client";

import * as React from "react";
import Link from "next/link";
import type { EncounterSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERTICAL_LABELS: Record<string, string> = {
  trauma: "Trauma",
  cardiac: "Cardíaco",
  pediatric: "Pediátrico",
  neuro: "Neuro",
  general: "Geral",
};

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
      className="grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-[14px] border border-[var(--line)] bg-card p-4 shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--teal)]/30 md:grid-cols-[100px_1.5fr_auto_1fr_140px_90px] md:gap-4"
    >
      <div className="min-w-0">
        <p className={cn("font-mono text-base font-semibold md:text-xl", elapsedColor)}>
          {elapsed.text}
        </p>
        <p className="text-[0.65rem] text-[var(--ink-soft)] md:text-[0.7rem]">{label}</p>
      </div>

      <div className="min-w-0">
        <p className="truncate font-mono text-[0.85rem] font-semibold md:text-[0.9rem]">
          {encounter.patientRef}
        </p>
        <p className="truncate text-[0.75rem] text-[var(--ink-soft)] md:text-[0.8rem]">
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
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [encounters]);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-[-0.01em]">Fila do plantão</h2>
        <Link
          href="/encounters"
          className="text-[0.8rem] font-medium text-[var(--teal)] hover:text-[var(--teal-deep)]"
        >
          Ver todos os casos →
        </Link>
      </div>

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
