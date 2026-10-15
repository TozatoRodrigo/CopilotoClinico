'use client';

import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, WarningCircle } from '@phosphor-icons/react';
import {
  evaluateCalculator,
  itemShowsPoints,
  type CalculatorDefinition,
} from '@clinical-tools/calculator';
import { calculatorCasePrefill, sameAsCase } from '@clinical-tools/case-prefill';
import { buildChartNote } from '@clinical-tools/chart-note';
import { formatCompact } from '@clinical-tools/numbers';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { useToolSession } from '@/lib/tool-session';
import { cn } from '@/lib/utils';
import { CalculatorResult } from './calculator-result';
import { useCaseLink } from './case-link';
import { CopyToChartButton } from './copy-to-chart-button';
import { DecisionSupportNotice } from './decision-support-notice';
import { NumericField } from './numeric-field';
import { ContentProvenanceNote, ReferenceSection } from './reference-section';
import { ScoreItemList } from './score-item-list';

type Answers = Record<string, string | undefined>;

interface CalculatorAnswersState {
  items: Answers;
  inputs: Answers;
}

function parseAnswers(value: unknown): Answers | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, answer]) => typeof answer === 'string' && answer.length <= 40)
    ? (Object.fromEntries(entries) as Answers)
    : null;
}

/** Lê sem confiar no formato: versão antiga ou edição à mão vira `null` e a conta recomeça. */
function parseCalculatorAnswers(value: unknown): CalculatorAnswersState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { items, inputs } = value as Record<string, unknown>;
  const parsedItems = parseAnswers(items);
  const parsedInputs = parseAnswers(inputs);
  return parsedItems && parsedInputs ? { items: parsedItems, inputs: parsedInputs } : null;
}

/** Campos que o ANY abria preenchidos (FiO₂ 21%, albumina 4,0), já com vírgula. */
function initialInputs(definition: CalculatorDefinition): Answers {
  if (definition.kind !== 'formula') return {};
  return Object.fromEntries(
    definition.inputs.flatMap((input) =>
      input.defaultValue === undefined ? [] : [[input.id, formatCompact(input.defaultValue)]],
    ),
  );
}

export interface CalculatorViewProps {
  definition: CalculatorDefinition;
  className?: string;
}

/**
 * Corpo de uma calculadora (CC-305/CC-306): aviso, campos, itens, resultado
 * ao vivo, copiar para o prontuário e referência. Toda a conta é do motor
 * (`evaluateCalculator`); aqui só há estado de formulário, guardado na sessão
 * da aba: quem abre o roteiro ("Abrir no roteiro") e volta encontra as
 * respostas (CC-331). Aberta pelo plano do Copiloto, já vem com o que o caso
 * responde (gravado na aba antes de abrir) e marca essas respostas como
 * "vindo do caso" até o médico trocar (CC-332).
 */
export function CalculatorView({ definition, className }: CalculatorViewProps) {
  const defaults = useMemo(() => initialInputs(definition), [definition]);
  const [answers, setAnswers] = useToolSession<CalculatorAnswersState>(
    `calculadora:${definition.id}`,
    parseCalculatorAnswers,
    () => ({ items: {}, inputs: defaults }),
  );
  const { items, inputs } = answers;
  const link = useCaseLink();
  const casePrefill = useMemo(
    () => (link ? calculatorCasePrefill(definition, link.facts) : null),
    [definition, link],
  );
  const setItems = (update: (current: Answers) => Answers) =>
    setAnswers((current) => ({ ...current, items: update(current.items) }));
  const setInputs = (update: (current: Answers) => Answers) =>
    setAnswers((current) => ({ ...current, inputs: update(current.inputs) }));
  // Trocar a chave remonta os campos: "Limpar" também zera o "já saiu do campo".
  const [formKey, setFormKey] = useState(0);

  const evaluation = useMemo(
    () => evaluateCalculator(definition, { items, inputs }),
    [definition, items, inputs],
  );
  const chartNote =
    evaluation.status === 'complete' ? buildChartNote(definition, evaluation) : null;
  const hasAnswers =
    Object.values(items).some(Boolean) ||
    Object.entries(inputs).some(([id, value]) => (value ?? '') !== (defaults[id] ?? ''));

  function reset() {
    setAnswers({ items: {}, inputs: defaults });
    setFormKey((key) => key + 1);
  }

  function issueFor(inputId: string): string | undefined {
    if (evaluation.status !== 'pending') return undefined;
    const error = evaluation.errors[inputId];
    return error?.kind === 'inconsistent' ? error.message : undefined;
  }

  return (
    <div data-slot="calculator-view" className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        {definition.versionNotice ? (
          <Callout tone="gray" icon={<WarningCircle />} title={definition.versionNotice.title}>
            {definition.versionNotice.text}
          </Callout>
        ) : null}
      </div>

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
                issue={issueFor(input.id)}
                onValueChange={(raw) => setInputs((current) => ({ ...current, [input.id]: raw }))}
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
            onAnswer={(itemId, optionId) =>
              setItems((current) => ({ ...current, [itemId]: optionId }))
            }
            fromCase={(itemId) => sameAsCase(items[itemId], casePrefill?.items[itemId])}
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
