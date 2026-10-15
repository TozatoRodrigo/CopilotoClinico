'use client';

import { useId, type Dispatch } from 'react';
import { ArrowCounterClockwise, ArrowDown, Warning } from '@phosphor-icons/react';
import {
  buildOpioidChartNote,
  formatOpioidDose,
  isOpioidId,
  METHADONE_FOOTNOTE,
  METHADONE_WARNING,
  OPIOID_EQUIVALENCE_TABLE,
  OPIOID_FIELD_LABELS,
  OPIOID_NOTE,
  OPIOID_RESULT_CAPTION,
  OPIOID_TABLE_COLUMNS,
  OPIOID_TABLE_TITLE,
  OPIOIDS,
  opioid,
  type OpioidId,
} from '@clinical-tools/palliative/opioids';
import {
  INITIAL_OPIOID_STATE,
  opioidConversion,
  type PalliativeAction,
  type PalliativeState,
} from '@clinical-tools/palliative/state';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
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
import { NoteCallout, SubHeading } from './blocks';

function OpioidSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: OpioidId;
  onChange: (value: OpioidId) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-muted-foreground">
        {label}
      </label>
      {/* Seletor nativo: no celular abre o seletor do sistema, mais acessível. */}
      <select
        id={id}
        value={value}
        onChange={(event) => {
          if (isOpioidId(event.target.value)) onChange(event.target.value);
        }}
        className="h-11 w-full rounded-md border border-input bg-surface-input px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/25 md:text-sm"
      >
        {OPIOIDS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Conversor de opioides (CC-329). A conta é do motor (`convertOpioid`, a do
 * ANY): resultado ao vivo, unidade de cada opioide visível, faixa validada e
 * metadona sem número, só a orientação.
 */
export function OpioidConverter({
  state,
  dispatch,
}: {
  state: PalliativeState;
  dispatch: Dispatch<PalliativeAction>;
}) {
  const { from, to, dose } = state.opioid;
  const source = opioid(from);
  const target = opioid(to);
  const conversion = opioidConversion(state);
  const changed =
    from !== INITIAL_OPIOID_STATE.from || to !== INITIAL_OPIOID_STATE.to || dose.trim() !== '';

  return (
    <div className="flex flex-col gap-4">
      <NoteCallout note={OPIOID_NOTE} />

      <div className="flex flex-col gap-3">
        <OpioidSelect
          label={OPIOID_FIELD_LABELS.from}
          value={from}
          onChange={(value) => dispatch({ type: 'set-opioid-from', opioid: value })}
        />
        {source.rule.kind === 'linear' ? (
          <NumericField
            // Trocar o opioide troca a unidade e a faixa: o campo recomeça o "já saiu do campo".
            key={from}
            label={OPIOID_FIELD_LABELS.dose}
            unit={source.unit}
            range={source.range}
            value={dose}
            onValueChange={(raw) => dispatch({ type: 'set-opioid-dose', raw })}
          />
        ) : null}
        <ArrowDown aria-hidden="true" className="mx-auto size-4 text-muted-foreground" />
        <OpioidSelect
          label={OPIOID_FIELD_LABELS.to}
          value={to}
          onChange={(value) => dispatch({ type: 'set-opioid-to', opioid: value })}
        />
      </div>

      <section aria-label="Resultado da conversão" className="flex flex-col gap-3">
        {conversion.status === 'nao-linear' ? (
          <div role="status" aria-live="polite">
            <Callout tone="orange" icon={<Warning />} title="Metadona">
              {METHADONE_WARNING}
            </Callout>
          </div>
        ) : conversion.status === 'pending' ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
          >
            {conversion.error
              ? 'Corrija a dose para ver a conversão.'
              : 'Digite a dose atual para ver a conversão.'}
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-1.5 rounded-lg bg-tone-gray-bg px-4 py-3"
          >
            <span className="text-3xl font-semibold text-foreground tabular-nums">
              {formatOpioidDose(conversion.value)} {target.unit}
            </span>
            <span className="text-sm text-foreground">
              {target.label} · {OPIOID_RESULT_CAPTION}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Equivalente de morfina VO: {formatOpioidDose(conversion.morphineEquivalent)} mg/24 h ·
              dose calculada (100%): {formatOpioidDose(conversion.calculated)} {target.unit}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-start gap-2">
          <CopyToChartButton
            text={
              conversion.status === 'complete'
                ? buildOpioidChartNote({ from, to }, conversion)
                : null
            }
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => dispatch({ type: 'reset-opioid' })}
            disabled={!changed}
          >
            <ArrowCounterClockwise aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </section>

      <section aria-label={OPIOID_TABLE_TITLE} className="flex flex-col gap-2">
        <SubHeading>{OPIOID_TABLE_TITLE}</SubHeading>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{OPIOID_TABLE_COLUMNS.label}</TableHead>
                <TableHead scope="col">{OPIOID_TABLE_COLUMNS.dose}</TableHead>
                <TableHead scope="col">{OPIOID_TABLE_COLUMNS.factor}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {OPIOID_EQUIVALENCE_TABLE.map((row) => (
                <TableRow key={row.opioid}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="tabular-nums">{row.dose}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{row.factor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
        <p className="text-xs text-muted-foreground">{METHADONE_FOOTNOTE}</p>
      </section>
    </div>
  );
}
