'use client';

import {
  CRASH_ITEMS,
  CRASH_LETTERS,
  INDICATIONS,
  LEMON_ITEMS,
  NOTICES,
  POPULATIONS,
  ROMAN_ITEMS,
  SEXES,
} from '@clinical-tools/airway/content';
import {
  AIRWAY_RANGES,
  formatShockIndex,
  SHOCK_INDEX_MARKS_H_ABOVE,
  type VitalAlert,
} from '@clinical-tools/airway/vitals';
import { formatDecimal } from '@clinical-tools/numbers';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Button } from '@/components/ui/button';
import { toneBg, toneInk, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { Block, CheckList, CheckRow, Mnemonic, NoticeCallout, OptionGroup } from './airway-parts';
import type { StepProps } from './step-props';

/** Passo 1 — indicação de IOT. */
export function IndicationStep({ state, view, dispatch }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <Block title="Selecione a(s) indicação(ões)">
        <CheckList>
          {INDICATIONS.map((item) => (
            <CheckRow
              key={item.id}
              title={item.title}
              detail={item.detail}
              checked={state.indications.includes(item.id)}
              onToggle={() => dispatch({ type: 'toggle-indication', id: item.id })}
            />
          ))}
        </CheckList>
      </Block>
      {view.hasIndication ? <NoticeCallout notice={NOTICES.pcr} /> : null}
    </div>
  );
}

/** Aviso de FC ou PAS no lugar da dica do campo (taquicardia, hipotensão…). */
function VitalHint({ alert }: { alert: VitalAlert }) {
  return (
    <span
      className={cn('rounded-[3px] px-1.5 py-0.5 font-medium', toneTag[RESULT_TONE[alert.tone]])}
    >
      {alert.label}
    </span>
  );
}

/** Passo 2 — CRASH (VAD fisiológica), com a calculadora de índice de choque. */
export function CrashStep({ state, view, dispatch }: StepProps) {
  const { shockIndex } = view;
  const tone = shockIndex ? RESULT_TONE[shockIndex.tone] : null;
  return (
    <div className="flex flex-col gap-5">
      <Block
        title="O paciente tolera apneia e indução?"
        description="Fatores de risco fisiológico:"
      >
        <Mnemonic
          name="CRASH"
          letters={CRASH_LETTERS}
          active={CRASH_LETTERS.map((letter) => state.crash.includes(letter))}
          tone="red"
        />
        <CheckList>
          {CRASH_ITEMS.map((item) => (
            <CheckRow
              key={item.id}
              title={item.title}
              detail={item.detail}
              checked={state.crash.includes(item.id)}
              onToggle={() => dispatch({ type: 'toggle-crash', letter: item.id })}
            >
              <div className="flex flex-col gap-1 text-sm text-foreground">
                <span className="font-medium">Sugestões</span>
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-muted-foreground">
                  {item.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            </CheckRow>
          ))}
        </CheckList>
      </Block>

      <Block
        title="Índice de choque"
        description={`FC ÷ PAS. Acima de ${formatDecimal(SHOCK_INDEX_MARKS_H_ABOVE, 1)} marca o H (hipotensão/hipovolemia).`}
      >
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            id="via-aerea-fc"
            label="FC"
            unit={AIRWAY_RANGES.heartRate.unit}
            range={AIRWAY_RANGES.heartRate}
            value={state.heartRate}
            onValueChange={(raw) => dispatch({ type: 'set-heart-rate', raw })}
            placeholder="110"
            hint={view.heartRateAlert ? <VitalHint alert={view.heartRateAlert} /> : undefined}
          />
          <NumericField
            id="via-aerea-pas"
            label="PAS"
            unit={AIRWAY_RANGES.systolic.unit}
            range={AIRWAY_RANGES.systolic}
            value={state.systolic}
            onValueChange={(raw) => dispatch({ type: 'set-systolic', raw })}
            placeholder="90"
            hint={view.systolicAlert ? <VitalHint alert={view.systolicAlert} /> : undefined}
          />
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {shockIndex && tone ? (
            <div
              data-slot="shock-index"
              data-tone={tone}
              className={cn(
                'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md px-3 py-2',
                toneBg[tone],
              )}
            >
              <span
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  tone === 'gray' ? 'text-foreground' : toneInk[tone],
                )}
              >
                {formatShockIndex(shockIndex)}
              </span>
              <span
                className={cn('rounded-[3px] px-1.5 py-0.5 text-sm font-medium', toneTag[tone])}
              >
                {shockIndex.label}
              </span>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Preencha FC e PAS para ver o índice de choque.
            </p>
          )}
          {/* No ANY este aviso era um toast que a página nunca desenhava. */}
          {view.hAutoNotice ? <NoticeCallout notice={view.hAutoNotice} /> : null}
        </div>
      </Block>

      {view.crashCount > 0 ? <NoticeCallout notice={NOTICES.vadFisiologica} /> : null}
    </div>
  );
}

