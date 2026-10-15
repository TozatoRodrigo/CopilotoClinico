'use client';

import Link from 'next/link';
import { ArrowLeft, FirstAidKit } from '@phosphor-icons/react';
import { getBolusDrug } from '@clinical-tools/pediatrics/bolus-drugs';
import {
  getPediatricInfusion,
  WEIGHT_BAND_LABEL,
  weightBand,
} from '@clinical-tools/pediatrics/infusions';
import { PEDIATRIC_DOSES_PROVENANCE } from '@clinical-tools/pediatrics/provenance';
import type { PediatricScenario } from '@clinical-tools/pediatrics/scenarios';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { CanonicalSourceNotice } from '@/components/domain/clinical-tools/pediatrics/canonical-source-notice';
import { PediatricDrugCard } from '@/components/domain/clinical-tools/pediatrics/pediatric-drug-card';
import { PediatricInfusionCard } from '@/components/domain/clinical-tools/pediatrics/pediatric-infusion-card';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useDoseContext } from './dose-sections';
import { PatientPanel } from './patient-panel';
import { FluidFigures, IntubationChecklist } from './support-sections';

/**
 * Tela de um cenário pediátrico (CC-320): só o que o cenário pede — checklist
 * de intubação ou fluidos quando o ANY mostra, as drogas em destaque e as
 * infusões abertas, tudo pelo peso em uso. O peso é o mesmo da tela de
 * Pediatria (fica no layout da rota).
 */
export function ScenarioScreen({ scenario }: { scenario: PediatricScenario }) {
  const { kg, ageYears, ageInvalid } = useDoseContext();
  const drugs = scenario.drugs.flatMap((id) => getBolusDrug(id) ?? []);
  const infusions = scenario.infusions.flatMap((id) => getPediatricInfusion(id) ?? []);

  return (
    <Page width="narrow">
      <Link
        href="/ferramentas/pediatria#cenarios"
        className="-mb-4 flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Todos os cenários
      </Link>
      <PageHeader
        icon={FirstAidKit}
        iconTone="blue"
        title={scenario.title}
        description={scenario.description}
      />
      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <CanonicalSourceNotice provenance={PEDIATRIC_DOSES_PROVENANCE} />
      </div>
      <PatientPanel />

      {scenario.checklist ? (
        <section aria-labelledby="cenario-checklist" className="flex flex-col gap-3">
          <SectionHeader title={<span id="cenario-checklist">Checklist de intubação</span>} />
          <IntubationChecklist />
        </section>
      ) : null}

      {scenario.fluids ? (
        <section aria-labelledby="cenario-fluidos" className="flex flex-col gap-3">
          <SectionHeader title={<span id="cenario-fluidos">Fluidos e volumes</span>} />
          <FluidFigures />
        </section>
      ) : null}

      {drugs.length > 0 ? (
        <section aria-labelledby="cenario-medicacoes" className="flex flex-col gap-3">
          <SectionHeader
            title={<span id="cenario-medicacoes">Medicações</span>}
            count={drugs.length}
          />
          {drugs.map((drug) => (
            <PediatricDrugCard
              key={drug.id}
              drug={drug}
              kg={kg}
              ageYears={ageYears}
              ageInvalid={ageInvalid}
              emphasized
            />
          ))}
        </section>
      ) : null}

      {infusions.length > 0 ? (
        <section aria-labelledby="cenario-infusoes" className="flex flex-col gap-3">
          <SectionHeader
            title={<span id="cenario-infusoes">Infusões contínuas</span>}
            count={infusions.length}
            description={
              kg === null ? undefined : `Diluição da faixa ${WEIGHT_BAND_LABEL[weightBand(kg)]}.`
            }
          />
          {infusions.map((infusion) => (
            <PediatricInfusionCard key={infusion.id} infusion={infusion} kg={kg} defaultOpen />
          ))}
        </section>
      ) : null}

      <Link
        href="/ferramentas/pediatria"
        className="flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm text-foreground transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        Ver todas as doses e calculadoras
      </Link>
      <ContentProvenanceNote
        provenance={PEDIATRIC_DOSES_PROVENANCE}
        className="border-t border-border pt-4"
      />
    </Page>
  );
}
