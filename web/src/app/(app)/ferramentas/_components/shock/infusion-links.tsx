'use client';

import Link from 'next/link';
import { Calculator } from '@phosphor-icons/react';
import { SHOCK_INFUSION_DRUGS, type ShockInfusionDrug } from '@clinical-tools/shock/septic-shock';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Endereço das Infusões com a droga já aberta (`?droga=<id>`, CC-311). O
 * estado do roteiro fica na sessão da aba: voltar (botão do navegador ou a
 * trilha) cai no mesmo passo.
 */
export function infusionHref(drug: ShockInfusionDrug): string {
  return `/ferramentas/infusoes?droga=${drug}`;
}

/** Atalhos "Calcular <droga>" para as Infusões, como os do ANY. */
export function InfusionLinks({
  drugs,
  className,
}: {
  drugs: readonly ShockInfusionDrug[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {drugs.map((drug) => (
        <Button key={drug} asChild variant="outline">
          <Link href={infusionHref(drug)}>
            <Calculator aria-hidden="true" />
            Calcular {SHOCK_INFUSION_DRUGS[drug].toLowerCase()}
          </Link>
        </Button>
      ))}
    </div>
  );
}
