'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wind } from '@phosphor-icons/react';
import { ACLS_PROVENANCE } from '@clinical-tools/acls/content';
import {
  OVACE_STEPS,
  OVACE_SUBTITLE,
  OVACE_TITLE,
  type OvaceOption,
  type OvaceStepId,
  type OvaceTone,
} from '@clinical-tools/acls/ovace';
import { useAclsSession } from '@/components/domain/clinical-tools/acls/acls-session-provider';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import type { Tone } from '@/lib/tone';

/** Tom do motor → design system (ADR-017): grave em vermelho, alerta em laranja. */
const OVACE_TONE: Record<OvaceTone, Tone> = {
  neutral: 'gray',
  attention: 'orange',
  critical: 'red',
  info: 'blue',
};

/**
 * /ferramentas/acls/ovace (CC-314): roteiro de engasgo, um passo por vez. No
 * passo "inconsciente", "Iniciar código de PCR" abre o ACLS já com o código
 * iniciado (ou volta à parada que já estiver em curso).
 */
export function AclsOvaceScreen() {
  const router = useRouter();
  const { state, start } = useAclsSession();
  const [stepId, setStepId] = useState<OvaceStepId>('assessment');
  const step = OVACE_STEPS[stepId];
  const running = state.status === 'running';

  function choose(option: OvaceOption) {
    const { target } = option;
    if (target.kind === 'step') {
      setStepId(target.step);
      return;
    }
    if (target.kind === 'start-code' && !running) start();
    router.push('/ferramentas/acls');
  }

  return (
    <Page width="narrow" className="gap-6">
      <PageHeader icon={Wind} iconTone="blue" title={OVACE_TITLE} description={OVACE_SUBTITLE} />
      <DecisionSupportNotice />

      <section aria-live="polite" aria-label="Passo do roteiro" className="flex flex-col gap-3">
        {step.blocks.map((block) => (
          <Callout key={block.title} tone={OVACE_TONE[block.tone]} title={block.title}>
            {block.label || block.text ? (
              <span className="flex flex-col gap-0.5">
                {block.label ? <span className="text-xs">{block.label}</span> : null}
                {block.text ? <span>{block.text}</span> : null}
              </span>
            ) : null}
          </Callout>
        ))}
        {step.signs ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-foreground">
            {step.signs.map((sign) => (
              <li key={sign}>{sign}</li>
            ))}
          </ul>
        ) : null}
        {step.note ? <p className="text-sm text-muted-foreground">{step.note}</p> : null}
      </section>

      <div className="flex flex-col gap-2">
        {step.options.map((option) => (
          <Button
            key={option.label}
            type="button"
            variant={option.emphasis === 'primary' ? 'default' : 'outline'}
            onClick={() => choose(option)}
            className="min-h-12 w-full"
          >
            {option.target.kind === 'start-code' && running ? 'Voltar à parada' : option.label}
          </Button>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <ContentProvenanceNote provenance={ACLS_PROVENANCE} />
      </div>
    </Page>
  );
}
