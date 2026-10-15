'use client';

import { useMemo, useState } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { evaluateCalculator, type CalculatorDefinition } from '@clinical-tools/calculator';
import { buildChartNote } from '@clinical-tools/chart-note';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CalculatorResult } from './calculator-result';
import { CopyToChartButton } from './copy-to-chart-button';
import { DecisionSupportNotice } from './decision-support-notice';
import { NumericField } from './numeric-field';
import { ContentProvenanceNote, ReferenceSection } from './reference-section';
import { ScoreItemList } from './score-item-list';

type Answers = Record<string, string | undefined>;

export interface CalculatorViewProps {
  definition: CalculatorDefinition;
  className?: string;
}

/**
 * Corpo de uma calculadora (CC-305/CC-306): aviso, campos, itens, resultado
 * ao vivo, copiar para o prontuário e referência. Toda a conta é do motor
 * (`evaluateCalculator`); aqui só há estado de formulário.
 */
export function CalculatorView({ definition, className }: CalculatorViewProps) {
  const [items, setItems] = useState<Answers>({});
  const [inputs, setInputs] = useState<Answers>({});
  // Trocar a chave remonta os campos: "Limpar" também zera o "já saiu do campo".
  const [formKey, setFormKey] = useState(0);

  const evaluation = useMemo(
    () => evaluateCalculator(definition, { items, inputs }),
    [definition, items, inputs],
  );
  const chartNote =
    evaluation.status === 'complete' ? buildChartNote(definition, evaluation) : null;
  const hasAnswers =
    Object.values(items).some(Boolean) || Object.values(inputs).some((value) => value?.trim());

  function reset() {
    setItems({});
    setInputs({});
    setFormKey((key) => key + 1);
  }

  return (
    <div data-slot="calculator-view" className={cn('flex flex-col gap-6', className)}>
      <DecisionSupportNotice />

      <div key={formKey} className="flex flex-col gap-5">
        {definition.kind === 'formula' && definition.inputs.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {definition.inputs.map((input) => (
              <NumericField
                key={input.id}
                label={input.label}
                unit={input.unit}
                range={input}
                value={inputs[input.id] ?? ''}
                onValueChange={(raw) => setInputs((current) => ({ ...current, [input.id]: raw }))}
              />
            ))}
          </div>
        ) : null}
        {definition.items && definition.items.length > 0 ? (
          <ScoreItemList
            items={definition.items}
            answers={items}
            onAnswer={(itemId, optionId) =>
              setItems((current) => ({ ...current, [itemId]: optionId }))
            }
          />
        ) : null}
      </div>

      <section aria-label="Resultado" className="flex flex-col gap-3">
        <CalculatorResult definition={definition} evaluation={evaluation} />
        <div className="flex flex-wrap items-start gap-2">
          <CopyToChartButton text={chartNote} />
          <Button type="button" variant="ghost" onClick={reset} disabled={!hasAnswers}>
            <ArrowCounterClockwise aria-hidden="true" />
            Limpar respostas
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <ReferenceSection reference={definition.reference} />
        <ContentProvenanceNote provenance={definition.provenance} />
      </div>
    </div>
  );
}
