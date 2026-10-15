'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { formatDecimal } from '@clinical-tools/numbers';
import { validateNumber } from '@clinical-tools/ranges';
import { tecReevaluations } from '@clinical-tools/shock/septic-roteiro';
import { CAPILLARY_REFILL, tecReevaluationBand } from '@clinical-tools/shock/septic-shock';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
import { formatClock } from '../../_components/shock/format-time';
import { ToneTag } from '../../_components/shock/tone-result';
import type { SepticStepProps } from './step-props';

/**
 * Reavaliação do TEC com horário (CC-316): cada valor salvo entra na linha do
 * tempo e passa a ser o TEC em vigor, como no ANY. O histórico mostra o tom
 * de cada medida com rótulo.
 */
export function TecReevaluation({ state, dispatch, now }: Omit<SepticStepProps, 'values'>) {
  const [raw, setRaw] = useState('');
  // Trocar a chave remonta o campo depois de salvar: some o "já saiu do campo".
  const [fieldKey, setFieldKey] = useState(0);
  const history = tecReevaluations(state);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validateNumber(raw, CAPILLARY_REFILL.input);
    if (!checked.ok) return;
    dispatch({ type: 'reavaliar-tec', value: checked.value, at: now() });
    setRaw('');
    setFieldKey((key) => key + 1);
    toast.success('Reavaliação do TEC salva.');
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={save} className="flex flex-col gap-2">
        <NumericField
          key={fieldKey}
          label="Novo TEC"
          unit={CAPILLARY_REFILL.input.unit}
          range={CAPILLARY_REFILL.input}
          value={raw}
          onValueChange={setRaw}
          placeholder="Segundos"
        />
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          disabled={!validateNumber(raw, CAPILLARY_REFILL.input).ok}
        >
          Salvar reavaliação
        </Button>
      </form>
      {history.length > 0 ? (
        <ol aria-label="Reavaliações do TEC" className="flex flex-col gap-1.5">
          {history.map((entry) => {
            const band = tecReevaluationBand(entry.value);
            return (
              <li
                key={`${entry.at}-${entry.value}`}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <time dateTime={new Date(entry.at).toISOString()} className="tabular-nums">
                  {formatClock(entry.at)}
                </time>
                <span className="tabular-nums">{formatDecimal(entry.value, 1)} s</span>
                <ToneTag tone={band.tone} className="text-xs">
                  {band.label}
                </ToneTag>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
