import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DataMetricProps {
  label: string;
  value?: string | number;
  hint?: string;
  loading?: boolean;
  className?: string;
}

export function DataMetric({ label, value, hint, loading, className }: DataMetricProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-9 w-16" />
      ) : (
        <p className="text-3xl font-bold text-foreground">{value ?? "—"}</p>
      )}
      {hint && !loading && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
