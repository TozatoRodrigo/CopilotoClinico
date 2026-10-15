'use client';

import { useId, useState } from 'react';
import { Lightning, Metronome, Pause, Play, Plus, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  ACLS_MEDICATION_GROUPS,
  ACLS_MEDICATIONS,
  ACLS_METRONOME,
  ACLS_RHYTHMS,
  COMPRESSION_FRACTION_TARGET_PERCENT,
  EPINEPHRINE_INTERVALS_SECONDS,
  RHYTHM_CONTENT,
  type AclsMedication,
} from '@clinical-tools/acls/content';
import {
  aclsElapsedSeconds,
  formatElapsed,
  selectCompressionFraction,
  selectCycle,
  selectEpinephrineTimer,
  selectGuide,
  selectNudges,
} from '@clinical-tools/acls/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Disclosure } from '@/components/ui/disclosure';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAclsSession } from './acls-session-provider';

/**
 * Tela da parada em curso (CC-313): tudo vem dos seletores do motor com o
 * `now` do provider; aqui só se desenha e se despacha.
 */

/** Barra fixa no topo da tela da parada: tempo total, FCT, pausa e metrônomo. */
export function AclsControlBar() {
  const { state, now, metronomeOn, toggleMetronome, toggleCompressionPause } = useAclsSession();
  const fraction = selectCompressionFraction(state, now);
  const belowTarget = fraction !== null && fraction < COMPRESSION_FRACTION_TARGET_PERCENT;
  const paused = state.pauseStartedAt !== null;

  return (
    <div
      data-slot="acls-control-bar"
      className="sticky top-11 z-20 -mx-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:rounded-lg sm:border sm:px-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-lg font-semibold text-foreground tabular-nums">
            {formatElapsed(aclsElapsedSeconds(state, now))}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            FCT{belowTarget ? ` · meta > ${COMPRESSION_FRACTION_TARGET_PERCENT}%` : ''}
          </span>
          <span
            className={cn(
              'text-lg font-semibold tabular-nums',
              belowTarget ? 'text-tone-orange' : 'text-foreground',
            )}
          >
            {fraction === null ? '--' : `${fraction}%`}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        aria-pressed={paused}
        onClick={toggleCompressionPause}
        className={cn(
          'min-h-11',
          paused && 'border-tone-orange bg-tone-orange-bg text-tone-orange-ink',
        )}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        {paused ? 'Retomar' : 'Pausa'}
      </Button>
      <Button
        type="button"
        variant={metronomeOn ? 'default' : 'outline'}
        aria-pressed={metronomeOn}
        onClick={() => {
          if (!toggleMetronome())
            toast.info('Este navegador não toca áudio: metrônomo indisponível.');
        }}
        className="min-h-11"
      >
        <Metronome aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Metrônomo </span>
        {ACLS_METRONOME.compressionsPerMinute}/min
      </Button>
    </div>
  );
}

/** Contagem regressiva do ciclo de 2 min. */
export function CycleTimer() {
  const { state, now } = useAclsSession();
  const cycle = selectCycle(state, now);
  if (cycle.phase !== 'running' && cycle.phase !== 'awaiting-rhythm-check') return null;
  const remaining = cycle.phase === 'running' ? cycle.remainingSeconds : 0;
  const ending = remaining <= 10;

  return (
    <section
      aria-label="Ciclo de RCP"
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border px-4 py-4',
        ending ? 'border-tone-orange bg-tone-orange-bg' : 'border-border',
      )}
    >
      <span className="text-sm text-muted-foreground">Ciclo {cycle.number} de RCP</span>
      <span
        className={cn(
          'text-6xl leading-none font-semibold tabular-nums',
          ending ? 'text-tone-orange-ink' : 'text-foreground',
        )}
      >
        {formatElapsed(remaining)}
      </span>
      <Progress
        value={cycle.phase === 'running' ? cycle.remainingFraction * 100 : 0}
        aria-label="Tempo restante do ciclo"
        className="mt-1 h-1.5"
      />
      <div className="mt-1 flex gap-6 text-sm text-muted-foreground">
        <span>
          Ciclos <strong className="text-foreground tabular-nums">{state.cycleCount}</strong>
        </span>
        <span>
          Choques <strong className="text-foreground tabular-nums">{state.shockCount}</strong>
        </span>
      </div>
    </section>
  );
}

