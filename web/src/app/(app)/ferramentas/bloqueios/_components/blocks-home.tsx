'use client';

import type { ElementType } from 'react';
import {
  Calculator,
  FileText,
  ListBullets,
  MapPin,
  Syringe,
  WarningOctagon,
} from '@phosphor-icons/react';
import { TOOLS } from '@clinical-tools/catalog';
import { BLOCKS_PROVENANCE } from '@clinical-tools/blocks/content';
import {
  BLOCK_SECTIONS,
  blockSectionHref,
  type BlockSectionId,
} from '@clinical-tools/blocks/sections';
import { Badge } from '@/components/ui/badge';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from '../../_components/tool-entries';
import { LinkRow } from './blocks-ui';

const TOOL = TOOLS.find(({ id }) => id === 'bloqueios');

const SECTION_ICON: Record<BlockSectionId, ElementType> = {
  topografia: MapPin,
  lista: ListBullets,
  'dose-maxima': Calculator,
  last: WarningOctagon,
  evolucao: FileText,
};

/**
 * /ferramentas/bloqueios — tela inicial do roteiro (CC-330): as cinco seções
 * do BlockPath do ANY. O LAST leva a etiqueta de emergência, como lá.
 */
export function BlocksHome() {
  const favorites = useToolFavorites();
  const name = TOOL?.name ?? 'Bloqueios regionais';
  return (
    <Page width="narrow">
      <PageHeader
        icon={Syringe}
        iconTone="blue"
        title={name}
        description="Anestesia regional no PS: o bloqueio pela lesão, a técnica, a dose máxima de anestésico local e o LAST."
        actions={<FavoriteButton favoriteKey="tool:bloqueios" name={name} favorites={favorites} />}
      />
      <DecisionSupportNotice />
      <nav aria-label="Seções dos bloqueios">
        <ul className="flex flex-col">
          {BLOCK_SECTIONS.map((section) => (
            <LinkRow
              key={section.id}
              href={blockSectionHref(section.id)}
              icon={SECTION_ICON[section.id]}
              title={section.title}
              description={section.subtitle}
              trailing={
                section.id === 'last' ? <Badge variant="destructive">Emergência</Badge> : null
              }
            />
          ))}
        </ul>
      </nav>
      <footer className="border-t border-border pt-4">
        <ContentProvenanceNote provenance={BLOCKS_PROVENANCE} />
      </footer>
    </Page>
  );
}
