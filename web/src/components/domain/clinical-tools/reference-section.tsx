'use client';

import type { CalculatorReference } from '@clinical-tools/calculator';
import type { ContentProvenance } from '@clinical-tools/provenance';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/utils';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export interface ReferenceSectionProps {
  reference: CalculatorReference;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Seção de referência (CC-305): por que usar, quando usar, pérolas e
 * armadilhas, e a citação. Fechada por padrão para não empurrar o
 * resultado para baixo no celular.
 */
export function ReferenceSection({
  reference,
  defaultOpen = false,
  className,
}: ReferenceSectionProps) {
  return (
    <Disclosure
      title="Por que usar, quando usar e referência"
      defaultOpen={defaultOpen}
      className={className}
    >
      <div className="flex flex-col gap-4 text-[0.9375rem] text-foreground">
        <Block title="Por que usar">
          <p className="text-pretty">{reference.why}</p>
        </Block>
        <Block title="Quando usar">
          <p className="text-pretty">{reference.whenToUse}</p>
        </Block>
        <Block title="Pérolas e armadilhas">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {reference.pearlsPitfalls.map((pearl) => (
              <li key={pearl} className="text-pretty">
                {pearl}
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Referência">
          <p className="text-sm text-pretty text-muted-foreground">{reference.citation}</p>
        </Block>
      </div>
    </Disclosure>
  );
}

/** Rodapé com a procedência do conteúdo (ADR-017): origem, versão e revisão clínica. */
export function ContentProvenanceNote({
  provenance,
  className,
}: {
  provenance: ContentProvenance;
  className?: string;
}) {
  const review =
    provenance.review.status === 'revisado'
      ? `revisado por ${provenance.review.reviewer} (CRM ${provenance.review.crm}) em ${provenance.review.reviewedAt}`
      : provenance.review.assignedTo
        ? `revisão clínica pendente (${provenance.review.assignedTo})`
        : 'revisão clínica pendente';
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Conteúdo: {provenance.source} · versão {provenance.version} · {review}
    </p>
  );
}
