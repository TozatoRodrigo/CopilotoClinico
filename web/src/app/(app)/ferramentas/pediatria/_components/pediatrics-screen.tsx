'use client';

import { Baby } from '@phosphor-icons/react';
import {
  PEDIATRIC_DOSES_PROVENANCE,
  PEDIATRIC_ESTIMATES_PROVENANCE,
} from '@clinical-tools/pediatrics/provenance';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { CanonicalSourceNotice } from '@/components/domain/clinical-tools/pediatrics/canonical-source-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from '../../_components/tool-entries';
import { AirwaySection, BolusSection, InfusionSection } from './dose-sections';
import { PatientPanel } from './patient-panel';
import {
  ChecklistSection,
  CprSection,
  FluidsSection,
  ScenarioList,
  VitalSignsSection,
} from './support-sections';

const JUMPS = [
  { href: '#cenarios', label: 'Cenários' },
  { href: '#pcr', label: 'PCR' },
  { href: '#via-aerea', label: 'Via aérea' },
  { href: '#doses', label: 'Doses' },
  { href: '#infusoes', label: 'Infusões' },
  { href: '#fluidos', label: 'Fluidos' },
  { href: '#sinais-vitais', label: 'Sinais vitais' },
];

/** Atalhos para as seções: no celular a página é longa e o polegar não alcança o topo. */
function SectionJumps() {
  return (
    <nav aria-label="Seções da pediatria" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {JUMPS.map((jump) => (
        <a
          key={jump.href}
          href={jump.href}
          className="flex min-h-11 shrink-0 items-center rounded-full border border-border px-3.5 text-sm text-foreground transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {jump.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * /ferramentas/pediatria — Emergência pediátrica (CC-319, CC-320, ADR-017):
 * peso, cor de Broselow, comprimento ou idade; cenários; PCR; material de
 * via aérea; 65 drogas em bolus; 16 infusões; fluidos, transfusão e sinais
 * vitais. Celular primeiro: a criança em cima, os atalhos de seção logo abaixo.
 */
export function PediatricsScreen() {
  const favorites = useToolFavorites();
  return (
    <Page width="narrow">
      <PageHeader
        icon={Baby}
        iconTone="blue"
        title="Emergência pediátrica"
        description="Doses e infusões pelo peso ou pela cor de Broselow."
        actions={
          <FavoriteButton
            favoriteKey="tool:pediatria"
            name="Emergência pediátrica"
            favorites={favorites}
          />
        }
      />
      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <CanonicalSourceNotice provenance={PEDIATRIC_DOSES_PROVENANCE} />
      </div>
      <PatientPanel />
      <SectionJumps />
      <ScenarioList />
      <CprSection />
      <AirwaySection />
      <ChecklistSection />
      <BolusSection />
      <InfusionSection />
      <FluidsSection />
      <VitalSignsSection />
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <ContentProvenanceNote provenance={PEDIATRIC_DOSES_PROVENANCE} />
        <p className="text-xs text-muted-foreground">
          Peso pelo comprimento e pela idade, e acessos e drenos:
        </p>
        <ContentProvenanceNote provenance={PEDIATRIC_ESTIMATES_PROVENANCE} />
      </div>
    </Page>
  );
}
