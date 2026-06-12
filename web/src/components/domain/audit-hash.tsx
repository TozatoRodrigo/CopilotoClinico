"use client";

import Link from "next/link";
import { LinkSimple, Warning } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AuditHashProps {
  hash?: string | null;
  href?: string;
  status?: "ready" | "loading" | "error";
  className?: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

export function AuditHash({ hash, href, status = "ready", className }: AuditHashProps) {
  if (status === "loading") {
    return <Skeleton className={cn("h-6 w-32 rounded-md", className)} />;
  }

  if (status === "error" || !hash) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-clinical-line px-2 py-1 font-mono text-xs text-muted-foreground",
          className,
        )}
      >
        <Warning className="size-3.5" />
        Hash indisponível
      </span>
    );
  }

  const receipt = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-clinical-line bg-card px-2 py-1 font-mono text-xs text-foreground transition-colors",
        href && "hover:border-clinical-teal hover:text-clinical-teal",
        className,
      )}
    >
      <LinkSimple className="size-3.5 text-muted-foreground" />
      {truncateHash(hash)}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className="inline-flex">
            {receipt}
          </Link>
        ) : (
          <span tabIndex={0} className="inline-flex">
            {receipt}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <p className="font-mono">{hash}</p>
        {href && <p className="text-clinical-paper/70">Ver na trilha de auditoria</p>}
      </TooltipContent>
    </Tooltip>
  );
}
