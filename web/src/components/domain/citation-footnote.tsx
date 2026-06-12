import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CitationFootnoteProps {
  source: string;
  sourceVersion: string;
  text?: string;
  evidenceLevel?: string;
  href?: string;
  origin?: "institutional" | "public";
  className?: string;
}

export function CitationFootnote({
  source,
  sourceVersion,
  text,
  evidenceLevel,
  href,
  origin,
  className,
}: CitationFootnoteProps) {
  return (
    <footer className={cn("space-y-1 border-t border-dashed border-clinical-line pt-2 text-sm", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          {source} <span className="font-mono text-xs text-muted-foreground">v{sourceVersion}</span>
        </span>
        {evidenceLevel && <Badge variant="outline">Evidência {evidenceLevel}</Badge>}
        {origin === "institutional" && <Badge variant="secondary">Protocolo institucional</Badge>}
        {origin === "public" && <Badge variant="outline">Diretriz pública</Badge>}
      </div>
      {text && <p className="line-clamp-2 text-muted-foreground">{text}</p>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-clinical-teal underline underline-offset-4"
        >
          Ver trecho completo
        </a>
      )}
    </footer>
  );
}

export function CitationFootnoteSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2 border-t border-dashed border-clinical-line pt-2", className)}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}
