"use client";

import { CircleNotch, SealCheck, Warning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ConfirmedSealProps {
  status?: "confirmed" | "pending" | "error";
  confirmedAt?: string;
  physicianName?: string;
  crm?: string;
  hash?: string;
  className?: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ConfirmedSeal({
  status = "confirmed",
  confirmedAt,
  physicianName,
  crm,
  hash,
  className,
}: ConfirmedSealProps) {
  if (status === "pending") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-clinical-line bg-card px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        <CircleNotch className="size-4 animate-spin" />
        <span>Assinando conduta…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive",
          className,
        )}
      >
        <Warning className="size-4" />
        <span>Não foi possível assinar a conduta. Tente novamente.</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-clinical-green/30 bg-clinical-green-bg px-4 py-3",
        className,
      )}
    >
      <SealCheck className="size-6 shrink-0 text-clinical-green" weight="fill" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-clinical-green-foreground">Conduta confirmada e assinada</p>
        <p className="text-sm text-clinical-green-foreground/80">
          {confirmedAt && formatDateTime(confirmedAt)}
          {physicianName && ` · ${physicianName}`}
          {crm && ` · ${crm}`}
        </p>
        {hash && (
          <p className="font-mono text-xs text-clinical-green-foreground/70">{truncateHash(hash)}</p>
        )}
      </div>
    </div>
  );
}
