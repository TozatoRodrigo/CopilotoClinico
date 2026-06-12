import { cn } from "@/lib/utils";

export type ConnectionState = "online" | "offline" | "syncing";

interface ConnectionStatusProps {
  status: ConnectionState;
  className?: string;
}

const CONFIG: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  online: { label: "Online", dot: "bg-clinical-green", text: "text-clinical-green-foreground" },
  offline: {
    label: "Offline — funcionalidades limitadas",
    dot: "bg-clinical-amber",
    text: "text-clinical-amber-foreground",
  },
  syncing: { label: "Sincronizando…", dot: "bg-clinical-teal", text: "text-clinical-teal-deep" },
};

export function ConnectionStatus({ status, className }: ConnectionStatusProps) {
  const config = CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-clinical-line bg-card px-2.5 py-1 text-xs font-medium",
        config.text,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", config.dot, status === "syncing" && "animate-pulse")}
      />
      {config.label}
    </span>
  );
}
