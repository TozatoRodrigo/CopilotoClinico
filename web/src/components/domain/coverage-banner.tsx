"use client";

import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";
import type { RetrievalCoverage } from "@/lib/types";

interface CoverageBannerProps {
  coverage: RetrievalCoverage | null | undefined;
  /** Busca manual nas diretrizes, pré-preenchida com o texto do caso. */
  guidelinesHref?: string;
  className?: string;
}

/**
 * KB-005/KB-006 — Aviso de cobertura da base de diretrizes.
 *
 * Origem: dois casos reportados em campo (dengue conduzido como sepse,
 * cefaleia em salvas apontada como hemorragia). Nos dois, o cenário real não
 * existia na base e o Copiloto respondeu citando o cenário vizinho, sem que o
 * médico tivesse como saber que a evidência não era do caso dele.
 *
 * Este banner é deliberadamente distinto do `UncertaintyBanner`: incerteza
 * fala do RACIOCÍNIO ("faltam dados / a evidência não fecha"), cobertura fala
 * do que a base CONTÉM. Sem essa separação, "a base não cobre dengue" chega ao
 * médico como se fosse hesitação do modelo.
 *
 * `null`/`undefined` (interações anteriores a esta mudança) e `full` não
 * renderizam nada — nunca afirmar cobertura que não foi medida.
 */
export function CoverageBanner({ coverage, guidelinesHref, className }: CoverageBannerProps) {
  if (coverage !== "none" && coverage !== "partial") return null;

  const copy = coverage === "none" ? messages.coverage.none : messages.coverage.partial;

  return (
    <Alert
      className={cn(
        "bg-card",
        // Âmbar é reservado a "o médico precisa agir" (docs/design-tokens.md).
        // Cobertura nenhuma muda a conduta: o plano abaixo não tem lastro em
        // diretriz. Cobertura parcial é advertência de conferência, não ação.
        coverage === "none" ? "border-clinical-amber/40" : "border-clinical-line",
        className,
      )}
    >
      <BookOpen
        className={coverage === "none" ? "text-clinical-amber" : "text-muted-foreground"}
        weight="duotone"
      />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.body}</p>
        {guidelinesHref && (
          <div className="mt-3">
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={guidelinesHref}>{messages.coverage.action}</Link>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
