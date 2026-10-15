'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Toolbox } from '@phosphor-icons/react';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { calculatorStatus, searchTools, TOOL_GROUPS, TOOLS } from '@clinical-tools/catalog';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useToolFavorites, type FavoriteKey } from '@/lib/tool-favorites';
import {
  CalculatorRow,
  GROUP_ICON,
  SearchResultRow,
  ToolRow,
  ToolSearchField,
} from './_components/tool-entries';

const CATALOG_BY_ID = new Map(CALCULATOR_CATALOG.map((entry) => [entry.id, entry]));
const TOOLS_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));
/**
 * Calculadoras em destaque no grupo Calculadoras do hub: as cinco da fundação
 * (CC-303). Com as 75 no ar, listar todas aqui empurraria os roteiros para
 * baixo; a lista completa fica em /ferramentas/calculadoras, e as do dia a dia
 * de cada médico ficam nos favoritos.
 */
const FEATURED_CALCULATORS = ['chadsvasc', 'has-bled', 'qsofa', 'curb65', 'shock-index'].flatMap(
  (id) => {
    const entry = CATALOG_BY_ID.get(id);
    return entry && calculatorStatus(entry) === 'disponivel' ? [entry] : [];
  },
);

/**
 * /ferramentas — hub das ferramentas de beira-leito (CC-304, ADR-017).
 * Celular primeiro: busca no topo, favoritos logo abaixo e os grupos em
 * lista, para qualquer ferramenta abrir em dois toques a partir da barra
 * inferior.
 */
export default function FerramentasPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchTools(deferredQuery), [deferredQuery]);
  const favorites = useToolFavorites();
  const searching = deferredQuery.trim() !== '';

  // Favorito que deixou de existir (ou voltou a "em breve") some da lista sem quebrar.
  const favoriteRows = favorites.favorites.flatMap((key: FavoriteKey) => {
    const [kind, id = ''] = key.split(':');
    if (kind === 'calc') {
      const entry = CATALOG_BY_ID.get(id);
      return entry && calculatorStatus(entry) === 'disponivel'
        ? [<CalculatorRow key={key} calculator={entry} favorites={favorites} showCategory />]
        : [];
    }
    const tool = TOOLS_BY_ID.get(id);
    return tool?.status === 'disponivel'
      ? [<ToolRow key={key} tool={tool} favorites={favorites} />]
      : [];
  });

  return (
    <Page width="narrow">
      <PageHeader
        icon={Toolbox}
        iconTone="blue"
        title="Ferramentas"
        description="Calculadoras, doses e roteiros de beira-leito. A conta é feita no aparelho."
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <ToolSearchField
          value={query}
          onChange={setQuery}
          label="Buscar ferramenta por nome ou sinônimo"
          placeholder="Buscar (ex.: sepse, CHA2DS2)"
        />
      </div>

      {searching ? (
        <section aria-label="Resultados da busca" className="flex flex-col gap-2">
          <SectionHeader title="Resultados" count={results.length} as="h2" />
          {results.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Nada encontrado para “{deferredQuery.trim()}”.
            </p>
          ) : (
            <ul className="flex flex-col">
              {results.map((result) => (
                <SearchResultRow
                  key={
                    result.kind === 'tool'
                      ? `tool:${result.tool.id}`
                      : `calc:${result.calculator.id}`
                  }
                  result={result}
                  favorites={favorites}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {favoriteRows.length > 0 ? (
            <section aria-labelledby="ferramentas-favoritos" className="flex flex-col gap-2">
              <SectionHeader
                title={<span id="ferramentas-favoritos">Favoritos</span>}
                count={favoriteRows.length}
              />
              <ul className="flex flex-col">{favoriteRows}</ul>
            </section>
          ) : null}

          {TOOL_GROUPS.map((group) => {
            const Icon = GROUP_ICON[group.id];
            const tools = TOOLS.filter((tool) => tool.group === group.id);
            const headingId = `ferramentas-grupo-${group.id}`;
            return (
              <section key={group.id} aria-labelledby={headingId} className="flex flex-col gap-2">
                <SectionHeader
                  title={
                    <span id={headingId} className="flex items-center gap-2">
                      <Icon className="size-[18px] text-muted-foreground" aria-hidden="true" />
                      {group.label}
                    </span>
                  }
                  className="border-b border-border pb-1.5"
                />
                <ul className="flex flex-col">
                  {group.id === 'calculadoras' ? (
                    <>
                      {tools
                        .filter((tool) => tool.id === 'calculadoras')
                        .map((tool) => (
                          <ToolRow key={tool.id} tool={tool} favorites={favorites} />
                        ))}
                      {FEATURED_CALCULATORS.map((entry) => (
                        <CalculatorRow key={entry.id} calculator={entry} favorites={favorites} />
                      ))}
                      {tools
                        .filter((tool) => tool.id !== 'calculadoras')
                        .map((tool) => (
                          <ToolRow key={tool.id} tool={tool} favorites={favorites} />
                        ))}
                    </>
                  ) : (
                    tools.map((tool) => <ToolRow key={tool.id} tool={tool} favorites={favorites} />)
                  )}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </Page>
  );
}