/** Card "Agora" e os lembretes (no máximo 2). */
export function GuideAndNudges() {
  const { state, now } = useAclsSession();
  const guide = selectGuide(state);
  const nudges = selectNudges(state, now);
  return (
    <div className="flex flex-col gap-2">
      <Callout tone={guide.kind === 'alert' ? 'orange' : 'blue'} title={guide.text}>
        <span className="sr-only">Agora: </span>
        {guide.detail}
      </Callout>
      {nudges.length > 0 ? (
        <ul aria-label="Lembretes" className="flex flex-col gap-2">
          {nudges.map((nudge) => (
            <li
              key={nudge.id}
              className={cn(
                'rounded-md px-4 py-2.5 text-sm',
                nudge.urgent
                  ? 'bg-tone-red-bg font-medium text-tone-red-ink'
                  : 'bg-tone-orange-bg text-tone-orange-ink',
              )}
            >
              {nudge.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ShockButton() {
  const { state, registerShock } = useAclsSession();
  if (state.rhythm !== 'shockable') return null;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={registerShock}
      className="min-h-14 w-full text-base font-semibold"
    >
      <Lightning className="size-5 text-tone-red" weight="fill" aria-hidden="true" />
      Registrar choque
      {state.shockCount > 0 ? (
        <>
          {' '}
          <span className="text-muted-foreground tabular-nums">· {state.shockCount} até agora</span>
        </>
      ) : null}
    </Button>
  );
}

function EpinephrineTimer() {
  const { state, now } = useAclsSession();
  const timer = selectEpinephrineTimer(state, now);
  if (!timer) return null;
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md px-3 py-2 text-sm',
        timer.due
          ? 'bg-tone-red-bg font-medium text-tone-red-ink'
          : 'bg-surface-subtle text-muted-foreground',
      )}
    >
      <span className="tabular-nums">
        {timer.due
          ? 'Considere epinefrina agora'
          : `Próxima epinefrina em ${formatElapsed(Math.max(0, timer.remainingSeconds))}`}
      </span>
      <Progress value={timer.progress * 100} aria-label="Intervalo da epinefrina" />
    </div>
  );
}

function MedicationButton({ medication }: { medication: AclsMedication }) {
  const { state, registerMedication } = useAclsSession();
  const count = state.medicationCounts[medication.id] ?? 0;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => registerMedication(medication.id)}
      aria-label={`Registrar ${medication.name}${count > 0 ? ` (${count} registrada${count > 1 ? 's' : ''})` : ''}`}
      className="h-auto min-h-12 w-full justify-between gap-3 py-2 text-left whitespace-normal max-sm:h-auto"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[0.9375rem] font-medium text-foreground">{medication.name}</span>
        <span className="text-xs font-normal text-muted-foreground">{medication.hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {count > 0 ? <Badge variant="success">{count}×</Badge> : null}
        <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Button>
  );
}

/** As 7 medicações do ANY por grupo; a barra da epinefrina fica logo abaixo dela. */
export function MedicationList() {
  return (
    <section aria-labelledby="acls-medicacoes" className="flex flex-col gap-3">
      <h2 id="acls-medicacoes" className="text-base font-semibold text-foreground">
        Medicações
      </h2>
      {ACLS_MEDICATION_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">{group.label}</h3>
          {ACLS_MEDICATIONS.filter((medication) => medication.group === group.id).map(
            (medication) => (
              <div key={medication.id} className="flex flex-col gap-2">
                <MedicationButton medication={medication} />
                {medication.id === 'epinefrina' ? <EpinephrineTimer /> : null}
              </div>
            ),
          )}
        </div>
      ))}
    </section>
  );
}

export function AdvancedAirwayToggle() {
  const { state, setAdvancedAirway } = useAclsSession();
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40">
      <span className="flex flex-col">
        <span className="font-medium text-foreground">Via aérea avançada</span>
        <span className="text-xs text-muted-foreground">
          Com o metrônomo ligado, soma o bipe de ventilação a cada{' '}
          {ACLS_METRONOME.ventilationIntervalSeconds} s.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={state.advancedAirway}
        onChange={(event) => setAdvancedAirway(event.target.checked)}
        className="size-5 shrink-0 accent-primary"
      />
    </label>
  );
}

export function AclsSettings() {
  const { state, setEpinephrineInterval } = useAclsSession();
  const name = useId();
  return (
    <Disclosure title="Configurações">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-foreground">
          Intervalo da epinefrina
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {EPINEPHRINE_INTERVALS_SECONDS.map((seconds) => {
            const checked = state.epinephrineIntervalSeconds === seconds;
            return (
              <label
                key={seconds}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                  checked
                    ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                    : 'border-border text-foreground hover:bg-hover',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  checked={checked}
                  onChange={() => setEpinephrineInterval(seconds)}
                  className="size-4 accent-primary"
                />
                {seconds / 60} min{seconds === 240 ? ' (sugerido)' : ''}
              </label>
            );
          })}
        </div>
      </fieldset>
    </Disclosure>
  );
}

/** Aviso discreto quando o navegador não segura a tela acesa. */
export function WakeLockNote() {
  const { wakeLock } = useAclsSession();
  if (wakeLock === 'active') {
    return <p className="text-xs text-muted-foreground">Tela mantida acesa durante a parada.</p>;
  }
  if (wakeLock === 'unsupported' || wakeLock === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        Este navegador não mantém a tela acesa: ajuste o bloqueio automático do aparelho para o
        metrônomo e os avisos não pararem.
      </p>
    );
  }
  return null;
}

/** Ritmo inicial, logo depois de iniciar o código. */
export function RhythmPicker() {
  const { selectRhythm } = useAclsSession();
  return (
    <section aria-labelledby="acls-ritmo" className="flex flex-col gap-3">
      <h2 id="acls-ritmo" className="text-lg font-semibold text-foreground">
        Qual o ritmo?
      </h2>
      <p className="text-sm text-muted-foreground">Selecione o ritmo inicial identificado.</p>
      {ACLS_RHYTHMS.map((rhythm) => (
        <Button
          key={rhythm}
          type="button"
          variant="outline"
          onClick={() => selectRhythm(rhythm)}
          className="h-auto min-h-16 flex-col items-start gap-0.5 px-4 py-3 text-left max-sm:h-auto"
        >
          <span className="text-base font-semibold text-foreground">
            {RHYTHM_CONTENT[rhythm].label}
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {RHYTHM_CONTENT[rhythm].detail}
          </span>
        </Button>
      ))}
    </section>
  );
}

/** Descarta a parada (iniciada por engano): pede confirmação, porque apaga a linha do tempo. */
export function DiscardCodeButton({ label = 'Descartar parada' }: { label?: string }) {
  const { discard } = useAclsSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="self-start text-muted-foreground"
      >
        <Trash aria-hidden="true" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar esta parada?</DialogTitle>
            <DialogDescription>
              A linha do tempo, os choques e as medicações registrados somem do aparelho e não
              entram no histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Continuar a parada
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                discard();
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
