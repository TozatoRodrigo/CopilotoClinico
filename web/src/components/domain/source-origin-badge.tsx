import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/types";

export type SourceOrigin = NonNullable<Citation["origin"]>;

/** Rótulos longos quebram linha em vez de vazar do bloco no celular. */
const WRAP = "h-auto min-h-5 max-w-full whitespace-normal py-0.5 text-left leading-snug";

/**
 * Rótulo de origem da fonte citada, como tag do Notion. A garantia do produto
 * é "toda recomendação cita uma fonte, e a interface sempre diz se ela foi
 * revisada pela equipe clínica" (F4, ADR-010).
 *
 * Cores de categoria (docs/design-system.md), não clínicas — exceto o anexo:
 * - Anexo do médico: laranja — ninguém revisou e o médico precisa conferir
 *   antes de seguir a conduta ("muda a conduta").
 * - Base oficial do MS: cinza — é normativo (portaria), só ainda não passou
 *   pela revisão da equipe. Informar, não alarmar.
 * - Protocolo institucional: roxo · Diretriz pública: marrom.
 *
 * `undefined` (análises anteriores ao campo) não renderiza nada: nunca afirmar
 * uma origem que não foi registrada.
 */
export function SourceOriginBadge({
  origin,
  className,
}: {
  origin: SourceOrigin | undefined;
  className?: string;
}) {
  switch (origin) {
    case "official_unreviewed":
      return (
        <Badge variant="gray" className={cn(WRAP, className)}>
          Ministério da Saúde · não revisado pela equipe
        </Badge>
      );
    case "physician_attachment":
      return (
        <Badge variant="warning" className={cn(WRAP, className)}>
          Anexo do médico · não curada
        </Badge>
      );
    case "institutional":
      return (
        <Badge variant="purple" className={className}>
          Protocolo institucional
        </Badge>
      );
    case "public":
      return (
        <Badge variant="brown" className={className}>
          Diretriz pública
        </Badge>
      );
    default:
      return null;
  }
}

/** Fontes que ainda não passaram pela curadoria da equipe clínica. */
export function isUnreviewedOrigin(origin: SourceOrigin | undefined): boolean {
  return origin === "official_unreviewed" || origin === "physician_attachment";
}
