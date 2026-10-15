'use client';

import { ListBullets, MapPin } from '@phosphor-icons/react';
import { BLOCK_LIST, getRegionalBlock, TOPOGRAPHY } from '@clinical-tools/blocks/content';
import { regionalBlockHref } from '@clinical-tools/blocks/sections';
import { SectionHeader } from '@/components/layout/page-header';
import { BlocksPage, LinkRow } from './blocks-ui';

/**
 * /ferramentas/bloqueios/topografia — "Onde está a lesão?": cada lesão abre a
 * ficha do bloqueio que o ANY sugere para ela (14 caminhos).
 */
export function TopographyScreen() {
  return (
    <BlocksPage
      icon={MapPin}
      title="Escolher pela lesão"
      description="Onde está a lesão? Toque nela para ver o bloqueio a considerar."
      current="topografia"
    >
      {TOPOGRAPHY.map((category, index) => {
        const headingId = `topografia-${index}`;
        return (
          <section key={category.title} aria-labelledby={headingId} className="flex flex-col gap-2">
            <SectionHeader
              title={<span id={headingId}>{category.title}</span>}
              className="border-b border-border pb-1.5"
            />
            <ul className="flex flex-col">
              {category.mappings.map((mapping) => (
                <LinkRow
                  key={`${mapping.lesion}-${mapping.blockId}`}
                  href={regionalBlockHref(mapping.blockId)}
                  title={mapping.lesion}
                  trailing={mapping.blockName}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </BlocksPage>
  );
}

/** /ferramentas/bloqueios/lista — os 14 bloqueios por região, com o volume usual. */
export function BlockListScreen() {
  return (
    <BlocksPage
      icon={ListBullets}
      title="Lista de bloqueios"
      description="Os 14 bloqueios, por região, com o volume usual de anestésico."
      current="lista"
    >
      {BLOCK_LIST.map((region, index) => {
        const headingId = `lista-${index}`;
        return (
          <section key={region.region} aria-labelledby={headingId} className="flex flex-col gap-2">
            <SectionHeader
              title={<span id={headingId}>{region.region}</span>}
              count={region.blockIds.length}
              className="border-b border-border pb-1.5"
            />
            <ul className="flex flex-col">
              {region.blockIds.map((id) => {
                const block = getRegionalBlock(id);
                return (
                  <LinkRow
                    key={id}
                    href={regionalBlockHref(id)}
                    title={block.listName}
                    description={block.volume}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </BlocksPage>
  );
}
