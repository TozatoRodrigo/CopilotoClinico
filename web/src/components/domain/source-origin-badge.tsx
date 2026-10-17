"use client";

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/messages/use-messages";
import { cn } from "@/lib/utils";
import type { CitationOrigin } from "@/lib/types";

export type SourceOrigin = CitationOrigin;

/** Rótulos longos quebram linha em vez de vazar do bloco no celular. */
const WRAP = "h-auto min-h-5 max-w-full whitespace-normal py-0.5 text-left leading-snug";

/**
 * Cores de categoria (docs/design-system.md), não clínicas — exceto o anexo:
 * - Anexo do médico: laranja — ninguém revisou e o médico precisa conferir
 *   antes de seguir a conduta ("muda a conduta").
 * - Base oficial do MS e base curada sem assinatura (ADR-012): cinza — nenhum
 *   médico assinou, mas a conduta já sai preliminar. Informar, não alarmar.
 * - Protocolo institucional: roxo · Diretriz pública: marrom.
 * - F1 (decisão v2): conhecimento geral do modelo em azul (IA, informação) e
 *   fonte oficial externa da pesquisa web em cinza, como a base oficial do MS:
 *   oficial, mas ninguém da equipe revisou.
 * - CC-408: cartão revisado em verde — conteúdo assinado por médico com CRM
 *   verificado (semântica "conduta confirmada/assinada" do design system).
 */
const ORIGIN_BADGE: Record<
  SourceOrigin,
  { variant: "gray" | "warning" | "purple" | "brown" | "blue" | "success"; wrap: boolean }
> = {
  reviewed_card: { variant: "success", wrap: true },
  official_unreviewed: { variant: "gray", wrap: true },
  curated_unsigned: { variant: "gray", wrap: true },
  physician_attachment: { variant: "warning", wrap: true },
  institutional: { variant: "purple", wrap: false },
  public: { variant: "brown", wrap: false },
  model_knowledge: { variant: "blue", wrap: true },
  web_official: { variant: "gray", wrap: true },
};

/**
 * Rótulo de origem da fonte citada, como tag do Notion. A garantia do produto
 * é "toda recomendação cita uma fonte, e a interface sempre diz se ela foi
 * revisada por médico" (F4, ADR-010, ADR-012).
 *
 * `undefined` (análises anteriores ao campo) não renderiza nada: nunca afirmar
 * uma origem que não foi registrada.
 */
export function SourceOriginBadge({
  origin,
  domain,
  className,
}: {
  origin: SourceOrigin | undefined;
  /** F1 — domínio da página, para "Fonte oficial externa · <domínio>". */
  domain?: string;
  className?: string;
}) {
  const messages = useMessages();
  if (!origin) return null;

  const { variant, wrap } = ORIGIN_BADGE[origin];
  const label = messages.sourceOrigin[origin];
  return (
    <Badge variant={variant} className={cn(wrap && WRAP, className)}>
      {origin === "web_official" && domain ? `${label} · ${domain}` : label}
    </Badge>
  );
}

const UNREVIEWED_ORIGINS: ReadonlySet<SourceOrigin> = new Set<SourceOrigin>([
  "official_unreviewed",
  "physician_attachment",
  "curated_unsigned",
  "model_knowledge",
  "web_official",
]);

/** Fontes que nenhum médico com CRM verificado assinou. */
export function isUnreviewedOrigin(origin: SourceOrigin | undefined): boolean {
  return origin !== undefined && UNREVIEWED_ORIGINS.has(origin);
}
