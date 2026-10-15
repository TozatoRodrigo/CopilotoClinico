'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  evaluateCalculator,
  itemShowsPoints,
  type CalculatorDefinition,
  type CalculatorEvaluation,
} from '@clinical-tools/calculator';
import { calculatorCasePrefill, sameAsCase } from '@clinical-tools/case-prefill';
import { formatCompact } from '@clinical-tools/numbers';
import { cn } from '@/lib/utils';
import { CalculatorResult } from './calculator-result';
import { useCaseLink } from './case-link';
import { NumericField } from './numeric-field';
import { ScoreItemList } from './score-item-list';

type Answers = Record<string, string | undefined>;
export type CompleteEvaluation = Extract<CalculatorEvaluation, { status: 'complete' }>;

function initialInputs(definition: CalculatorDefinition): Answers {
  if (definition.kind !== 'formula') return {};
  return Object.fromEntries(
    definition.inputs.flatMap((input) =>
      input.defaultValue === undefined ? [] : [[input.id, formatCompact(input.defaultValue)]],
    ),
  );
}

export interface InlineCalculatorProps {
  definition: CalculatorDefinition;
  /** Texto curto acima dos campos ("Ponto de corte = idade × 10 µg/L"). */
  hint?: ReactNode;
  /**
   * Chamado a cada resposta que deixa a calculadora completa, com o resultado
   * novo: é assim que o roteiro anda sozinho quando o ANY andava (Wells fixa o
   * nível, D-dímero fixa o resultado).
   */
  onComplete?: (evaluation: CompleteEvaluation) => void;
  /** Ação abaixo do resultado, só com resultado ("Prosseguir como categoria B"). */
  action?: (evaluation: CompleteEvaluation) => ReactNode;
  className?: string;
}

/**
 * Calculadora dentro de um roteiro (CC-318): campos, itens e resultado ao
 * vivo, sem o aviso, a referência e o "copiar" da tela inteira — o roteiro já
 * tem os dele. Toda a conta é do motor (`evaluateCalculator`). No roteiro
 * aberto pelo plano do Copiloto, abre com o que o caso responde (o Wells e o
 * PERC do TEP), marcado "vindo do caso" (CC-332). O preenchimento não avança
 * o roteiro: só o toque do médico avança.
 */
export function InlineCalculator({
  definition,
  hint,
  onComplete,
  action,
  className,
}: InlineCalculatorProps) {
  const link = useCaseLink();
  const casePrefill = useMemo(
    () => (link ? calculatorCasePrefill(definition, link.facts) : null),
    [definition, link],
  );
  const [items, setItems] = useState<Answers>(() => ({ ...casePrefill?.items }));
  const [inputs, setInputs] = useState<Answers>(() => ({
    ...initialInputs(definition),
    ...casePrefill?.inputs,
  }));
  const evaluation = useMemo(
    () => evaluateCalculator(definition, { items, inputs }),
    [definition, items, inputs],
  );

  // Avisa no próprio toque (e não num efeito): o roteiro muda junto com a resposta.
  function update(nextItems: Answers, nextInputs: Answers) {
    setItems(nextItems);
    setInputs(nextInputs);
    const next = evaluateCalculator(definition, { items: nextItems, inputs: nextInputs });
    if (next.status === 'complete') onComplete?.(next);
  }

  function issueFor(inputId: string): string | undefined {
    if (evaluation.status !== 'pending') return undefined;
    const error = evaluation.errors[inputId];
    return error?.kind === 'inconsistent' ? error.message : undefined;
  }

  return (
    <div data-slot="inline-calculator" className={cn('flex flex-col gap-4', className)}>
      {hint ? <p className="text-[0.8125rem] text-pretty text-muted-foreground">{hint}</p> : null}
      {definition.kind === 'formula' && definition.inputs.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {definition.inputs.map((input) => (
            <NumericField
              key={input.id}
              label={input.label}
              unit={input.unit}
              range={input}
              value={inputs[input.id] ?? ''}
              issue={issueFor(input.id)}
              onValueChange={(raw) => update(items, { ...inputs, [input.id]: raw })}
              fromCase={sameAsCase(inputs[input.id], casePrefill?.inputs[input.id])}
            />
          ))}
        </div>
      ) : null}
      {definition.items && definition.items.length > 0 ? (
        <ScoreItemList
          items={definition.items}
          answers={items}
          showsPoints={(item) => itemShowsPoints(definition, item)}
          onAnswer={(itemId, optionId) => update({ ...items, [itemId]: optionId }, inputs)}
          fromCase={(itemId) => sameAsCase(items[itemId], casePrefill?.items[itemId])}
        />
      ) : null}
      <CalculatorResult definition={definition} evaluation={evaluation} />
      {evaluation.status === 'complete' && action ? action(evaluation) : null}
    </div>
  );
}
