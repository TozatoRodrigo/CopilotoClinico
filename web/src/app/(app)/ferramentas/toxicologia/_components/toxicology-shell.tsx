'use client';

import type { ReactNode } from 'react';
import { Phone, Skull } from '@phosphor-icons/react';
import { DISQUE_INTOXICACAO, telHref } from '@clinical-tools/toxicology/ciatox';
import { TOX_MODULES, type ToxModuleId } from '@clinical-tools/toxicology/modules';
import { TOX_PATH_PROVENANCE } from '@clinical-tools/toxicology/provenance';
import { Button } from '@/components/ui/button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

/**
 * Botão de ligar para o Disque-Intoxicação. Em todo fim de roteiro e no rodapé
 * de cada seção, como no ANY: o médico liga sem voltar à tela inicial.
 */
export function PoisonCenterCallButton({
  variant = 'outline',
  className,
}: {
  variant?: 'default' | 'outline';
  className?: string;
}) {
  return (
    <Button asChild variant={variant} className={cn('h-11 max-sm:h-11', className)}>
      <a href={telHref(DISQUE_INTOXICACAO)}>
        <Phone aria-hidden="true" />
        {DISQUE_INTOXICACAO.name}: {DISQUE_INTOXICACAO.phone}
      </a>
    </Button>
  );
}

/**
 * Página de uma seção do roteiro (/ferramentas/toxicologia/<seção>): título da
 * seção, aviso fixo, o conteúdo e, no rodapé, o Disque-Intoxicação e a
 * procedência do conteúdo.
 */
export function ToxicologyModulePage({
  moduleId,
  children,
}: {
  moduleId: ToxModuleId;
  children: ReactNode;
}) {
  const section = TOX_MODULES.find(({ id }) => id === moduleId);
  if (!section) throw new Error(`Seção ${moduleId} não existe no roteiro de Toxicologia.`);
  return (
    <Page width="narrow">
      <PageHeader
        icon={Skull}
        iconTone="blue"
        size="compact"
        title={section.title}
        description={section.subtitle}
      />
      <DecisionSupportNotice />
      {children}
      <footer className="flex flex-col gap-3 border-t border-border pt-4">
        <PoisonCenterCallButton className="self-start" />
        <ContentProvenanceNote provenance={TOX_PATH_PROVENANCE} />
      </footer>
    </Page>
  );
}

/** Opção de resposta de um roteiro (árvore, descontaminação): toque de 48px, texto quebra. */
export function FlowOptionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-auto min-h-12 w-full justify-start px-4 py-3 text-left text-base whitespace-normal max-sm:h-auto"
    >
      {children}
    </Button>
  );
}
