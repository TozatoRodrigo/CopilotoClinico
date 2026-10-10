"use client";

import type { ElementType } from "react";
import { FileText, Question, SealCheck, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type DecisionThreadNodeState = "analysis" | "question" | "conduct" | "document";

export interface DecisionThreadItem {
  id: string;
  state: DecisionThreadNodeState;
  title: string;
  description?: string;
  timestamp?: string;
  current?: boolean;
  /** Ícone Phosphor que substitui o ícone padrão do estado (ex.: criação do caso). */
  icon?: ElementType;
}

/**
 * Cor = significado clínico fixo (docs/design-system.md): azul = IA,
 * laranja = pergunta que muda a conduta, verde = conduta confirmada,
 * cinza = documento/metadado. O ícone repete o estado — nunca só cor.
 */
const NODE: Record<DecisionThreadNodeState, { icon: ElementType; ring: string; ink: string }> = {
  analysis: { icon: Sparkle, ring: "bg-tone-blue-bg", ink: "text-tone-blue" },
  question: { icon: Question, ring: "bg-tone-orange-bg", ink: "text-tone-orange" },
  conduct: { icon: SealCheck, ring: "bg-tone-green-bg", ink: "text-tone-green" },
  document: { icon: FileText, ring: "bg-tone-gray-bg", ink: "text-muted-foreground" },
};

interface DecisionThreadProps {
  items: DecisionThreadItem[];
  mode?: "active" | "history";
  loading?: boolean;
  className?: string;
}

/**
 * Linha do tempo de decisão do caso, como blocos do Notion: ícone do estado
 * num círculo de cor de bloco, trilho fino de 1px ligando as etapas, título e
 * horário. Em `active` a etapa atual ganha destaque e as descrições aparecem;
 * em `history` fica compacta (só título e horário).
 */
export function DecisionThread({ items, mode = "active", loading, className }: DecisionThreadProps) {
  if (loading) {
    return <DecisionThreadSkeleton className={className} />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma etapa registrada ainda.</p>;
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const isCurrent = mode === "active" && item.current;
        const isLast = index === items.length - 1;
        const node = NODE[item.state];
        const Icon = item.icon ?? node.icon;
        return (
          <li
            key={item.id}
            aria-current={isCurrent ? "step" : undefined}
            className="relative grid grid-cols-[1.5rem_1fr] gap-x-3"
          >
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute top-7 bottom-1 left-3 w-px -translate-x-1/2 bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 flex size-6 items-center justify-center rounded-full",
                node.ring,
                isCurrent && "ring-2 ring-current/25",
                isCurrent && node.ink,
              )}
            >
              <Icon className={cn("size-3.5", node.ink)} weight="bold" />
            </span>
            <div className={cn("min-w-0", isLast ? "pb-0" : "pb-5")}>
              <div className="flex min-h-7 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-1">
                <p
                  className={cn(
                    "text-sm text-foreground",
                    isCurrent ? "font-semibold" : "font-medium",
                  )}
                >
                  {item.title}
                </p>
                {item.timestamp && (
                  <time className="text-xs text-muted-foreground tabular-nums">{item.timestamp}</time>
                )}
              </div>
              {item.description && mode === "active" && (
                <p className="mt-0.5 text-[0.8125rem] text-pretty text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DecisionThreadSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5", className)} aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-col gap-1.5 pt-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
