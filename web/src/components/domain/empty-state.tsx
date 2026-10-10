import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}>
      {icon && (
        <div className="text-fg-tertiary [&_svg:not([class*='size-'])]:size-8" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="text-[0.9375rem] font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {actionLabel &&
        (actionHref ? (
          <Button asChild size="sm" className="mt-1">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : (
          <Button size="sm" className="mt-1" onClick={onAction}>
            {actionLabel}
          </Button>
        ))}
    </div>
  );
}
