'use client';

import {
  ABDOMINAL_PAIN_ALERT,
  BLOOD_GAS_NOTE,
  CONSCIOUSNESS_OPTIONS,
  DKA_CRITERIA,
  ECG_NOTE,
  EUGLYCEMIC_DKA,
  INITIAL_PANEL,
  INITIAL_PANEL_NOTE,
  KETONURIA_DISCORDANCE,
  KETONURIA_OPTIONS,
  LAB_FIELDS,
  SUSPICION_DRIVEN_TESTS,
  VOLEMIA_ASSESSMENT,
  WHEN_TO_SUSPECT,
  type LabField,
} from '@clinical-tools/cad-ehh/content';
import { ALL_THREE_COMPONENTS, FIRST_HOUR_INTRO } from '@clinical-tools/cad-ehh/screen-text';
import { stripSourceTags } from '@clinical-tools/cad-ehh/sources';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Disclosure } from '@/components/ui/disclosure';
import {
  Block,
  BulletList,
  ChoiceButtons,
  Hint,
  LabInput,
  Paragraphs,
  SimpleTable,
  ToneCallout,
} from './parts';
import type { CadEhhScreenProps } from './step-props';

const FIELD = new Map(LAB_FIELDS.map((field) => [field.id, field]));

function labLabel(field: LabField, override?: string): string {
  return `${override ?? field.label}${field.required ? '' : ' · opcional'}`;
}

/** Campo do painel de exames, com a faixa do ANY. */
export function LabPanelInput({
  field,
  state,
  dispatch,
  label,
}: Pick<CadEhhScreenProps, 'state' | 'dispatch'> & { field: LabField; label?: string }) {
  return (
    <LabInput
      label={labLabel(field, label)}
      unit={field.unit}
      range={field}
      value={state.panel[field.id]}
      onChange={(raw) => dispatch({ type: 'digitar-exame', field: field.id, raw })}
    />
  );
}

function ConsciousnessChoice({ state, dispatch }: Pick<CadEhhScreenProps, 'state' | 'dispatch'>) {
  return (
    <Block title="Nível de consciência">
      <ChoiceButtons
        label="Nível de consciência"
        options={CONSCIOUSNESS_OPTIONS}
        value={state.consciousness}
        onChoose={(value) => dispatch({ type: 'consciencia', value })}
      />
    </Block>
  );
}

function KetonuriaAlert() {
  return (
    <ToneCallout tone="attention" title="A cetonúria pode enganar nas duas direções">
      <Paragraphs texts={[KETONURIA_DISCORDANCE[2], KETONURIA_DISCORDANCE[3]]} />
    </ToneCallout>
  );
}

/** Passo 1 — Reconhecer: nada aqui espera exame. */
export function RecognizeStep({
  state,
  dispatch,
  guidance,
  weightRaw,
  onWeightChange,
}: CadEhhScreenProps) {
  const glucose = FIELD.get('glicemia');
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.9375rem] text-pretty text-foreground">{FIRST_HOUR_INTRO}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <WeightField population="adulto" value={weightRaw} onValueChange={onWeightChange} />
        {glucose ? (
          <LabPanelInput
            field={glucose}
            label="Glicemia capilar"
            state={state}
            dispatch={dispatch}
          />
        ) : null}
      </div>
      <ConsciousnessChoice state={state} dispatch={dispatch} />

      {/* O alerta que justifica pedir a glicemia capilar logo de cara. */}
      {guidance.glucoseBelow200 ? (
        <ToneCallout tone="critical" title="Glicemia abaixo de 200 não descarta CAD">
          <Paragraphs texts={[EUGLYCEMIC_DKA[1], EUGLYCEMIC_DKA[2]]} />
        </ToneCallout>
      ) : null}

      <div className="flex flex-col gap-1">
        <Disclosure title="Quando suspeitar">
          <div className="flex flex-col gap-3">
            <Paragraphs texts={WHEN_TO_SUSPECT} />
            <ToneCallout tone="attention" title="Dor abdominal">
              {stripSourceTags(ABDOMINAL_PAIN_ALERT)}
            </ToneCallout>
          </div>
        </Disclosure>
        <Disclosure title="Avaliação de volemia">
          <Paragraphs texts={VOLEMIA_ASSESSMENT} />
        </Disclosure>
      </div>
    </div>
  );
}

/** Passo 3 — Confirmar: o que coletar e onde entram os resultados. */
export function ConfirmStep({ state, dispatch }: CadEhhScreenProps) {
  return (
    <div className="flex flex-col gap-5">
      <Block title="O que coletar">
        <BulletList items={INITIAL_PANEL} />
        <Hint>{INITIAL_PANEL_NOTE}</Hint>
      </Block>
      <ToneCallout tone="neutral" title="Sobre o eletrocardiograma">
        {stripSourceTags(ECG_NOTE)}
      </ToneCallout>
      <Disclosure title="Conforme suspeita clínica">
        <SimpleTable
          caption="Exames conforme a suspeita clínica"
          head={['Exame', 'Quando considerar']}
          rows={SUSPICION_DRIVEN_TESTS.map(({ test, trigger }) => [test, trigger])}
        />
      </Disclosure>

      <Block title="Resultados chegaram">
        {/*
          O ANY pede aqui todos os exames menos a glicemia (digitada no passo
          1). O campo da glicemia entra também aqui para quem chega pelo
          "Editar exames" sem passar pelo passo 1; é o mesmo dado.
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          {LAB_FIELDS.map((field) => (
            <LabPanelInput key={field.id} field={field} state={state} dispatch={dispatch} />
          ))}
        </div>
      </Block>
      <Block title="Cetonúria">
        <ChoiceButtons
          label="Cetonúria"
          options={KETONURIA_OPTIONS.map((id) => ({ id, label: id }))}
          value={state.ketonuria}
          onChoose={(value) => dispatch({ type: 'cetonuria', value })}
          columns={5}
        />
      </Block>

      <Disclosure title="Critérios diagnósticos — CAD">
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
          <p className="text-[0.9375rem] text-foreground">{stripSourceTags(BLOOD_GAS_NOTE)}</p>
        </div>
      </Disclosure>

      {state.ketonuria !== null ? <KetonuriaAlert /> : null}
    </div>
  );
}

export { ConsciousnessChoice, KetonuriaAlert };
