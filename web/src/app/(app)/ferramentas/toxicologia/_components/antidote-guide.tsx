'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Info, WarningCircle } from '@phosphor-icons/react';
import type { Antidote } from '@clinical-tools/toxicology/antidotes';
import { searchAntidotes } from '@clinical-tools/toxicology/search';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { SectionHeader } from '@/components/layout/page-header';
import { ToolSearchField } from '../../_components/tool-entries';
import { AtropineCalculator, NacCalculators } from './antidote-calculators';
import { useLocationHash } from './use-location-hash';

function AntidoteCard({ antidote, open }: { antidote: Antidote; open: boolean }) {
  return (
    <li id={antidote.id} className="scroll-mt-16 border-b border-border py-1 last:border-0">
      <Disclosure
        defaultOpen={open}
        className="[&>button]:min-h-12"
        title={
          <span className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[0.9375rem] font-semibold">{antidote.name}</span>
              {antidote.available ? null : <Badge variant="gray">Não disponível</Badge>}
            </span>
            <span className="text-[0.8125rem] font-normal text-muted-foreground">
              {antidote.indication}
            </span>
          </span>
        }
      >
        <div className="flex flex-col gap-3 pt-1">
          {antidote.sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-0.5">
              <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
              <ul className="flex flex-col gap-0.5 text-[0.9375rem] text-foreground">
                {section.lines.map((line) => (
                  <li key={line} className="text-pretty">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {antidote.warnings.map((warning) => (
            <Callout key={warning} tone="red" icon={<WarningCircle />}>
              {warning}
            </Callout>
          ))}
          {antidote.infos.map((info) => (
            <Callout key={info} tone="gray" icon={<Info />}>
              {info}
            </Callout>
          ))}
          {antidote.calculator === 'nac' ? <NacCalculators /> : null}
          {antidote.calculator === 'atropina' ? <AtropineCalculator /> : null}
        </div>
      </Disclosure>
    </li>
  );
}

/**
 * Guia de antídotos (CC-323): busca por antídoto, intoxicação ou nome
 * comercial; disponíveis primeiro. NAC traz o nomograma e as três etapas por
 * peso; atropina, a infusão de manutenção. `#id` no endereço abre o card.
 */
export function AntidoteGuide() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchAntidotes(deferredQuery), [deferredQuery]);
  const hash = useLocationHash();
  const available = results.filter(({ available: isAvailable }) => isAvailable);
  const unavailable = results.filter(({ available: isAvailable }) => !isAvailable);

  const group = (title: string, id: string, antidotes: readonly Antidote[]) =>
    antidotes.length > 0 ? (
      <section aria-labelledby={id} className="flex flex-col gap-1">
        <SectionHeader
          title={<span id={id}>{title}</span>}
          count={antidotes.length}
          className="border-b border-border pb-1.5"
        />
        <ul className="flex flex-col">
          {antidotes.map((antidote) => (
            // A chave muda quando o endereço aponta para o card: remonta já aberto.
            <AntidoteCard
              key={`${antidote.id}:${hash === antidote.id}`}
              antidote={antidote}
              open={hash === antidote.id}
            />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <ToolSearchField
        value={query}
        onChange={setQuery}
        label="Buscar antídoto ou indicação"
        placeholder="Buscar (ex.: paracetamol, organofosforado)"
      />
      {results.length === 0 ? (
        <p className="px-2 py-6 text-sm text-muted-foreground">
          Nenhum antídoto encontrado para “{deferredQuery.trim()}”.
        </p>
      ) : null}
      {group('Disponíveis', 'antidotos-disponiveis', available)}
      {group('Não disponíveis', 'antidotos-indisponiveis', unavailable)}
    </div>
  );
}
