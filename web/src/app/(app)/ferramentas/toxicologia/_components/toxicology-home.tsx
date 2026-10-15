'use client';

import Link from 'next/link';
import { CaretRight, Phone, Skull } from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { TOOLS } from '@clinical-tools/catalog';
import { CIATOX_GO, DISQUE_INTOXICACAO, telHref } from '@clinical-tools/toxicology/ciatox';
import { TOX_MODULES, toxModuleHref } from '@clinical-tools/toxicology/modules';
import { TOX_PATH_PROVENANCE } from '@clinical-tools/toxicology/provenance';
import { Button } from '@/components/ui/button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useToolFavorites } from '@/lib/tool-favorites';
import { CalculatorRow, FavoriteButton } from '../../_components/tool-entries';

const TOOL = TOOLS.find(({ id }) => id === 'toxicologia');
/** Calculadoras da categoria Toxicologia do ANY (CIWA-Ar, Rumack-Matthew…), que no ANY ficavam fora do roteiro. */
const TOX_CALCULATORS = CALCULATOR_CATALOG.filter(({ category }) => category === 'Toxicologia');

/**
 * /ferramentas/toxicologia — tela inicial do roteiro (CC-323): o
 * Disque-Intoxicação em destaque, as seções do ToxPath do ANY e as
 * calculadoras de toxicologia.
 */
export function ToxicologyHome() {
  const favorites = useToolFavorites();
  const name = TOOL?.name ?? 'Intoxicações e antídotos';
  return (
    <Page width="narrow">
      <PageHeader
        icon={Skull}
        iconTone="blue"
        title={name}
        description="Manejo de intoxicações agudas: toxíndrome, descontaminação, antídotos e destino."
        actions={
          <FavoriteButton favoriteKey="tool:toxicologia" name={name} favorites={favorites} />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <section
          aria-labelledby="disque-intoxicacao"
          className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <h2 id="disque-intoxicacao" className="text-base font-semibold text-foreground">
              {DISQUE_INTOXICACAO.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {DISQUE_INTOXICACAO.description}. Toque para ligar.
            </p>
          </div>
          <Button asChild size="lg" className="h-12 text-base">
            <a href={telHref(DISQUE_INTOXICACAO)}>
              <Phone aria-hidden="true" />
              {DISQUE_INTOXICACAO.phone}
            </a>
          </Button>
        </section>
      </div>

      <section aria-labelledby="tox-secoes" className="flex flex-col gap-2">
        <SectionHeader
          title={<span id="tox-secoes">Seções</span>}
          className="border-b border-border pb-1.5"
        />
        <ul className="flex flex-col">
          {TOX_MODULES.map((section) => (
            <li key={section.id}>
              <Link
                href={toxModuleHref(section.id)}
                className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{section.title}</span>
                  <span className="block text-xs text-muted-foreground">{section.subtitle}</span>
                </span>
                <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tox-calculadoras" className="flex flex-col gap-2">
        <SectionHeader
          title={<span id="tox-calculadoras">Calculadoras de toxicologia</span>}
          count={TOX_CALCULATORS.length}
          className="border-b border-border pb-1.5"
        />
        <ul className="flex flex-col">
          {TOX_CALCULATORS.map((entry) => (
            <CalculatorRow key={entry.id} calculator={entry} favorites={favorites} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="tox-contatos" className="flex flex-col gap-2">
        <SectionHeader
          title={<span id="tox-contatos">Outros contatos</span>}
          className="border-b border-border pb-1.5"
        />
        <a
          href={telHref(CIATOX_GO)}
          className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <Phone className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground tabular-nums">
              {CIATOX_GO.phone}
            </span>
            <span className="block text-xs text-muted-foreground">{CIATOX_GO.name}</span>
          </span>
        </a>
      </section>

      <ContentProvenanceNote provenance={TOX_PATH_PROVENANCE} />
    </Page>
  );
}
