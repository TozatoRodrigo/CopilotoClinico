'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Calculator } from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { CALCULATOR_CATEGORIES, calculatorStatus, searchTools } from '@clinical-tools/catalog';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useToolFavorites, type FavoriteKey } from '@/lib/tool-favorites';
import { CalculatorRow, ToolSearchField } from '../_components/tool-entries';

const AVAILABLE = CALCULATOR_CATALOG.filter(
  (entry) => calculatorStatus(entry) === 'disponivel',
).length;
const CATALOG_BY_ID = new Map(CALCULATOR_CATALOG.map((entry) => [entry.id, entry]));

const DESCRIPTION =
  AVAILABLE === CALCULATOR_CATALOG.length
    ? `${AVAILABLE} escores, fórmulas e classificações do ANY, com resultado ao vivo.`
    : `Escores e fórmulas do ANY com resultado ao vivo. ${AVAILABLE} de ${CALCULATOR_CATALOG.length} já disponíveis; as demais chegam nas próximas versões.`;

/**
 * /ferramentas/calculadoras — as 75 calculadoras do ANY por categoria, com
 * busca por nome e sinônimo e os favoritos no topo (CC-306). As já portadas
 * abrem; as demais aparecem como "em breve".
 */
export default function CalculadorasPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const favorites = useToolFavorites();
  const results = useMemo(
    () =>
      searchTools(deferredQuery).flatMap((result) =>
        result.kind === 'calculator' ? [result.calculator] : [],
      ),
    [deferredQuery],
  );
  const searching = deferredQuery.trim() !== '';
  // Só as calculadoras favoritas que abrem; as ferramentas favoritas ficam no hub.
  const favoriteEntries = favorites.favorites.flatMap((key: FavoriteKey) => {
    const [kind, id = ''] = key.split(':');
    const entry = kind === 'calc' ? CATALOG_BY_ID.get(id) : undefined;
    return entry && calculatorStatus(entry) === 'disponivel' ? [entry] : [];
  });

  return (
    <Page width="narrow">
      <PageHeader
        icon={Calculator}
        iconTone="blue"
        title="Calculadoras"
        description={DESCRIPTION}
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <ToolSearchField
          value={query}
          onChange={setQuery}
          label="Buscar calculadora por nome ou sinônimo"
          placeholder="Buscar (ex.: pneumonia, FA)"
        />
      </div>

      {searching ? (
        <section aria-label="Resultados da busca" className="flex flex-col gap-2">
          <SectionHeader title="Resultados" count={results.length} />
          {results.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Nenhuma calculadora encontrada para “{deferredQuery.trim()}”.
            </p>
          ) : (
            <ul className="flex flex-col">
              {results.map((entry) => (
                <CalculatorRow
                  key={entry.id}
                  calculator={entry}
                  favorites={favorites}
                  showCategory
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {favoriteEntries.length > 0 ? (
            <section aria-labelledby="calculadoras-favoritas" className="flex flex-col gap-2">
              <SectionHeader
                title={<span id="calculadoras-favoritas">Favoritas</span>}
                count={favoriteEntries.length}
                className="border-b border-border pb-1.5"
              />
              <ul className="flex flex-col">
                {favoriteEntries.map((entry) => (
                  <CalculatorRow
                    key={entry.id}
                    calculator={entry}
                    favorites={favorites}
                    showCategory
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {CALCULATOR_CATEGORIES.map((category) => {
            const entries = CALCULATOR_CATALOG.filter((entry) => entry.category === category);
            return (
              <section key={category} aria-label={category} className="flex flex-col gap-2">
                <SectionHeader
                  title={category}
                  count={entries.length}
                  className="border-b border-border pb-1.5"
                />
                <ul className="flex flex-col">
                  {entries.map((entry) => (
                    <CalculatorRow key={entry.id} calculator={entry} favorites={favorites} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </Page>
  );
}
