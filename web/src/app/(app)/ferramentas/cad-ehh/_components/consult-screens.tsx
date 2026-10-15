'use client';

import {
  ABDOMINAL_PAIN_ALERT,
  ANION_GAP_NOTE,
  BLOOD_GAS_NOTE,
  CORRECTED_SODIUM_NOTE,
  DIFFERENTIAL_DIAGNOSIS,
  DKA_CRITERIA,
  DKA_CRITERIA_NOTE,
  EUGLYCEMIC_DKA,
  FREE_WATER_DEFICIT_NOTE,
  HHS_CRITERIA,
  HHS_NOTE,
  KETONURIA_DISCORDANCE,
  MAINTENANCE_FLUID,
  MENTAL_HEALTH_SCREENING,
  PITFALLS,
  PRECIPITANT_INTRO,
  PRECIPITANTS,
  REFERENCES,
  SGLT2_NOTE,
  UNITS_NOTE,
  WHEN_TO_SUSPECT,
} from '@clinical-tools/cad-ehh/content';
import type { Sex } from '@clinical-tools/cad-ehh/calc';
import { isHhsTrack } from '@clinical-tools/cad-ehh/roteiro';
import {
  ALL_THREE_COMPONENTS,
  ANION_GAP_HIGH_ABOVE,
  ANION_GAP_TEXT,
  FORMULAS,
  MISSING,
} from '@clinical-tools/cad-ehh/screen-text';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import { formatDecimal } from '@clinical-tools/numbers';
import { Disclosure } from '@/components/ui/disclosure';
import {
  BigValue,
  BulletList,
  ChoiceButtons,
  CheckItem,
  Hint,
  Paragraphs,
  SimpleTable,
  ToneCallout,
} from './parts';
import type { CadEhhScreenProps } from './step-props';

const SEX_OPTIONS: readonly { id: Sex; label: string }[] = [
  { id: 'M', label: 'Homem' },
  { id: 'F', label: 'Mulher' },
];

function Formula({ children }: { children: string }) {
  return <p className="font-mono text-[0.8125rem] text-foreground">{children}</p>;
}

/** Reconhecimento: critérios, alertas e diagnóstico diferencial (consulta). */
export function RecognitionScreen() {
  return (
    <div className="flex flex-col gap-4">
      <Disclosure title="1.1 Quando suspeitar">
        <div className="flex flex-col gap-3">
          <Paragraphs texts={WHEN_TO_SUSPECT} />
          <ToneCallout tone="attention" title="Dor abdominal">
            {stripSourceTags(ABDOMINAL_PAIN_ALERT)}
          </ToneCallout>
        </div>
      </Disclosure>

      {/* A 1.2 vem antes dos critérios diagnósticos, como a spec do ANY exige. */}
      <ToneCallout tone="critical" title="1.2 CAD euglicêmica">
        <Paragraphs texts={EUGLYCEMIC_DKA} />
      </ToneCallout>

      <div className="flex flex-col gap-1">
        <Disclosure title="1.3 Critérios diagnósticos — CAD">
          <div className="flex flex-col gap-3">
            <p className="text-[0.9375rem] text-foreground">{ALL_THREE_COMPONENTS}</p>
            <SimpleTable
              caption="Critérios diagnósticos da CAD"
              rows={DKA_CRITERIA.map(({ axis, criterion }) => [
                <span key="axis" className="font-medium">
                  {axis}
                </span>,
                stripSourceTags(criterion),
              ])}
            />
            {/*
              Esta nota fica com as marcas: "[ADA] aceita…" é o sujeito da
              frase, e sem ele ("aceita pH <7,30…") o texto do ANY perde o sentido.
            */}
            <Hint>{DKA_CRITERIA_NOTE}</Hint>
            <p className="text-[0.9375rem] text-foreground">{stripSourceTags(BLOOD_GAS_NOTE)}</p>
            <Hint>{stripSourceTags(UNITS_NOTE)}</Hint>
          </div>
        </Disclosure>
      </div>

      <ToneCallout tone="attention" title="1.4 Discordância da cetonúria">
        <Paragraphs texts={KETONURIA_DISCORDANCE} />
      </ToneCallout>

      <div className="flex flex-col gap-1">
        <Disclosure title="Critérios do EHH — referência">
          <div className="flex flex-col gap-2">
            <BulletList items={HHS_CRITERIA} />
            <p className="text-[0.9375rem] text-foreground">{stripSourceTags(HHS_NOTE)}</p>
          </div>
        </Disclosure>
        <Disclosure title="1.7 Diagnóstico diferencial">
          <Paragraphs texts={DIFFERENTIAL_DIAGNOSIS} />
        </Disclosure>
      </div>
    </div>
  );
}

