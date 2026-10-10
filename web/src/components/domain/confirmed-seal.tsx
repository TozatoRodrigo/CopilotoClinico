"use client";

import type { ReactNode } from "react";
import { CircleNotch, SealCheck, Warning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";

interface ConfirmedSealProps {
  status?: "confirmed" | "pending" | "error";
  confirmedAt?: string;
  physicianName?: string;
  crm?: string;
  hash?: string;
  /** Ação alinhada à direita (ex.: "Baixar PDF"). */
  action?: ReactNode;
  className?: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Selo de conduta confirmada e assinada — callout verde do Notion (verde =
 * conduta confirmada/assinada, semântica fixa em docs/design-system.md).
 * Estados `pending` (cinza, assinando) e `error` (vermelho, anunciado).
 */
export function ConfirmedSeal({
  status = "confirmed",
  confirmedAt,
  physicianName,
  crm,
  hash,
  action,
  className,
}: ConfirmedSealProps) {
  if (status === "pending") {
    return (
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-md bg-tone-gray-bg px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        <CircleNotch className="size-[18px] shrink-0 animate-spin" aria-hidden="true" />
        <span>{messages.seal.signing}</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-3 rounded-md bg-tone-red-bg px-4 py-3 text-sm text-tone-red-ink",
          className,
        )}
      >
        <Warning className="size-[18px] shrink-0 text-tone-red" weight="fill" aria-hidden="true" />
        <span>{messages.seal.error}</span>
      </div>
    );
  }

  const details = [confirmedAt ? formatDateTime(confirmedAt) : null, physicianName, crm].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <div
      data-slot="confirmed-seal"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-tone-green-bg px-4 py-3 text-tone-green-ink",
        className,
      )}
    >
      <SealCheck className="size-6 shrink-0 text-tone-green" weight="fill" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold">{messages.seal.confirmed}</p>
        {details.length > 0 && (
          <p className="text-[0.8125rem] tabular-nums opacity-90">{details.join(" · ")}</p>
        )}
        {hash && <p className="font-mono text-xs opacity-80">{truncateHash(hash)}</p>}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
