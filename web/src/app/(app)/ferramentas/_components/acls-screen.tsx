'use client';

import { Heartbeat } from '@phosphor-icons/react';
import { ACLS_PROVENANCE } from '@clinical-tools/acls/content';
import { aclsElapsedSeconds, formatElapsed } from '@clinical-tools/acls/session';
import {
  AclsControlBar,
  AclsSettings,
  AdvancedAirwayToggle,
  CycleTimer,
  DiscardCodeButton,
  GuideAndNudges,
  MedicationList,
  RhythmPicker,
  ShockButton,
  WakeLockNote,
} from '@/components/domain/clinical-tools/acls/code-panel';
import { useAclsSession } from '@/components/domain/clinical-tools/acls/acls-session-provider';
import { RhythmCheckDialog } from '@/components/domain/clinical-tools/acls/rhythm-check-dialog';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from './tool-entries';

const TITLE = 'Parada cardiorrespiratória (ACLS)';

/**
 * /ferramentas/acls (CC-313): iniciar, escolher o ritmo e conduzir a parada.
 * O estado mora no AclsSessionProvider do AppShell; esta tela só mostra a
 * fase em que a parada está.
 */
export function AclsScreen() {
  const session = useAclsSession();
  const favorites = useToolFavorites();
  const { state } = session;
  const idle = state.status === 'idle';

  return (
    <Page width="narrow" className="gap-6">
      <PageHeader
        icon={idle ? Heartbeat : undefined}
        iconTone="blue"
        size={idle ? 'default' : 'compact'}
        title={TITLE}
        description={
          idle ? 'Ciclos de 2 min, epinefrina, choques, medicações e metrônomo.' : undefined
        }
        actions={<FavoriteButton favoriteKey="tool:acls" name={TITLE} favorites={favorites} />}
      />

      {idle ? <AclsStart /> : null}
      {state.status === 'running' && state.rhythm === null ? <RhythmPicker /> : null}
      {state.status === 'running' && state.rhythm !== null ? <AclsCode /> : null}
      {state.status === 'finished' ? <AclsFinished /> : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <ContentProvenanceNote provenance={ACLS_PROVENANCE} />
      </div>
    </Page>
  );
}

function AclsStart() {
  const { start } = useAclsSession();
  return (
    <div className="flex flex-col gap-4">
      <DecisionSupportNotice />
      <Button type="button" size="lg" onClick={start} className="min-h-16 w-full text-lg">
        Iniciar código
      </Button>
      <p className="text-sm text-muted-foreground">
        O ciclo, a epinefrina e o metrônomo continuam se você abrir outra ferramenta; uma faixa no
        topo leva de volta. Tudo fica só neste aparelho.
      </p>
    </div>
  );
}

function AclsCode() {
  return (
    <div className="flex flex-col gap-5">
      <AclsControlBar />
      <WakeLockNote />
      <CycleTimer />
      <GuideAndNudges />
      <ShockButton />
      <MedicationList />
      <AdvancedAirwayToggle />
      <AclsSettings />
      <DecisionSupportNotice />
      <DiscardCodeButton />
      <RhythmCheckDialog />
    </div>
  );
}

function AclsFinished() {
  const { state, now, discard } = useAclsSession();
  const rosc = state.outcome === 'rosc';
  return (
    <div className="flex flex-col gap-4">
      <Callout title={rosc ? 'RCE obtido' : 'Fim dos esforços'}>
        Tempo total de RCP: {formatElapsed(aclsElapsedSeconds(state, now))} · {state.cycleCount}{' '}
        ciclos · {state.shockCount} choques
      </Callout>
      <Button type="button" variant="outline" onClick={discard} className="min-h-12 self-start">
        Iniciar nova parada
      </Button>
    </div>
  );
}
