'use client';

import Link from 'next/link';
import { ArrowSquareOut, Calculator, Hourglass } from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { calculatorName, calculatorPathway } from '@clinical-tools/catalog';
import { toolHref } from '@clinical-tools/links';
import { getCalculator } from '@clinical-tools/registry';
import { CalculatorView } from '@/components/domain/clinical-tools/calculator-view';
import { Button } from '@/components/ui/button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from './tool-entries';

/**
 * Tela de uma calculadora (/ferramentas/calculadoras/[id]). As 75 do
 * catálogo têm rota; a que ainda não foi portada mostra "em breve" em vez de
 * quebrar. A que também existe num roteiro do ANY (CIWA-Ar, VTI) ganha o
 * link "Abrir no roteiro" só quando o roteiro já abre no Copiloto (CC-306).
 */
export function CalculatorScreen({ id }: { id: string }) {
  const favorites = useToolFavorites();
  const entry = CALCULATOR_CATALOG.find((calculator) => calculator.id === id);
  const definition = getCalculator(id);

  if (!entry || !definition) {
    return (
      <Page width="narrow">
        <PageHeader
          icon={Calculator}
          iconTone="gray"
          title={entry ? calculatorName(entry) : 'Calculadora'}
          description={entry?.category}
        />
        <DecisionSupportNotice />
        <EmptyState
          icon={<Hourglass />}
          title="Em breve"
          description="Esta calculadora do ANY ainda não foi portada para o Copiloto."
          actionLabel="Ver calculadoras disponíveis"
          actionHref="/ferramentas/calculadoras"
        />
      </Page>
    );
  }

  const pathway = calculatorPathway(definition);
  // Abre o roteiro no lugar da calculadora e oferece a volta, com as respostas
  // guardadas na sessão da aba (CC-331).
  const pathwayHref = pathway
    ? toolHref(pathway.id, {
        from: { calculator: definition.id },
        query: definition.pathway?.query,
      })
    : null;
  return (
    <Page width="narrow">
      <PageHeader
        icon={Calculator}
        iconTone="blue"
        title={definition.name}
        description={definition.description}
        actions={
          <FavoriteButton
            favoriteKey={`calc:${definition.id}`}
            name={definition.name}
            favorites={favorites}
          />
        }
      />
      {pathway && pathwayHref ? (
        <Button asChild variant="outline" className="h-11 self-start">
          <Link href={pathwayHref}>
            <ArrowSquareOut aria-hidden="true" />
            Abrir no roteiro: {pathway.name}
          </Link>
        </Button>
      ) : null}
      <CalculatorView key={definition.id} definition={definition} />
    </Page>
  );
}
