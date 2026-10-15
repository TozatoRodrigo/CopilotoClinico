'use client';

import { Hourglass, Toolbox } from '@phosphor-icons/react';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';

/** Tela "em breve" de uma ferramenta do catálogo ainda não portada do ANY. */
export function ToolComingSoonScreen({ name, description }: { name: string; description: string }) {
  return (
    <Page width="narrow">
      <PageHeader icon={Toolbox} iconTone="gray" title={name} description={description} />
      <DecisionSupportNotice />
      <EmptyState
        icon={<Hourglass />}
        title="Em breve"
        description="Esta ferramenta do ANY ainda não foi portada para o Copiloto."
        actionLabel="Ver ferramentas disponíveis"
        actionHref="/ferramentas"
      />
    </Page>
  );
}
