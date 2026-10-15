'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Drop, Info } from '@phosphor-icons/react';
import { formatConcentration } from '@clinical-tools/infusions/dose';
import { getInfusionDrug } from '@clinical-tools/infusions/drugs';
import { HEPARIN_PROTOCOL } from '@clinical-tools/infusions/heparin';
import { INSULIN_PROTOCOL } from '@clinical-tools/infusions/insulin';
import {
  findInfusionItem,
  infusionHref,
  readInfusionParam,
  type InfusionItem,
} from '@clinical-tools/infusions/items';
import { validateWeight } from '@clinical-tools/ranges';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { readCustomDilution } from '@/lib/custom-dilutions';
import { useToolFavorites } from '@/lib/tool-favorites';
import {
  readToolSession,
  useToolSession,
  useToolWeight,
  writeToolSession,
} from '@/lib/tool-session';
import { FavoriteButton, ToolSearchField } from '../../_components/tool-entries';
import { DrugPanel } from './drug-panel';
import { HeparinPanel } from './heparin-panel';
import { InsulinPanel } from './insulin-panel';
import { InfusionList } from './infusion-list';
import {
  EMPTY_INFUSION_STATE,
  initialDrugState,
  parseInfusionScreenState,
  parseOpenItem,
  type DrugScreenState,
} from './infusion-state';

/** Item aberto por último nesta aba (sessão), para voltar a ele sem `?droga=`. */
const OPEN_ITEM_KEY = 'infusoes:aberta';

function describeItem(item: InfusionItem): string {
  switch (item.kind) {
    case 'heparina':
      return `Início por peso e ajuste por TTPa · ${HEPARIN_PROTOCOL.concentration} UI/mL`;
    case 'insulina':
      return `Tabela por glicemia · ${INSULIN_PROTOCOL.concentration} UI/mL`;
    case 'droga': {
      const drug = getInfusionDrug(item.id);
      return drug
        ? `${drug.doseUnit} · ${formatConcentration(drug.concentration)} ${drug.concentrationUnit}`
        : '';
    }
  }
}

/**
 * /ferramentas/infusoes (CC-311 e CC-312): peso, lista das 16 drogas e dos
 * protocolos de heparina e insulina, e a calculadora do item aberto. A droga aberta mora no endereço (`?droga=`, e o `?drug=`
 * dos links antigos do ANY), para Choque, TEP e Via aérea linkarem direto;
 * peso, dose e diluição ficam na sessão da aba e sobrevivem a ir e voltar.
 */
