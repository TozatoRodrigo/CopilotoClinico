'use client';

import type { ContentProvenance } from '@clinical-tools/provenance';
import type { ShockReference } from '@clinical-tools/shock/sources';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/utils';

/**
 * Referências do roteiro (a tela "Referências" do ANY) e a procedência do
 * conteúdo, fechadas por padrão para não empurrar o roteiro no celular.
 */
export function ShockReferences({
  references,
  provenance,
  className,
}: {
  references: readonly ShockReference[];
  provenance: ContentProvenance;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 border-t border-border pt-4', className)}>
      <Disclosure title="Referências" meta={references.length}>
        <ul className="flex flex-col gap-3 text-sm">
          {references.map((reference) => (
            <li key={reference.id} className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">{reference.authors}</span>
              <span className="text-pretty text-foreground">{reference.citation}</span>
              <span className="text-xs text-muted-foreground">{reference.note}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
      <ContentProvenanceNote provenance={provenance} />
    </div>
  );
}
