'use client';

import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import { describeRange } from '@clinical-tools/ranges';
import {
  buildVentilationChartNote,
  evaluateVentilation,
  usualRangeWarning,
  type VentilationAnswers,
} from '@clinical-tools/ventilation/evaluate';
import type { VentilationCalculation, VentilationInput } from '@clinical-tools/ventilation/types';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { ScoreItemList } from '@/components/domain/clinical-tools/score-item-list';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { VentilationResult } from './ventilation-result';

export interface CalculationAnswers {
  choices: Record<string, string | undefined>;
  inputs: Record<string, string | undefined>;
}

export const EMPTY_ANSWERS: CalculationAnswers = { choices: {}, inputs: {} };

/**
 * Dica do campo: a faixa aceita ou, fora da faixa habitual do ANY, o aviso
 * dele em laranja. O aviso não barra a conta (como no ANY); a faixa aceita sim.
 */
function FieldHint({ input, raw }: { input: VentilationInput; raw: string }) {
  const warning = usualRangeWarning(input, raw);
  if (!warning) return <>Faixa aceita: {describeRange(input)}.</>;
  return (
    <span className="inline-flex items-start gap-1 font-medium text-tone-orange">
      <Warning className="mt-px size-3.5 shrink-0" weight="bold" aria-hidden="true" />
      <span>{warning}.</span>
    </span>
  );
}

/**
 * Uma conta do VM Guide (CC-327): conceito, escolhas, campos com unidade,
 * resultado ao vivo, copiar para o prontuário. Toda conta e todo texto vêm do
 * motor; as respostas ficam na tela da ferramenta, para não se perderem ao
 * fechar e reabrir a conta.
 */
export function VentilationCalculator({
  calculation,
  answers,
  onAnswersChange,
}: {
  calculation: VentilationCalculation;
  answers: CalculationAnswers;
  onAnswersChange: (answers: CalculationAnswers) => void;
}) {
  // Trocar a chave remonta os campos: "Limpar" também zera o "já saiu do campo".
  const [formKey, setFormKey] = useState(0);
  const evaluation = useMemo(
    () => evaluateVentilation(calculation, answers satisfies VentilationAnswers),
    [calculation, answers],
  );
  const chartNote =
    evaluation.status === 'complete' ? buildVentilationChartNote(calculation, evaluation) : null;
  const hasAnswers =
    Object.values(answers.choices).some(Boolean) ||
    Object.values(answers.inputs).some((value) => value?.trim());

  return (
    <div data-slot="ventilation-calculator" className="flex flex-col gap-5">
      <p className="text-[0.9375rem] text-pretty text-muted-foreground">{calculation.concept}</p>

      <div key={formKey} className="flex flex-col gap-4">
        {calculation.choices ? (
          <ScoreItemList
            items={calculation.choices}
            answers={answers.choices}
            onAnswer={(choiceId, optionId) =>
              onAnswersChange({ ...answers, choices: { ...answers.choices, [choiceId]: optionId } })
            }
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {calculation.inputs.map((input) => {
            const raw = answers.inputs[input.id] ?? '';
            return (
              <NumericField
                key={input.id}
                label={input.label}
                unit={input.unit}
                range={input}
                value={raw}
                placeholder={input.placeholder}
                hint={<FieldHint input={input} raw={raw} />}
                onValueChange={(next) =>
                  onAnswersChange({ ...answers, inputs: { ...answers.inputs, [input.id]: next } })
                }
              />
            );
          })}
        </div>
      </div>

      <section aria-label={`Resultado: ${calculation.name}`} className="flex flex-col gap-3">
        <VentilationResult calculation={calculation} evaluation={evaluation} />
        <div className="flex flex-wrap items-start gap-2">
          <CopyToChartButton text={chartNote} />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onAnswersChange(EMPTY_ANSWERS);
              setFormKey((key) => key + 1);
            }}
            disabled={!hasAnswers}
          >
            <ArrowCounterClockwise aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </section>

      {calculation.note ? (
        <Callout tone="gray" title={calculation.note.title}>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {calculation.note.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {calculation.citation ? (
        <p className="text-xs text-pretty text-muted-foreground">
          Referência: {calculation.citation}
        </p>
      ) : null}
    </div>
  );
}
