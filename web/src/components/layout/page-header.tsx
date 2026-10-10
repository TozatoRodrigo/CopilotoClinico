import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type Tone } from "@/lib/tone";

/**
 * Cabeçalho de página no estilo Notion: ícone grande opcional acima do
 * título, título em negrito (40px no desktop), descrição em cinza e ações à
 * direita. `children` continua aceito como ações (compatibilidade).
 */
interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ícone Phosphor exibido como "ícone da página" do Notion. */
  icon?: ElementType;
  iconTone?: Tone;
  /** Texto pequeno acima do título (data, contexto). */
  eyebrow?: ReactNode;
  /** Ações à direita do título (botões). */
  actions?: ReactNode;
  /** Propriedades/metadados logo abaixo do título (ex.: <PropertyList>). */
  properties?: ReactNode;
  size?: "default" | "compact";
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  iconTone = "gray",
  eyebrow,
  actions,
  properties,
  size = "default",
  children,
  className,
}: PageHeaderProps) {
  const actionSlot = actions ?? children;
  return (
    <div data-slot="page-header" className={cn("flex flex-col gap-3", className)}>
      {Icon ? (
        <Icon
          aria-hidden="true"
          weight="duotone"
          className={cn(
            size === "compact" ? "size-10" : "size-12 md:size-14",
            "-ml-0.5",
            toneText[iconTone],
          )}
        />
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
          <h1
            className={cn(
              "font-display text-balance text-foreground",
              size === "compact" ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-[0.9375rem] text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actionSlot ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actionSlot}</div>
        ) : null}
      </div>
      {properties ? <div className="pt-1">{properties}</div> : null}
    </div>
  );
}

/**
 * Título de seção dentro da página (equivalente ao H2/H3 do Notion), com
 * contagem e ação opcionais à direita.
 */
export function SectionHeader({
  title,
  description,
  count,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div data-slot="section-header" className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <Heading
          className={cn(
            "font-semibold tracking-[-0.01em] text-foreground",
            Heading === "h2" ? "text-lg" : "text-base",
          )}
        >
          {title}
        </Heading>
        {count !== undefined && count !== null ? (
          <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
        ) : null}
        <span className="flex-1" />
        {action}
      </div>
      {description ? (
        <p className="text-[0.8125rem] text-pretty text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
