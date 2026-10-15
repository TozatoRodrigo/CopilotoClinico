'use client';

import { ArrowCounterClockwise, ClockCounterClockwise, Heartbeat } from '@phosphor-icons/react';
import {
  UNDIFFERENTIATED_SHOCK_PROVENANCE,
  UNDIFFERENTIATED_SHOCK_REFERENCES,
} from '@clinical-tools/shock/sources';
import {
  INITIAL_UNDIFFERENTIATED_STATE,
  parseUndifferentiatedShockState,
  UNDIFFERENTIATED_TABS,
  undifferentiatedShockReducer,
  type UndifferentiatedShockState,
  type UndifferentiatedTab,
} from '@clinical-tools/shock/undifferentiated';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToolFavorites } from '@/lib/tool-favorites';
import { useToolSessionReducer } from '@/lib/tool-session';
import { formatClock } from '../../_components/shock/format-time';
import { ShockReferences } from '../../_components/shock/shock-references';
import { FavoriteButton } from '../../_components/tool-entries';
import { PerfusionPanel, VneriPanel } from './standalone-panels';
import { VtiAlgorithm } from './vti-algorithm';

/** Chave na sessão da aba (copiloto:ferramentas:sessao:choque-indiferenciado). */
export const UNDIFFERENTIATED_SESSION_KEY = 'choque-indiferenciado';

function isTab(value: string): value is UndifferentiatedTab {
  return UNDIFFERENTIATED_TABS.some(({ id }) => id === value);
}

/** Nada digitado nem respondido (a aba aberta não conta). */
function isPristine(state: UndifferentiatedShockState): boolean {
  return (
    JSON.stringify({ ...state, tab: INITIAL_UNDIFFERENTIATED_STATE.tab }) ===
    JSON.stringify(INITIAL_UNDIFFERENTIATED_STATE)
  );
}

/**
 * /ferramentas/choque-indiferenciado — VTI, VNERi e gap CO2 × SvcO2 (CC-317).
 * Três abas, como os atalhos do ShockPath do ANY; o estado fica na sessão da
 * aba para sobreviver à ida às Infusões.
 */
export function UndifferentiatedShockScreen() {
  const favorites = useToolFavorites();
  const { state, dispatch, restoredAt, dismissRestored } = useToolSessionReducer(
    UNDIFFERENTIATED_SESSION_KEY,
    undifferentiatedShockReducer,
    parseUndifferentiatedShockState,
    INITIAL_UNDIFFERENTIATED_STATE,
  );

  function restart() {
    dispatch({ type: 'recomecar' });
    dismissRestored();
  }

  return (
    <Page width="narrow">
      <PageHeader
        icon={Heartbeat}
        iconTone="blue"
        title="Choque indiferenciado"
        description="VTI, VNERi e gap CO2 × SvcO2 para separar os tipos de choque."
        actions={
          <FavoriteButton
            favoriteKey="tool:choque-indiferenciado"
            name="Choque indiferenciado"
            favorites={favorites}
          />
        }
      />

      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        {restoredAt !== null && !isPristine(state) ? (
          <Callout
            tone="gray"
            icon={<ClockCounterClockwise />}
            title="Avaliação retomada nesta aba"
            action={
              <Button type="button" variant="outline" onClick={restart}>
                <ArrowCounterClockwise aria-hidden="true" />
                Recomeçar
              </Button>
            }
          >
            Última alteração às {formatClock(restoredAt)}. Se for outro paciente, recomece.
          </Callout>
        ) : null}
      </div>

      <Tabs
        value={state.tab}
        onValueChange={(value) => {
          if (isTab(value)) dispatch({ type: 'aba', tab: value });
        }}
      >
        <TabsList aria-label="Ferramentas do choque indiferenciado">
          {UNDIFFERENTIATED_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="vti" className="pt-3">
          <VtiAlgorithm
            state={state.vti}
            dispatch={(action) => dispatch({ type: 'vti', action })}
          />
        </TabsContent>
        <TabsContent value="vneri" className="pt-3">
          <VneriPanel
            values={state.vneri}
            onChange={(field, raw) => dispatch({ type: 'vneri', field, raw })}
          />
        </TabsContent>
        <TabsContent value="gap" className="pt-3">
          <PerfusionPanel
            values={state.perfusion}
            onChange={(field, raw) => dispatch({ type: 'perfusao', field, raw })}
          />
        </TabsContent>
      </Tabs>

      <ShockReferences
        references={UNDIFFERENTIATED_SHOCK_REFERENCES}
        provenance={UNDIFFERENTIATED_SHOCK_PROVENANCE}
      />
    </Page>
  );
}
