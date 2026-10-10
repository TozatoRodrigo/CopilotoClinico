"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, LinkSimple, Warning } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AuditHashProps {
  hash?: string | null;
  href?: string;
  status?: "ready" | "loading" | "error";
  /** Mostra o botão de copiar o hash completo (padrão: true). */
  copyable?: boolean;
  className?: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

/**
 * Hash da trilha de auditoria no estilo "código inline" do Notion: fundo
 * cinza, mono, truncado no meio (8…4) com o valor completo no tooltip e um
 * botão de copiar. Com `href`, o hash vira link para a trilha.
 */
export function AuditHash({
  hash,
  href,
  status = "ready",
  copyable = true,
  className,
}: AuditHashProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (status === "loading") {
    return <Skeleton className={cn("h-6 w-32", className)} />;
  }

  if (status === "error" || !hash) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <Warning className="size-3.5" aria-hidden="true" />
        Hash indisponível
      </span>
    );
  }

  const value = hash;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard indisponível (contexto inseguro/permissão negada) — o
      // tooltip continua mostrando o hash completo para cópia manual.
    }
  }

  const label = (
    <>
      <LinkSimple className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{truncateHash(value)}</span>
    </>
  );

  return (
    <span
      data-slot="audit-hash"
      className={cn(
        "group/hash inline-flex h-6 max-w-full items-center rounded-sm bg-tone-gray-bg font-mono text-xs text-foreground",
        !copyable && "pr-1.5",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <Link
              href={href}
              className="inline-flex h-full min-w-0 items-center gap-1 rounded-sm pl-1.5 pr-1 underline-offset-2 outline-none hover:text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {label}
            </Link>
          ) : (
            <span
              tabIndex={0}
              className="inline-flex h-full min-w-0 items-center gap-1 rounded-sm pl-1.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {label}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent className="flex-col items-start gap-0.5">
          <p className="font-mono break-all">{value}</p>
          {href && <p className="font-sans opacity-70">Ver na trilha de auditoria</p>}
        </TooltipContent>
      </Tooltip>
      {copyable && (
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? "Hash copiado" : "Copiar hash"}
          title={copied ? "Copiado" : "Copiar hash completo"}
          // Como o "copiar" dos blocos de código do Notion: aparece no hover
          // (em telas com mouse) ou no foco; no toque fica sempre visível,
          // com alvo de 40px sem inflar o chip visualmente.
          className={cn(
            "relative flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[color,background-color,opacity] duration-100 outline-none after:absolute after:-inset-2 hover:bg-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 sm:after:hidden",
            !copied &&
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/hash:opacity-100 [@media(hover:hover)]:group-hover/hash:opacity-100",
          )}
        >
          {copied ? (
            <Check className="size-3.5 text-tone-green" weight="bold" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Hash copiado" : ""}
      </span>
    </span>
  );
}
