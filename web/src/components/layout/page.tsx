import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Coluna de conteúdo de uma página, como no Notion:
 *  - `narrow`  (~720px): formulários, leitura, documentos
 *  - `default` (~960px): páginas de conteúdo misto (Plantão, detalhe do caso)
 *  - `wide`    (~1200px): databases/tabelas (Casos, Auditoria, Admin)
 *  - `full`: ocupa toda a largura útil
 *
 * O padding lateral fica no AppShell/AdminShell; aqui só a largura e o ritmo
 * vertical entre blocos.
 */
const WIDTH: Record<"narrow" | "default" | "wide" | "full", string> = {
  narrow: "max-w-[720px]",
  default: "max-w-[960px]",
  wide: "max-w-[1200px]",
  full: "max-w-none",
};

export function Page({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="page"
      className={cn("mx-auto flex w-full flex-col gap-8", WIDTH[width], className)}
    >
      {children}
    </div>
  );
}
