'use client';

import Link from 'next/link';
import { Calculator } from '@phosphor-icons/react';
import { infusionHref } from '@clinical-tools/infusions/items';
import { SHOCK_INFUSION_DRUGS, type ShockInfusionDrug } from '@clinical-tools/shock/septic-shock';
import { Button } from '@/components/ui/button';
import { useToolOrigin } from '@/lib/tool-links';
import { cn } from '@/lib/utils';

/**
 * Atalhos "Calcular <droga>" para as Infusões, como os do ANY: abrem a droga
 * (`?droga=<id>`, CC-311) e dizem de onde o médico veio (`?de=`). O estado do
 * roteiro fica na sessão da aba: o "Voltar para …" das Infusões, a trilha ou o
 * botão do navegador caem no mesmo passo (CC-331).
 */
export function InfusionLinks({
  drugs,
  className,
}: {
  drugs: readonly ShockInfusionDrug[];
  className?: string;
}) {
  const from = useToolOrigin();
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {drugs.map((drug) => (
        <Button key={drug} asChild variant="outline">
          <Link href={infusionHref(drug, { from })}>
            <Calculator aria-hidden="true" />
            Calcular {SHOCK_INFUSION_DRUGS[drug].toLowerCase()}
          </Link>
        </Button>
      ))}
    </div>
  );
}
