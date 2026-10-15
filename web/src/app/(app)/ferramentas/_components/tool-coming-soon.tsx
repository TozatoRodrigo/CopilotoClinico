'use client';

import { Hourglass } from '@phosphor-icons/react';
import type { ToolEntry } from '@clinical-tools/catalog';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { GROUP_ICON } from './tool-entries';

/**
 * Ferramenta do ANY que ainda não tem tela no Copiloto, aberta por link de
 * outro roteiro (o TEP liga para Infusões, Via aérea e Sedação). Mostra "em
 * breve" em vez de 404; quando a ferramenta ganha a rota dela, esta página
 * deixa de ser usada para ela.
 */
export function ToolComingSoon({ tool }: { tool: ToolEntry }) {
  return (
    <Page width="narrow">
      <PageHeader
        icon={GROUP_ICON[tool.group]}
        iconTone="gray"
        title={tool.name}
        description={tool.description}
      />
      <DecisionSupportNotice />
      <EmptyState
        icon={<Hourglass />}
        title="Em breve"
        description="Esta ferramenta do ANY ainda não foi portada para o Copiloto. Volte para continuar de onde parou."
        actionLabel="Ver ferramentas disponíveis"
        actionHref="/ferramentas"
      />
    </Page>
  );
}
