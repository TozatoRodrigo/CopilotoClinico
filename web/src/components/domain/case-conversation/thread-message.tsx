import type { ReactNode } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * ADR-014 — blocos da conversa do caso, no visual de página do Notion e não
 * de mensageiro: o que o médico disse fica num bloco cinza à direita; o que
 * o Copiloto diz é texto corrido com o ícone da IA (azul = IA).
 */

export function PhysicianMessage({
  author,
  children,
  className,
}: {
  author: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <span className="text-xs text-muted-foreground">{author}</span>
      <div className="max-w-[85%] rounded-lg rounded-br-sm bg-tone-gray-bg px-3.5 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

export function CopilotMessage({
  author,
  children,
  className,
}: {
  author: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-tone-blue-bg text-tone-blue"
      >
        <Sparkle className="size-3.5" weight="fill" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-[0.9375rem] leading-relaxed text-foreground">
        <span className="sr-only">{author}: </span>
        {children}
      </div>
    </div>
  );
}

/** "Lendo o caso…", "Montando o plano…": sinal de vida sem texto clínico parcial. */
export function TypingLine({ label, hint }: { label: string; hint?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span aria-hidden="true" className="inline-flex gap-1">
          <span className="size-1.5 animate-pulse rounded-full bg-fg-tertiary motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-fg-tertiary [animation-delay:150ms] motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-fg-tertiary [animation-delay:300ms] motion-reduce:animate-none" />
        </span>
        {label}
      </span>
      {hint && <span className="text-[0.8125rem] text-muted-foreground">{hint}</span>}
    </div>
  );
}
