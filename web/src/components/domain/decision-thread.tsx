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
}

const NODE_COLOR: Record<DecisionThreadNodeState, string> = {
  analysis: "bg-clinical-teal",
  question: "bg-clinical-amber",
  conduct: "bg-clinical-green",
  document: "bg-clinical-ink-soft",
};

interface DecisionThreadProps {
  items: DecisionThreadItem[];
  mode?: "active" | "history";
  loading?: boolean;
  className?: string;
}

export function DecisionThread({ items, mode = "active", loading, className }: DecisionThreadProps) {
  if (loading) {
    return <DecisionThreadSkeleton className={className} />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma etapa registrada ainda.</p>;
  }

  return (
    <ol className={cn("relative space-y-4 border-l-2 border-clinical-line pl-6", className)}>
      {items.map((item) => {
        const isCurrent = mode === "active" && item.current;
        return (
          <li key={item.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 -left-[1.6875rem] size-2.5 rounded-full ring-4 ring-background",
                NODE_COLOR[item.state],
                isCurrent && "size-3 -left-[1.8125rem]",
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={cn("font-medium", isCurrent ? "text-foreground" : "text-foreground/90")}>
                {item.title}
              </p>
              {item.timestamp && (
                <time className="font-mono text-xs text-muted-foreground">{item.timestamp}</time>
              )}
            </div>
            {item.description && mode === "active" && (
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DecisionThreadSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative space-y-4 border-l-2 border-clinical-line pl-6", className)}>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="relative space-y-1.5">
          <span
            aria-hidden="true"
            className="absolute top-1 -left-[1.6875rem] size-2.5 rounded-full bg-muted ring-4 ring-background"
          />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </div>
  );
}
