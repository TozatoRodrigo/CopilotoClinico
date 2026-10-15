'use client';

import { useCallback, useState } from 'react';
import { BookOpen, Calculator, Heartbeat, Path } from '@phosphor-icons/react';
import { TOOLS } from '@clinical-tools/catalog';
import type { TepReferenceSectionId } from '@clinical-tools/tep/links';
import { TEP_PROVENANCE } from '@clinical-tools/tep/provenance';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from '../../_components/tool-entries';
import { OpenReferenceContext } from './tep-parts';
import { TepCalculators } from './tep-calculators';
import { TepPathway } from './tep-pathway';
import { TepReference } from './tep-reference';
import { isTepTab, useTepPathway, useTepTab } from './tep-state';

const TOOL = TOOLS.find((tool) => tool.id === 'tep');

/**
 * /ferramentas/tep — Tromboembolismo pulmonar (CC-318), o TepGuide do ANY:
 * roteiro (estável × instável, investigação, classificação A–E e conduta),
 * as nove calculadoras avulsas e a referência rápida. A aba e o ponto do
 * roteiro ficam na sessão da aba.
 */
export function TepScreen() {
  const favorites = useToolFavorites();
  const [tab, setTab] = useTepTab();
  const [state, dispatch] = useTepPathway();
  const [referenceFocus, setReferenceFocus] = useState<TepReferenceSectionId | null>(null);

  const openReference = useCallback(
    (section: TepReferenceSectionId) => {
      setReferenceFocus(section);
      setTab('referencia');
    },
    [setTab],
  );

  const name = TOOL?.name ?? 'Tromboembolismo pulmonar';
  return (
    <Page width="narrow">
      <PageHeader
        icon={Heartbeat}
        iconTone="blue"
        title={name}
        description={TOOL?.description}
        actions={<FavoriteButton favoriteKey="tool:tep" name={name} favorites={favorites} />}
      />
      <DecisionSupportNotice />

      <OpenReferenceContext.Provider value={openReference}>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (!isTepTab(value)) return;
            setReferenceFocus(null);
            setTab(value);
          }}
          className="gap-5"
        >
          <TabsList aria-label="Seções do TEP">
            <TabsTrigger value="roteiro">
              <Path aria-hidden="true" />
              Roteiro
            </TabsTrigger>
            <TabsTrigger value="calculadoras">
              <Calculator aria-hidden="true" />
              Calculadoras
            </TabsTrigger>
            <TabsTrigger value="referencia">
              <BookOpen aria-hidden="true" />
              Referência
            </TabsTrigger>
          </TabsList>
          <TabsContent value="roteiro">
            <TepPathway state={state} dispatch={dispatch} />
          </TabsContent>
          <TabsContent value="calculadoras">
            <TepCalculators />
          </TabsContent>
          <TabsContent value="referencia">
            <TepReference focus={referenceFocus} />
          </TabsContent>
        </Tabs>
      </OpenReferenceContext.Provider>

      <ContentProvenanceNote provenance={TEP_PROVENANCE} className="border-t border-border pt-4" />
    </Page>
  );
}
