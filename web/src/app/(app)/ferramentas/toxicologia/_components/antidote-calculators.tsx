'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { evaluateCalculator } from '@clinical-tools/calculator';
import { calculatorHref } from '@clinical-tools/links';
import { getCalculator } from '@clinical-tools/registry';
import { validateNumber } from '@clinical-tools/ranges';
import {
  atropineAmpoulesText,
  atropineMaintenance,
  atropineRateText,
  ATROPINE,
  ATROPINE_LOADING_RANGE,
  buildAtropineChartNote,
  buildNacChartNote,
  NAC_WEIGHT_RANGE,
  nacDoses,
  nacStageText,
  nacStageTitle,
  nacTotalText,
} from '@clinical-tools/toxicology/antidote-doses';
import { Button } from '@/components/ui/button';
import { CalculatorResult } from '@/components/domain/clinical-tools/calculator-result';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';

/**
 * O nomograma do card da NAC é a calculadora `nomograma-rumack` inteira:
 * mesmos campos, mesma conta (`rumack-matthew.ts`) e mesmo texto de faixa.
 * No ANY havia uma segunda cópia da conta aqui (CC-308: uma só).
 */
const NOMOGRAM = getCalculator('nomograma-rumack');

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function NomogramPanel() {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const evaluation = useMemo(
    () => (NOMOGRAM ? evaluateCalculator(NOMOGRAM, { inputs }) : null),
    [inputs],
  );
  if (!NOMOGRAM || NOMOGRAM.kind !== 'formula' || !evaluation) return null;
  return (
    <Panel title="Nomograma de Rumack-Matthew">
      <div className="grid gap-4 sm:grid-cols-2">
        {NOMOGRAM.inputs.map((input) => (
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
      <CalculatorResult definition={NOMOGRAM} evaluation={evaluation} />
      <p className="text-xs text-muted-foreground">Válido apenas para ingestões agudas únicas.</p>
      <Button asChild variant="link" className="self-start">
        <Link href={calculatorHref(NOMOGRAM.id, { from: { tool: 'toxicologia' } })}>
          <ArrowSquareOut aria-hidden="true" />
          Abrir a calculadora com referência
        </Link>
      </Button>
    </Panel>
  );
}

function NacDosePanel() {
  const [raw, setRaw] = useState('');
  const checked = validateNumber(raw, NAC_WEIGHT_RANGE);
  const doses = checked.ok ? nacDoses(checked.value) : null;
  return (
    <Panel title="Calculadora de doses da NAC (IV, 21 h)">
      <NumericField
        label="Peso do paciente"
        unit={NAC_WEIGHT_RANGE.unit}
        range={NAC_WEIGHT_RANGE}
        value={raw}
        onValueChange={setRaw}
        placeholder="70"
      />
      <div role="status" aria-live="polite">
        {doses ? (
          <div className="flex flex-col gap-2">
            <ol className="flex flex-col gap-2">
              {doses.stages.map((stage) => (
                <li key={stage.stage} className="border-l-2 border-border pl-3">
                  <p className="text-xs text-muted-foreground">{nacStageTitle(stage)}</p>
                  <p className="text-base font-semibold text-foreground tabular-nums">
                    {nacStageText(stage)}
                  </p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground tabular-nums">{nacTotalText(doses)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Informe o peso para ver as três etapas.</p>
        )}
      </div>
      <CopyToChartButton text={doses ? buildNacChartNote(doses) : null} />
    </Panel>
  );
}

/** Nomograma e doses da NAC, no card da N-acetilcisteína. */
export function NacCalculators() {
  return (
    <div className="flex flex-col gap-3">
      <NomogramPanel />
      <NacDosePanel />
    </div>
  );
}

/** Manutenção da atropina pela dose de ataque, no card da atropina. */
export function AtropineCalculator() {
  const [raw, setRaw] = useState('');
  const checked = validateNumber(raw, ATROPINE_LOADING_RANGE);
  const result = checked.ok ? atropineMaintenance(checked.value) : null;
  return (
    <Panel title="Calculadora de infusão contínua">
      <NumericField
        label="Dose de ataque efetiva"
        unit={ATROPINE_LOADING_RANGE.unit}
        range={ATROPINE_LOADING_RANGE}
        value={raw}
        onValueChange={setRaw}
        placeholder="8"
      />
      <div role="status" aria-live="polite">
        {result ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-muted-foreground">
              Infusão contínua ({ATROPINE.maintenanceFraction * 100}%/hora):
            </p>
            <p className="text-xl font-semibold text-foreground tabular-nums">
              {atropineRateText(result)}
            </p>
            <p className="text-sm text-muted-foreground">{atropineAmpoulesText(result)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe a dose de ataque efetiva para ver a infusão.
          </p>
        )}
      </div>
      <CopyToChartButton text={result ? buildAtropineChartNote(result) : null} />
    </Panel>
  );
}
