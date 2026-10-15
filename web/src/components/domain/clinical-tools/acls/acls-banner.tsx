'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heartbeat } from '@phosphor-icons/react';
import { ACLS_METRONOME } from '@clinical-tools/acls/content';
import {
  aclsElapsedSeconds,
  formatElapsed,
  selectCycle,
  selectEpinephrineTimer,
} from '@clinical-tools/acls/session';
import { Button } from '@/components/ui/button';
import { useOptionalAclsSession } from './acls-session-provider';

export const ACLS_PATH = '/ferramentas/acls';

/**
 * Faixa global "Parada em andamento" (CC-313): fica abaixo da barra do topo
 * em qualquer tela enquanto a parada corre, com o tempo, o ciclo, o aviso de
 * checar ritmo e de epinefrina, o metrônomo e o caminho de volta. Na própria
 * tela do ACLS some, porque ela já mostra tudo isso.
 */
export function AclsBanner() {
  const session = useOptionalAclsSession();
  const pathname = usePathname();
  if (!session || session.state.status !== 'running' || pathname === ACLS_PATH) return null;

  const { state, now, metronomeOn, toggleMetronome } = session;
  const cycle = selectCycle(state, now);
  const epinephrineDue = selectEpinephrineTimer(state, now)?.due ?? false;
  const cycleText =
    cycle.phase === 'running'
      ? `Ciclo ${cycle.number} · ${formatElapsed(cycle.remainingSeconds)}`
      : cycle.phase === 'awaiting-rhythm-check'
        ? 'Checar ritmo'
        : 'Escolha o ritmo inicial';
  // Só o que pede ação é anunciado pelo leitor de tela; o relógio não.
  const announcement = [
    cycle.phase === 'awaiting-rhythm-check' ? 'Checar ritmo.' : '',
    epinephrineDue ? 'Considere epinefrina.' : '',
  ].join(' ');

  return (
    <section
      aria-label="Parada em andamento"
      data-slot="acls-banner"
      className="sticky top-11 z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-tone-red-bg px-4 py-2 text-sm text-tone-red-ink md:px-6"
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <Heartbeat className="size-4 shrink-0 text-tone-red" weight="fill" aria-hidden="true" />
        <span className="font-semibold">Parada em andamento</span>
        <span className="tabular-nums">{formatElapsed(aclsElapsedSeconds(state, now))}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{cycleText}</span>
        {epinephrineDue ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-semibold">Considere epinefrina</span>
          </>
        ) : null}
        {metronomeOn ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Metrônomo {ACLS_METRONOME.compressionsPerMinute}/min</span>
          </>
        ) : null}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement.trim()}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {metronomeOn ? (
          <Button type="button" size="sm" variant="outline" onClick={() => toggleMetronome()}>
            Parar metrônomo
          </Button>
        ) : null}
        <Button asChild size="sm">
          <Link href={ACLS_PATH}>Voltar à parada</Link>
        </Button>
      </span>
    </section>
  );
}
