'use client';

import { useMemo } from 'react';
import { ArrowCounterClockwise, FloppyDisk, Play } from '@phosphor-icons/react';
import { formatResultValue, type CalculatorEvaluation } from '@clinical-tools/calculator';
import {
  appendHacorReassessment,
  buildHacorChartNote,
  clockTime,
  evaluateHacor,
  HACOR,
  HACOR_PHASE_ACTION,
  HACOR_SHORT_LABEL,
  hacorBand,
  hacorTrend,
  startHacorHistory,
  type HacorEntry,
  type HacorPhase,
} from '@clinical-tools/ventilation/hacor';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { ReferenceSection } from '@/components/domain/clinical-tools/reference-section';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';
import { Button } from '@/components/ui/button';
import { toneBg, toneInk, toneTag, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { EMPTY_HACOR_SESSION, useHacorSession } from './hacor-state';

const PHASES: readonly { id: HacorPhase; title: string; description: string }[] = [
  { id: 'inicio', title: 'Iniciar VNI', description: 'Avaliar risco antes de iniciar' },
  {
    id: 'reavaliacao',
    title: 'Reavaliar VNI',
    description: 'Paciente já em VNI: verificar resposta',
  },
];

function PhaseSelector({
  phase,
  onSelect,
}: {
  phase: HacorPhase | null;
  onSelect: (phase: HacorPhase) => void;
}) {
  return (
    <div role="group" aria-label="Momento da avaliação" className="grid gap-2 sm:grid-cols-2">
      {PHASES.map((option) => {
        const selected = option.id === phase;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(option.id)}
            className={cn(
              'flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
              selected
                ? 'border-primary bg-tone-blue-bg text-tone-blue-ink'
                : 'border-border bg-background text-foreground hover:bg-hover',
            )}
          >
            <span className="text-sm font-semibold">{option.title}</span>
            <span
              className={cn('text-xs', selected ? 'text-tone-blue-ink' : 'text-muted-foreground')}
            >
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "T0 (10:05): HACOR 7 — alto risco", no tom da faixa. */
function EntryTag({ entry }: { entry: HacorEntry }) {
  const band = hacorBand(entry.score);
  return (
    <span
      className={cn(
        'rounded-[3px] px-1.5 py-0.5 text-sm font-medium tabular-nums',
        toneTag[RESULT_TONE[band.tone]],
      )}
    >
      HACOR {entry.score} — {HACOR_SHORT_LABEL[band.id]}
    </span>
  );
}

function HacorResult({
  phase,
  evaluation,
  previous,
}: {
  phase: HacorPhase;
  evaluation: CalculatorEvaluation;
  previous: HacorEntry | undefined;
}) {
  if (evaluation.status === 'pending') {
    const missing = evaluation.missing.length;
    return (
      <div
        role="status"
        aria-live="polite"
        data-state="pending"
        className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
      >
        {missing === 1
          ? `Falta 1 resposta: ${evaluation.missing[0]}.`
          : `Faltam ${missing} respostas para ver o resultado.`}
      </div>
    );
  }
  const band = hacorBand(evaluation.value);
  const tone = RESULT_TONE[band.tone];
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      data-state="complete"
      data-tone={tone}
      className={cn('flex flex-col gap-2 rounded-lg px-4 py-3', toneBg[tone])}
    >
      <span className={cn('text-sm font-medium', ink)}>HACOR</span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className={cn('text-3xl font-semibold tabular-nums', ink)}>
          {formatResultValue(HACOR, evaluation.value)}
        </span>
        <span className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}>
          {band.label}
        </span>
      </div>
      <p className={cn('text-[0.9375rem] text-pretty', ink)}>
        {HACOR_PHASE_ACTION[phase][band.id]}
      </p>
      {phase === 'reavaliacao' && previous ? (
        <p className={cn('text-sm tabular-nums', ink)}>
          Anterior: {previous.score} → Atual: {evaluation.value} (
          {hacorTrend(previous.score, evaluation.value).label})
        </p>
      ) : null}
    </div>
  );
}

function Timeline({ history }: { history: readonly HacorEntry[] }) {
  const first = history[0];
  const last = history[history.length - 1];
  const trend = first && last && history.length >= 2 ? hacorTrend(first.score, last.score) : null;
  return (
    <section aria-label="Histórico de avaliações" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">Histórico de avaliações</h3>
      <ol className="flex flex-col divide-y divide-border border-y border-border">
        {history.map((entry, index) => (
          <li
            key={`${entry.label}-${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="text-muted-foreground tabular-nums">
              {entry.label} ({entry.time})
            </span>
            <EntryTag entry={entry} />
          </li>
        ))}
      </ol>
      {trend && first && last ? (
        <p className="text-sm text-muted-foreground">
          Tendência:{' '}
          <strong className={cn('font-semibold tabular-nums', toneText[RESULT_TONE[trend.tone]])}>
            {first.score} → {last.score} ({trend.label})
          </strong>
        </p>
      ) : null}
    </section>
  );
}

/**
 * HACOR com reavaliação (CC-327), como no VM Guide do ANY: avaliar antes de
 * iniciar a VNI e registrar o T0; depois reavaliar, comparar com a avaliação
 * anterior e ver a tendência. A soma e a faixa são do motor; o histórico fica
 * na aba (hacor-state).
 */
export function HacorPanel() {
  const [session, update] = useHacorSession();
  const { phase, history } = session;
  const answers = phase === 'reavaliacao' ? session.reassessment : session.start;
  const evaluation = useMemo(() => evaluateHacor({ items: answers }), [answers]);
  const previous = history[history.length - 1];
  const chartNote =
    phase && evaluation.status === 'complete'
      ? buildHacorChartNote(phase, evaluation, history)
      : null;

  function answer(itemId: string, optionId: string) {
    update((current) =>
      current.phase === 'reavaliacao'
        ? { ...current, reassessment: { ...current.reassessment, [itemId]: optionId } }
        : { ...current, start: { ...current.start, [itemId]: optionId } },
    );
  }

  function registerStart() {
    if (evaluation.status !== 'complete') return;
    const score = evaluation.value;
    update((current) => ({
      ...current,
      phase: 'reavaliacao',
      reassessment: {},
      history: startHacorHistory(score, clockTime(new Date())),
    }));
  }

  function saveReassessment() {
    if (evaluation.status !== 'complete') return;
    const score = evaluation.value;
    update((current) => ({
      ...current,
      reassessment: {},
      history: appendHacorReassessment(current.history, score, clockTime(new Date())),
    }));
  }

  function restart() {
    update(() => ({ ...EMPTY_HACOR_SESSION, phase: 'inicio' }));
  }

  const t0 = history[0];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.9375rem] text-pretty text-muted-foreground">{HACOR.reference.why}</p>
      <PhaseSelector
        phase={phase}
        onSelect={(next) => update((current) => ({ ...current, phase: next }))}
      />

      {phase ? (
        <div className="flex flex-col gap-5">
          {phase === 'reavaliacao' && t0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <span className="font-medium tabular-nums">
                {t0.label} ({t0.time}):
              </span>
              <EntryTag entry={t0} />
            </p>
          ) : null}

          <ScoreItemList key={phase} items={HACOR.items} answers={answers} onAnswer={answer} />

          <section aria-label="Resultado do HACOR" className="flex flex-col gap-3">
            <HacorResult phase={phase} evaluation={evaluation} previous={previous} />
            <div className="flex flex-wrap items-start gap-2">
              {phase === 'inicio' && evaluation.status === 'complete' ? (
                <Button type="button" onClick={registerStart}>
                  <Play aria-hidden="true" />
                  Iniciar VNI e registrar T0
                </Button>
              ) : null}
              {phase === 'reavaliacao' && evaluation.status === 'complete' ? (
                <Button type="button" onClick={saveReassessment}>
                  <FloppyDisk aria-hidden="true" />
                  Salvar e reavaliar depois
                </Button>
              ) : null}
              <CopyToChartButton text={chartNote} />
              {phase === 'reavaliacao' && (evaluation.status === 'complete' || t0) ? (
                <Button type="button" variant="ghost" onClick={restart}>
                  <ArrowCounterClockwise aria-hidden="true" />
                  Nova avaliação inicial
                </Button>
              ) : null}
            </div>
          </section>

          {phase === 'reavaliacao' && history.length > 0 ? <Timeline history={history} /> : null}
        </div>
      ) : null}

      <ReferenceSection reference={HACOR.reference} />
    </div>
  );
}
