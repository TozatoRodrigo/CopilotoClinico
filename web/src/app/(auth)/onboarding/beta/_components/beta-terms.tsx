'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { BETA_TERMS } from '@contracts/beta';
import { Callout } from '@/components/ui/callout';

/**
 * CC-702 — texto do termo do beta, lido do contrato (a versão aceita é a
 * mesma que a API confere). Provisório até o parecer jurídico.
 */
export function BetaTermsText() {
  return (
    <div className="flex flex-col gap-3">
      {BETA_TERMS.provisional && (
        <Callout tone="orange" icon={<WarningCircle weight="fill" />} title="Texto provisório">
          Este termo ainda passa por revisão jurídica. Quando a versão final sair, pediremos um novo
          aceite.
        </Callout>
      )}
      <section
        aria-label={BETA_TERMS.title}
        tabIndex={0}
        className="flex max-h-80 flex-col gap-4 overflow-y-auto rounded-lg border border-border px-4 py-3.5 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        {BETA_TERMS.sections.map((section) => (
          <div key={section.heading} className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-foreground">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm text-pretty text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Versão {BETA_TERMS.version}</p>
      </section>
    </div>
  );
}