/** Calculadoras do roteiro, sobre o painel de exames do passo 3. */
export function CalculatorsScreen({ state, dispatch, guidance }: CadEhhScreenProps) {
  const { anionGap, correctedNa, maintenance, effectiveOsmolality, freeWaterDeficit } = guidance;
  const high = anionGap !== null && anionGap > ANION_GAP_HIGH_ABOVE;
  return (
    <div className="flex flex-col gap-2">
      <Disclosure
        title="Ânion-gap"
        meta={anionGap !== null ? `${anionGap} mEq/L` : undefined}
        defaultOpen
      >
        <div className="flex flex-col gap-2.5">
          <Formula>{FORMULAS.anionGap}</Formula>
          {anionGap !== null ? (
            <ToneCallout tone={high ? 'attention' : 'neutral'} title={`${anionGap} mEq/L`}>
              {high ? ANION_GAP_TEXT.high : ANION_GAP_TEXT.normal}
            </ToneCallout>
          ) : (
            <Hint>{MISSING.anionGap}</Hint>
          )}
          <Hint>{stripSourceTags(ANION_GAP_NOTE)}</Hint>
          <Hint>{stripSourceTags(UNITS_NOTE)}</Hint>
        </div>
      </Disclosure>

      <Disclosure
        title="Sódio corrigido"
        meta={correctedNa !== null ? `${formatDecimal(correctedNa, 1)} mEq/L` : undefined}
        defaultOpen
      >
        <div className="flex flex-col gap-2.5">
          <Formula>{FORMULAS.correctedSodium}</Formula>
          {correctedNa !== null && maintenance !== null ? (
            <ToneCallout tone="neutral" title={`${formatDecimal(correctedNa, 1)} mEq/L`}>
              {MAINTENANCE_FLUID[maintenance]}
            </ToneCallout>
          ) : (
            <Hint>{MISSING.sodiumGlucose}</Hint>
          )}
          <Hint>{CORRECTED_SODIUM_NOTE}</Hint>
        </div>
      </Disclosure>

      <Disclosure
        title="Osmolaridade efetiva"
        meta={effectiveOsmolality !== null ? `${effectiveOsmolality} mOsm/kg` : undefined}
        defaultOpen
      >
        <div className="flex flex-col gap-2.5">
          <Formula>{FORMULAS.effectiveOsmolality}</Formula>
          <Hint>{FORMULAS.effectiveOsmolalityNote}</Hint>
          {effectiveOsmolality !== null ? (
            <BigValue
              label="Osmolaridade efetiva"
              value={`${effectiveOsmolality}`}
              unit="mOsm/kg"
            />
          ) : (
            <Hint>{MISSING.sodiumGlucose}</Hint>
          )}
        </div>
      </Disclosure>

      {/* Como no ANY, o déficit de água livre só aparece na trilha EHH ou mista. */}
      {isHhsTrack(state.track) ? (
        <Disclosure title="Déficit de água livre" meta="EHH" defaultOpen>
          <div className="flex flex-col gap-2.5">
            <Formula>{FORMULAS.totalBodyWater}</Formula>
            <Formula>{FORMULAS.freeWaterDeficit}</Formula>
            <ChoiceButtons
              label="Sexo"
              options={SEX_OPTIONS}
              value={state.sex}
              onChoose={(sex) => dispatch({ type: 'sexo', sex })}
              columns={2}
            />
            <CheckItem
              label="Idoso"
              checked={state.elderly}
              onToggle={() => dispatch({ type: 'idoso' })}
            />
            {freeWaterDeficit !== null ? (
              <BigValue
                label="Déficit estimado"
                value={formatDecimal(freeWaterDeficit, 1)}
                unit="L"
              />
            ) : (
              <Hint>{MISSING.freeWater}</Hint>
            )}
            <Hint>{FREE_WATER_DEFICIT_NOTE}</Hint>
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}

export function PitfallsScreen() {
  return (
    <div className="flex flex-col gap-1">
      {PITFALLS.map(({ title, texts }) => (
        <Disclosure key={title} title={title}>
          <Paragraphs texts={texts} />
        </Disclosure>
      ))}
    </div>
  );
}

export function PrecipitantScreen({ state, dispatch }: CadEhhScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-foreground">{stripSourceTags(PRECIPITANT_INTRO)}</p>
      <div className="flex flex-col gap-2">
        {PRECIPITANTS.map(({ id, label, note }) => {
          const checked = state.precipitants.includes(id);
          const description = stripSourceTags(note);
          return (
            <div key={id} className="flex flex-col gap-2">
              <CheckItem
                label={label}
                description={description || undefined}
                checked={checked}
                onToggle={() => dispatch({ type: 'precipitante', id })}
              />
              {id === 'isglt2' && checked ? (
                <ToneCallout tone="attention" title="Inibidor de SGLT2">
                  <Paragraphs texts={SGLT2_NOTE} />
                </ToneCallout>
              ) : null}
            </div>
          );
        })}
      </div>
      <ToneCallout tone="neutral" title="Rastreio de saúde mental">
        {stripSourceTags(MENTAL_HEALTH_SCREENING)}
      </ToneCallout>
    </div>
  );
}

export function ReferencesScreen() {
  return (
    <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-foreground">
      {REFERENCES.map(({ text, url }) => (
        <li key={text} className="text-pretty">
          {text}{' '}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-link underline"
            >
              {url}
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
