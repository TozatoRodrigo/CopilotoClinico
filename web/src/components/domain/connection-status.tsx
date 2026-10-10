import { cn } from "@/lib/utils";

export type ConnectionState = "online" | "offline" | "syncing";

interface ConnectionStatusProps {
  status: ConnectionState;
  className?: string;
}

const CONFIG: Record<ConnectionState, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-clinical-green" },
  offline: { label: "Offline — funcionalidades limitadas", dot: "bg-clinical-amber" },
  syncing: { label: "Sincronizando…", dot: "bg-primary" },
};

/** Indicador de conexão discreto (ponto colorido + texto cinza), estilo Notion. */
export function ConnectionStatus({ status, className }: ConnectionStatusProps) {
  const config = CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
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