export function InfusionsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const favorites = useToolFavorites();
  const [weightRaw, setWeightRaw] = useToolWeight();
  const [initialWeight] = useState(weightRaw);
  const [screen, setScreen] = useToolSession(
    'infusoes',
    parseInfusionScreenState,
    () => EMPTY_INFUSION_STATE,
  );
  const [query, setQuery] = useState('');

  const selection = readInfusionParam(searchParams);
  const urlKey = searchParams.toString();
  // O endereço manda. Sem `?droga=` ao abrir a tela, volta ao item que estava
  // aberto nesta aba; o endereço é atualizado logo em seguida.
  const [restoreId, setRestoreId] = useState(() =>
    selection.requested === null ? readToolSession(OPEN_ITEM_KEY, parseOpenItem) : null,
  );
  // Escolha feita na tela enquanto o endereço ainda é o de antes (`replace`
  // não é síncrono); qualquer mudança de endereço passa a valer.
  const [pending, setPending] = useState<{ id: string | null; urlKey: string } | null>(null);
  const fromUrl = selection.item?.id ?? (selection.requested === null ? restoreId : null);
  const selectedId = pending && pending.urlKey === urlKey ? pending.id : fromUrl;
  const item = findInfusionItem(selectedId);
  const drug = item?.kind === 'droga' ? getInfusionDrug(item.id) : undefined;

  const needsWeight = !item || item.kind === 'heparina' || (drug?.usesWeight ?? false);
  const weight = validateWeight(weightRaw, 'adulto');
  const weightKg = weight.ok ? weight.value : null;

  // Endereço: o `?drug=` antigo vira `?droga=`, e o item restaurado da sessão
  // aparece no endereço (assim a volta do navegador e o link copiado batem).
  const waitingUrl = pending !== null && pending.urlKey === urlKey;
  useEffect(() => {
    if (waitingUrl) return;
    if (selection.item && selection.legacy) {
      router.replace(infusionHref(selection.item.id), { scroll: false });
    } else if (selection.requested === null && restoreId) {
      router.replace(infusionHref(restoreId), { scroll: false });
    }
  }, [router, waitingUrl, selection.item, selection.legacy, selection.requested, restoreId]);

  // Sessão: guarda o que está aberto, para a próxima volta à tela.
  useEffect(() => {
    writeToolSession(OPEN_ITEM_KEY, selectedId ?? null);
  }, [selectedId]);

  function select(id: string | null) {
    setQuery('');
    setRestoreId(null);
    setPending({ id, urlKey });
    router.replace(infusionHref(id));
  }

  function updateDrug(id: string, next: DrugScreenState) {
    setScreen((current) => ({ ...current, drugs: { ...current.drugs, [id]: next } }));
  }

  const weightField = (
    <div className="flex flex-col gap-1">
      <WeightField population="adulto" value={weightRaw} onValueChange={setWeightRaw} />
      {initialWeight !== '' && weightRaw === initialWeight ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          Peso mantido desta aba. Confira se é o do paciente atual.
        </p>
      ) : null}
    </div>
  );

  return (
    <Page width="narrow">
      <PageHeader
        icon={Drop}
        iconTone="blue"
        size="compact"
        title={item ? item.name : 'Infusões contínuas'}
        // Com um item aberto, o título já diz tudo: no celular, o resultado sobe.
        eyebrow={item ? 'Infusões contínuas' : undefined}
        description={
          item
            ? undefined
            : 'Drogas vasoativas, sedação, bloqueio, heparina e insulina: dose ↔ mL/h pelo peso e pela diluição.'
        }
        actions={
          <FavoriteButton
            favoriteKey="tool:infusoes"
            name="Infusões contínuas"
            favorites={favorites}
          />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        {/* Insulina, vasopressina e morfina não usam peso: o campo some para não confundir. */}
        {needsWeight ? weightField : null}
      </div>

      {item ? (
        <section aria-label={`Calculadora de ${item.name}`} className="flex flex-col gap-4">
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => select(null)}>
              <ArrowLeft aria-hidden="true" />
              Todas as drogas
            </Button>
          </div>
          {drug ? (
            <DrugPanel
              key={drug.id}
              drug={drug}
              state={screen.drugs[drug.id] ?? initialDrugState(drug, readCustomDilution(drug))}
              onChange={(next) => updateDrug(drug.id, next)}
              weightKg={weightKg}
            />
          ) : null}
          {item.kind === 'heparina' ? (
            <HeparinPanel
              state={screen.heparin}
              onChange={(heparin) => setScreen((current) => ({ ...current, heparin }))}
              weightKg={weightKg}
            />
          ) : null}
          {item.kind === 'insulina' ? (
            <InsulinPanel
              state={screen.insulin}
              onChange={(insulin) => setScreen((current) => ({ ...current, insulin }))}
            />
          ) : null}
        </section>
      ) : (
        <>
          {selection.requested !== null && !selection.item ? (
            <Callout tone="gray" icon={<Info />} title="Droga não encontrada">
              Não há “{selection.requested}” nas infusões. Escolha na lista abaixo.
            </Callout>
          ) : null}
          <ToolSearchField
            value={query}
            onChange={setQuery}
            label="Buscar droga por nome ou sinônimo"
            placeholder="Buscar droga (ex.: nora, precedex)"
          />
          <InfusionList query={query} onOpen={select} describe={describeItem} />
        </>
      )}
    </Page>
  );
}

/** Para o fallback do Suspense: o mesmo cabeçalho, sem o que depende do endereço. */
export function InfusionsScreenFallback() {
  return (
    <Page width="narrow">
      <PageHeader icon={Drop} iconTone="blue" size="compact" title="Infusões contínuas" />
      <DecisionSupportNotice />
    </Page>
  );
}
