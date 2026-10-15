'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { validateNumber } from '@clinical-tools/ranges';
import {
  assessToxicDose,
  buildToxicDoseChartNote,
  entryReviewText,
  formatIngestedDose,
  formatToxicDose,
  INGESTED_AMOUNT_RANGE,
  searchToxicDoses,
  toxicDoseBandText,
  toxicDosePercentText,
  TOXIC_DOSE_MIN_QUERY,
  TOXIC_DOSE_WEIGHT_RANGE,
} from '@clinical-tools/toxicology/toxic-dose';
import {
  TOXIC_DOSES,
  TOXIC_DOSES_PROVENANCE,
  type ToxicDoseEntry,
} from '@clinical-tools/toxicology/toxic-doses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { toneBg, toneInk, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ToolSearchField } from '../../_components/tool-entries';

/** Resultados mostrados de uma vez, como os 10 do ANY. */
const MAX_RESULTS = 10;

function DoseCalculator({ entry }: { entry: ToxicDoseEntry }) {
  const [weight, setWeight] = useState('');
  const [amount, setAmount] = useState('');
  const checkedWeight = validateNumber(weight, TOXIC_DOSE_WEIGHT_RANGE);
  const checkedAmount = validateNumber(amount, INGESTED_AMOUNT_RANGE);
  const assessment =
    checkedWeight.ok && checkedAmount.ok
      ? assessToxicDose(entry, checkedWeight.value, checkedAmount.value)
      : null;
  const tone = assessment ? RESULT_TONE[assessment.band.tone] : 'gray';
  const ink = tone === 'gray' ? 'text-foreground' : toneInk[tone];

  return (
    <section aria-label="Calcular dose ingerida" className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-foreground">Calcular dose ingerida</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumericField
          label="Peso do paciente"
          unit={TOXIC_DOSE_WEIGHT_RANGE.unit}
          range={TOXIC_DOSE_WEIGHT_RANGE}
          value={weight}
          onValueChange={setWeight}
          placeholder="70"
        />
        <NumericField
          label="Quantidade ingerida (total)"
          unit={INGESTED_AMOUNT_RANGE.unit}
          range={INGESTED_AMOUNT_RANGE}
          value={amount}
          onValueChange={setAmount}
          placeholder="0"
          hint="Some todos os comprimidos ou a dose total, em mg."
        />
      </div>
      {assessment ? (
        <div
          role="status"
          aria-live="polite"
          data-tone={tone}
          className={cn('flex flex-col gap-1.5 rounded-lg px-4 py-3', toneBg[tone])}
        >
          <p className={cn('text-[0.9375rem]', ink)}>
            Dose ingerida:{' '}
            <span className="text-2xl font-semibold tabular-nums">
              {formatIngestedDose(assessment)}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}>
              {toxicDoseBandText(assessment)}
            </span>
            <span className={cn('text-sm tabular-nums', ink)}>
              {toxicDosePercentText(assessment)}
            </span>
          </p>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
        >
          Informe peso e quantidade para comparar com a dose tóxica.
        </div>
      )}
      <CopyToChartButton text={assessment ? buildToxicDoseChartNote(assessment) : null} />
    </section>
  );
}

function DrugCard({ entry, onClear }: { entry: ToxicDoseEntry; onClear: () => void }) {
  return (
    <article
      aria-labelledby="dose-toxica-medicamento"
      className="flex flex-col gap-4 rounded-lg border border-border px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="dose-toxica-medicamento" className="text-xl font-semibold text-foreground">
            {entry.name}
          </h2>
          {entry.aliases.length > 0 ? (
            <p className="text-sm text-muted-foreground">{entry.aliases.join(', ')}</p>
          ) : null}
          {entry.delayedRelease ? <Badge variant="gray">Liberação retardada</Badge> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Trocar de medicamento"
          onClick={onClear}
          className="size-11 max-sm:size-11"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <dl className="flex flex-col divide-y divide-border text-[0.9375rem]">
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted-foreground">Dose tóxica</dt>
          <dd className="font-semibold text-foreground tabular-nums">{formatToxicDose(entry)}</dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted-foreground">Meia-vida</dt>
          <dd className="font-semibold text-foreground">{entry.halfLife}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Esta entrada: {entryReviewText(entry)}.</p>
      {/* A chave zera peso e quantidade ao trocar de medicamento. */}
      <DoseCalculator key={entry.id} entry={entry} />
    </article>
  );
}

/**
 * Doses tóxicas (CC-324): busca entre os 242 medicamentos do Tox Path legado
 * por nome ou sinônimo e, escolhido um, compara a dose ingerida (mg/kg) com
 * a dose tóxica de referência e mostra a meia-vida.
 */
export function ToxicDoseLookup() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ToxicDoseEntry | null>(null);
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchToxicDoses(deferredQuery), [deferredQuery]);
  const searching = deferredQuery.trim().length >= TOXIC_DOSE_MIN_QUERY;

  return (
    <div className="flex flex-col gap-5">
      <ToolSearchField
        value={query}
        onChange={(value) => {
          setQuery(value);
          setSelected(null);
        }}
        label="Buscar medicamento por nome ou sinônimo"
        placeholder="Buscar (ex.: paracetamol, rivotril)"
      />

      {selected ? (
        <DrugCard
          entry={selected}
          onClear={() => {
            setSelected(null);
            setQuery('');
          }}
        />
      ) : searching ? (
        <section aria-label="Resultados da busca" className="flex flex-col gap-1">
          {results.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Nenhum medicamento encontrado para “{deferredQuery.trim()}”.
            </p>
          ) : (
            <>
              <ul className="flex flex-col">
                {results.slice(0, MAX_RESULTS).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(entry);
                        setQuery(entry.name);
                      }}
                      className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {entry.name}
                        </span>
                        {entry.aliases.length > 0 ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.aliases.join(', ')}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatToxicDose(entry)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {results.length > MAX_RESULTS ? (
                <p className="px-2 text-xs text-muted-foreground">
                  Mostrando {MAX_RESULTS} de {results.length}. Digite mais letras para refinar.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          Digite o nome do medicamento para consultar a dose tóxica. Base com {TOXIC_DOSES.length}{' '}
          medicamentos.
        </p>
      )}

      <ContentProvenanceNote provenance={TOXIC_DOSES_PROVENANCE} />
    </div>
  );
}
