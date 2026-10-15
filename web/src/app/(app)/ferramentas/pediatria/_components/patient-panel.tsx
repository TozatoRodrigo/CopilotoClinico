'use client';

import { ArrowCounterClockwise, Baby } from '@phosphor-icons/react';
import { formatCompact } from '@clinical-tools/numbers';
import { describeBroselowAge } from '@clinical-tools/pediatrics/broselow';
import {
  AGE_RANGE,
  WEIGHT_SOURCE_LABEL,
  type PediatricPatient,
} from '@clinical-tools/pediatrics/weight';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import {
  BroselowPicker,
  BroselowSwatch,
} from '@/components/domain/clinical-tools/pediatrics/broselow-picker';
import { WeightField } from '@/components/domain/clinical-tools/weight-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { usePediatricSession } from './pediatric-session';

function WeightSummary({ patient }: { patient: PediatricPatient }) {
  const { weight } = patient;
  if (weight.status === 'vazio') {
    return (
      <span className="text-muted-foreground">Informe o peso ou escolha a cor de Broselow.</span>
    );
  }
  if (weight.status === 'invalido') {
    return (
      <span className="font-medium text-destructive">
        Peso fora da faixa aceita: nenhuma dose é calculada.
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        Peso em uso:{' '}
        <strong className="text-base font-semibold tabular-nums">
          {formatCompact(weight.kg)} kg
        </strong>
      </span>
      <Badge variant={weight.estimated ? 'warning' : 'gray'}>
        {weight.estimated ? 'Estimado' : 'Aferido'}
      </Badge>
      <span className="text-muted-foreground">{WEIGHT_SOURCE_LABEL[weight.source]}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <BroselowSwatch colorKey={weight.color.key} />
        Broselow {weight.color.name}
      </span>
    </span>
  );
}

function AgeSummary({ patient }: { patient: PediatricPatient }) {
  const { age, weight } = patient;
  if (age.status !== 'pronto') return null;
  if (age.source === 'broselow' && weight.status === 'pronto') {
    return (
      <span className="text-muted-foreground">
        Idade estimada pela cor: {describeBroselowAge(weight.color.ageMonths)}
      </span>
    );
  }
  return <span className="text-muted-foreground">Idade: {formatCompact(age.years)} anos</span>;
}

/**
 * Entrada da criança (CC-319): peso aferido, cor de Broselow e idade. O
 * resumo diz de onde veio o peso em uso e marca o que é estimativa; neonato
 * ganha o alerta do ANY, em forma de sugestão.
 */
export function PatientPanel() {
  const { inputs, patient, setWeight, setBroselow, setAge, reset } = usePediatricSession();
  const { weight } = patient;
  const hasInput = inputs.weight !== '' || inputs.broselow !== null || inputs.age !== '';

  return (
    <section aria-label="Peso e idade da criança" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <WeightField population="pediatrico" value={inputs.weight} onValueChange={setWeight} />
          <NumericField
            label="Idade"
            unit="anos"
            range={AGE_RANGE}
            value={inputs.age}
            onValueChange={setAge}
            placeholder="4"
            hint="Para as drogas por idade. Use fração para meses: 0,5 = 6 meses."
          />
        </div>
        <BroselowPicker
          value={inputs.broselow}
          onChange={setBroselow}
          suggested={
            weight.status === 'pronto' && weight.source === 'medido' ? weight.color.key : null
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-subtle px-3 py-2 text-sm">
        <p role="status" aria-live="polite" className="flex flex-col gap-1">
          <WeightSummary patient={patient} />
          <AgeSummary patient={patient} />
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!hasInput}>
          <ArrowCounterClockwise aria-hidden="true" />
          Limpar
        </Button>
      </div>

      {weight.status === 'pronto' && weight.neonatal ? (
        <Callout tone="orange" icon={<Baby weight="fill" />} title="Neonato">
          Peso abaixo de 3 kg: considere o protocolo específico de reanimação neonatal.
        </Callout>
      ) : null}
    </section>
  );
}
