'use client';

import { useReducer } from 'react';
import Link from 'next/link';
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FirstAid,
  Minus,
} from '@phosphor-icons/react';
import { toxModuleHref } from '@clinical-tools/toxicology/modules';
import {
  buildToxidromeChartNote,
  INITIAL_TOXIDROME_FLOW,
  toxidromeAnswers,
  toxidromeFlowReducer,
  toxidromeProgress,
  toxidromeStep,
  VITAL_SIGN_LABELS,
  type Toxidrome,
  type VitalSignKey,
  type VitalTrend,
} from '@clinical-tools/toxicology/toxidromes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Progress } from '@/components/ui/progress';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { FlowOptionButton, PoisonCenterCallButton } from './toxicology-shell';

const TREND: Record<VitalTrend, { icon: typeof ArrowUp; label: string }> = {
  up: { icon: ArrowUp, label: 'aumentado' },
  down: { icon: ArrowDown, label: 'diminuído' },
  normal: { icon: Minus, label: 'sem desvio' },
};

function VitalSigns({ toxidrome }: { toxidrome: Toxidrome }) {
  return (
    <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {(Object.keys(VITAL_SIGN_LABELS) as VitalSignKey[]).map((key) => {
        const sign = toxidrome.vitals[key];
        const { icon: Icon, label } = TREND[sign.trend];
        return (
          <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{VITAL_SIGN_LABELS[key]}</dt>
            <dd className="flex items-center gap-1.5 text-right font-medium text-foreground">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">({label})</span>
              {sign.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Identificar toxíndrome (CC-323): a árvore de 11 perguntas do ANY, uma por
 * vez, até uma das 8 toxíndromes. O estado é o reducer do motor; a tela só
 * desenha a pergunta da vez ou o resultado.
 */
export function ToxidromeFlow() {
  const [state, dispatch] = useReducer(toxidromeFlowReducer, INITIAL_TOXIDROME_FLOW);
  const step = toxidromeStep(state);
  const progress = toxidromeProgress(state);

  return (
    <div className="flex flex-col gap-5">
      <Progress value={progress} aria-label="Progresso da avaliação" />

      {step.kind === 'question' ? (
        <section aria-labelledby="toxindrome-pergunta" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Pergunta {step.number}</p>
            <h2
              id="toxindrome-pergunta"
              className="text-xl font-semibold text-balance text-foreground"
            >
              {step.question.text}
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground">{step.question.hint}</p>
          </div>
          <div className="flex flex-col gap-2">
            {step.question.options.map((option) => (
              <FlowOptionButton
                key={option.value}
                onClick={() => dispatch({ type: 'answer', value: option.value })}
              >
                {option.label}
              </FlowOptionButton>
            ))}
          </div>
          {state.answers.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => dispatch({ type: 'back' })}
            >
              <ArrowLeft aria-hidden="true" />
              Pergunta anterior
            </Button>
          ) : null}
        </section>
      ) : (
        <ToxidromeResult
          toxidrome={step.toxidrome}
          chartNote={buildToxidromeChartNote(state)}
          answers={toxidromeAnswers(state).map(({ question, option }) => ({
            question: question.text,
            answer: option.label,
          }))}
          onBack={() => dispatch({ type: 'back' })}
          onRestart={() => dispatch({ type: 'restart' })}
        />
      )}
    </div>
  );
}

function ToxidromeResult({
  toxidrome,
  chartNote,
  answers,
  onBack,
  onRestart,
}: {
  toxidrome: Toxidrome;
  chartNote: string | null;
  answers: readonly { question: string; answer: string }[];
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <section aria-labelledby="toxindrome-resultado" className="flex flex-col gap-5">
      <div role="status" aria-live="polite" className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Possível toxíndrome</p>
        <h2 id="toxindrome-resultado" className="text-2xl font-semibold text-foreground">
          {toxidrome.name}
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Sinais esperados</h3>
        <ul className="flex flex-wrap gap-1.5">
          {toxidrome.signs.map((sign) => (
            <li key={sign}>
              <Badge variant="gray" className="h-6 text-[0.8125rem]">
                {sign}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Padrão de sinais vitais</h3>
        <VitalSigns toxidrome={toxidrome} />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Agentes possíveis</h3>
        <p className="text-[0.9375rem] text-pretty text-foreground">{toxidrome.agents}</p>
      </div>

      <Callout tone="orange" icon={<FirstAid />} title="Recomendações terapêuticas">
        {toxidrome.treatment}
      </Callout>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button asChild className="h-11 max-sm:h-11">
          <Link href={toxModuleHref('antidotos')}>Ver antídotos e doses</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 max-sm:h-11">
          <Link href={toxModuleHref('destino')}>Critérios de destino</Link>
        </Button>
        <PoisonCenterCallButton />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Respostas</h3>
        <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
          {answers.map(({ question, answer }, index) => (
            <li key={index}>
              {question} <span className="font-medium text-foreground">{answer}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <CopyToChartButton text={chartNote} />
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Pergunta anterior
        </Button>
        <Button type="button" variant="ghost" onClick={onRestart}>
          <ArrowCounterClockwise aria-hidden="true" />
          Recomeçar avaliação
        </Button>
      </div>
    </section>
  );
}
