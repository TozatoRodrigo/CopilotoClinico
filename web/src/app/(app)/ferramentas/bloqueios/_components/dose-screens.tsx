'use client';

import { Calculator, Warning, WarningOctagon } from '@phosphor-icons/react';
import {
  LAST_PROTOCOL,
  LAST_STEPS,
  LAST_WARNING_SIGNS,
  MAX_DOSE_NOTICE,
} from '@clinical-tools/blocks/content';
import {
  buildLipidEmulsionNote,
  buildMaxDoseNote,
  EPINEPHRINE_LABEL,
  EPINEPHRINE_OPTIONS,
  evaluateLipidEmulsion,
  evaluateMaxDoses,
  formatDoseMg,
  formatDoseMl,
  formatMgPerKg,
  type MaxDoseRow,
  type WeightBasedEvaluation,
} from '@clinical-tools/blocks/doses';
import { formatCompact } from '@clinical-tools/numbers';
import { describeRange, WEIGHT_RANGES } from '@clinical-tools/ranges';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Callout } from '@/components/ui/callout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { SectionHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { useToolWeight } from '@/lib/tool-session';
import { BlocksPage } from './blocks-ui';

/**
 * Linha de estado da conta por peso, anunciada pelo leitor de tela: o peso
 * usado quando há resultado, ou o que falta. Sem peso válido não há número
 * nenhum na tela (ADR-017).
 */
function WeightStatus<T>({ evaluation }: { evaluation: WeightBasedEvaluation<T> }) {
  const complete = evaluation.status === 'complete';
  let message: string;
  if (complete) message = `Calculado para ${formatCompact(evaluation.weightKg)} kg.`;
  else if (evaluation.error) message = 'Corrija o peso para ver o resultado.';
  else message = `Informe o peso (${describeRange(WEIGHT_RANGES.adulto)}) para ver o resultado.`;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'text-sm text-muted-foreground',
        !complete && 'rounded-lg border border-dashed border-border px-4 py-3',
      )}
    >
      {message}
    </p>
  );
}

function AnestheticCard({ row }: { row: MaxDoseRow }) {
  const headingId = `dose-maxima-${row.anesthetic.id}`;
  const concentrations = row.anesthetic.concentrations;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3"
    >
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {row.anesthetic.name}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {EPINEPHRINE_OPTIONS.map((epinephrine) => {
          const dose = row.doses[epinephrine];
          return (
            <div key={epinephrine} className="rounded-md bg-tone-gray-bg px-3 py-2">
              <div className="text-xs text-muted-foreground">{EPINEPHRINE_LABEL[epinephrine]}</div>
              <div className="text-2xl font-semibold text-foreground tabular-nums">
                {formatDoseMg(dose.mg)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatMgPerKg(dose.mgPerKg)}
              </div>
            </div>
          );
        })}
      </div>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-auto py-2 whitespace-normal">Concentração</TableHead>
              {EPINEPHRINE_OPTIONS.map((epinephrine) => (
                <TableHead key={epinephrine} className="h-auto py-2 whitespace-normal">
                  {EPINEPHRINE_LABEL[epinephrine]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {concentrations.map((concentration, index) => (
              <TableRow key={concentration.label}>
                <TableCell className="font-medium tabular-nums">{concentration.label}</TableCell>
                {EPINEPHRINE_OPTIONS.map((epinephrine) => (
                  <TableCell key={epinephrine} className="tabular-nums">
                    {formatDoseMl(row.doses[epinephrine].volumes[index]?.ml ?? Number.NaN)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </section>
  );
}

/** /ferramentas/bloqueios/dose-maxima — dose máxima de anestésico local pelo peso. */
export function MaxDoseScreen() {
  const [weight, setWeight] = useToolWeight();
  const evaluation = evaluateMaxDoses(weight);
  return (
    <BlocksPage
      icon={Calculator}
      title="Dose máxima de anestésico local"
      description="Pelo peso, sem e com epinefrina, em mg e no volume de cada concentração."
      current="dose-maxima"
    >
      <div className="flex flex-col gap-3">
        <WeightField population="adulto" value={weight} onValueChange={setWeight} />
        <WeightStatus evaluation={evaluation} />
      </div>
      {evaluation.status === 'complete' ? (
        <div className="flex flex-col gap-4">
          {evaluation.result.map((row) => (
            <AnestheticCard key={row.anesthetic.id} row={row} />
          ))}
        </div>
      ) : null}
      <Callout tone="orange" icon={<Warning />} title={MAX_DOSE_NOTICE.title}>
        {MAX_DOSE_NOTICE.text}
      </Callout>
      <CopyToChartButton
        text={evaluation.status === 'complete' ? buildMaxDoseNote(evaluation.weightKg) : null}
      />
    </BlocksPage>
  );
}

/** /ferramentas/bloqueios/last — protocolo de LAST e dose de emulsão lipídica 20%. */
export function LastScreen() {
  const [weight, setWeight] = useToolWeight();
  const evaluation = evaluateLipidEmulsion(weight);
  return (
    <BlocksPage
      icon={WarningOctagon}
      iconTone="red"
      title={LAST_PROTOCOL.title}
      description={LAST_PROTOCOL.subtitle}
      current="last"
    >
      <section aria-labelledby="last-sinais" className="flex flex-col gap-2">
        <SectionHeader
          title={<span id="last-sinais">{LAST_PROTOCOL.warningSignsTitle}</span>}
          className="border-b border-border pb-1.5"
        />
        {LAST_WARNING_SIGNS.map((sign) => (
          <Callout key={sign.title} tone={RESULT_TONE[sign.tone]} title={sign.title}>
            {sign.text}
          </Callout>
        ))}
      </section>

      <section aria-labelledby="last-passos" className="flex flex-col gap-2">
        <SectionHeader
          title={<span id="last-passos">Passos</span>}
          className="border-b border-border pb-1.5"
        />
        <ol className="flex flex-col gap-3">
          {LAST_STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tone-red-tag text-sm font-semibold text-tone-red-ink tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-foreground">
                  <span className="sr-only">Passo {index + 1}: </span>
                  {step.title}
                </span>
                <span className="block text-[0.9375rem] text-pretty text-foreground">
                  {step.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="last-emulsao" className="flex flex-col gap-3">
        <SectionHeader
          title={<span id="last-emulsao">{LAST_PROTOCOL.lipidTitle}</span>}
          className="border-b border-border pb-1.5"
        />
        <WeightField population="adulto" value={weight} onValueChange={setWeight} />
        <WeightStatus evaluation={evaluation} />
        {evaluation.status === 'complete' ? (
          <dl className="flex flex-col rounded-lg bg-tone-red-bg px-4 py-2">
            {evaluation.result.map((row) => (
              <div
                key={row.id}
                className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
              >
                <dt className="text-sm text-tone-red-ink">{row.label}</dt>
                <dd className="text-xl font-semibold text-tone-red-ink tabular-nums">{row.text}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <CopyToChartButton
          text={
            evaluation.status === 'complete' ? buildLipidEmulsionNote(evaluation.weightKg) : null
          }
        />
      </section>
    </BlocksPage>
  );
}
