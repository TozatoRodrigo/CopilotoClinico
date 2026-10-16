'use client';

import { Calculator, Hourglass } from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { calculatorName } from '@clinical-tools/catalog';
import { getCalculator } from '@clinical-tools/registry';
import { CalculatorView } from '@/components/domain/clinical-tools/calculator-view';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from './tool-entries';

/**
 * Tela de uma calculadora (/ferramentas/calculadoras/[id]). As 75 do
 * catálogo têm rota; a que ainda não foi portada mostra "em breve" em vez de
 * quebrar.
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
      <CalculatorView definition={definition} />
    </Page>
  );
}