/** Passo 3 — VAD anatômica (LEMON e ROMAN), opcional. */
export function AnatomyStep({ state, view, dispatch }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Block title="Deseja avaliar preditores de VAD?" description="Avaliação de LEMON e ROMAN.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={state.vadAssessment === 'avaliar' ? 'default' : 'outline'}
            aria-pressed={state.vadAssessment === 'avaliar'}
            onClick={() => dispatch({ type: 'set-vad-assessment', value: 'avaliar' })}
          >
            Sim, avaliar
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={state.vadAssessment === 'sem-avaliar'}
            onClick={() => dispatch({ type: 'set-vad-assessment', value: 'sem-avaliar' })}
          >
            Continuar sem avaliar →
          </Button>
        </div>
      </Block>

      {state.vadAssessment === 'avaliar' ? (
        <>
          <Block title="LEMON" description="Preditores de laringoscopia difícil:">
            <Mnemonic
              name="LEMON"
              letters={LEMON_ITEMS.map(({ id }) => id)}
              active={LEMON_ITEMS.map(({ id }) => state.lemon.includes(id))}
              tone="orange"
            />
            <CheckList>
              {LEMON_ITEMS.map((item) => (
                <CheckRow
                  key={item.id}
                  title={item.title}
                  detail={item.detail}
                  checked={state.lemon.includes(item.id)}
                  onToggle={() => dispatch({ type: 'toggle-lemon', id: item.id })}
                />
              ))}
            </CheckList>
          </Block>
          <Block title="ROMAN" description="Preditores de ventilação com bolsa-máscara difícil:">
            <Mnemonic
              name="ROMAN"
              letters={ROMAN_ITEMS.map(({ id }) => id)}
              active={ROMAN_ITEMS.map(({ id }) => state.roman.includes(id))}
              tone="orange"
            />
            <CheckList>
              {ROMAN_ITEMS.map((item) => (
                <CheckRow
                  key={item.id}
                  title={item.title}
                  detail={item.detail}
                  checked={state.roman.includes(item.id)}
                  onToggle={() => dispatch({ type: 'toggle-roman', id: item.id })}
                />
              ))}
            </CheckList>
          </Block>
          <NoticeCallout
            notice={{
              tone: 'attention',
              title: 'Resumo da VAD anatômica',
              lines: [`LEMON: ${view.lemonCount}/5 | ROMAN: ${view.romanCount}/5`],
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** Passo 4 — dados do paciente: peso comum, altura, sexo e população. */
export function PatientStep({ state, view, dispatch, weight, onWeightChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <WeightField
          id="via-aerea-peso"
          population="adulto"
          value={weight}
          onValueChange={onWeightChange}
        />
        <NumericField
          id="via-aerea-altura"
          label="Altura (opcional)"
          unit={AIRWAY_RANGES.height.unit}
          range={AIRWAY_RANGES.height}
          value={state.height}
          onValueChange={(raw) => dispatch({ type: 'set-height', raw })}
          placeholder="170"
        />
      </div>
      <OptionGroup
        legend="Sexo biológico"
        options={SEXES}
        value={state.sex}
        onChange={(sex) => dispatch({ type: 'set-sex', sex })}
      />
      <OptionGroup
        legend="População"
        options={POPULATIONS}
        value={state.population}
        onChange={(population) => dispatch({ type: 'set-population', population })}
        columns={4}
      />
      {view.tube && view.weightKg !== null ? (
        <NoticeCallout
          notice={{
            tone: 'info',
            title: 'Tubo sugerido',
            lines: [
              `${view.tube} (${SEXES.find(({ id }) => id === state.sex)?.label.toLowerCase()})`,
            ],
          }}
        />
      ) : null}
    </div>
  );
}
