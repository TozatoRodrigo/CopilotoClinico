'use client';

import Link from 'next/link';
import { ClockCounterClockwise, Heartbeat, Wind } from '@phosphor-icons/react';
import { ACLS_PROVENANCE } from '@clinical-tools/acls/content';
import { OVACE_SUBTITLE } from '@clinical-tools/acls/ovace';
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
import {
  AclsOutcome,
  ReversibleCausesSection,
} from '@/components/domain/clinical-tools/acls/post-arrest';
import { RhythmCheckDialog } from '@/components/domain/clinical-tools/acls/rhythm-check-dialog';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from './tool-entries';

const TITLE = 'Parada cardiorrespiratória (ACLS)';

/**
 * /ferramentas/acls (CC-313 e CC-314): iniciar, escolher o ritmo, conduzir a
 * parada e, no fim, o checklist pós-RCE e o relatório. O estado mora no
 * AclsSessionProvider do AppShell; esta tela só mostra a fase em que a parada
 * está.
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
      <ul className="flex flex-col">
        <StartLink
          href="/ferramentas/acls/ovace"
          icon={<Wind className="size-5" aria-hidden="true" />}
          title="OVACE"
          description={OVACE_SUBTITLE}
        />
        <StartLink
          href="/ferramentas/acls/historico"
          icon={<ClockCounterClockwise className="size-5" aria-hidden="true" />}
          title="Atendimentos salvos"
          description="Relatórios das paradas anteriores, guardados neste aparelho."
        />
      </ul>
    </div>
  );
}

function StartLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
      </Link>
    </li>
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
      <ReversibleCausesSection />
      <AclsSettings />
      <DecisionSupportNotice />
      <DiscardCodeButton />
      <RhythmCheckDialog />
    </div>
  );
}

function AclsFinished() {
  const { discard } = useAclsSession();
  return (
    <div className="flex flex-col gap-6">
      <AclsOutcome />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={discard} className="min-h-12">
          Iniciar nova parada
        </Button>
        <Button asChild variant="outline" className="min-h-12">
          <Link href="/ferramentas/acls/historico">Atendimentos salvos</Link>
        </Button>
      </div>
    </div>
  );
}
