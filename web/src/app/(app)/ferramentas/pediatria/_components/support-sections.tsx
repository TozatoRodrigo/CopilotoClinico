'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CaretRight, Drop, Heartbeat, ListChecks } from '@phosphor-icons/react';
import { formatDecimal } from '@clinical-tools/numbers';
import { airwayEquipment } from '@clinical-tools/pediatrics/broselow';
import { PEDIATRIC_SCENARIOS } from '@clinical-tools/pediatrics/scenarios';
import {
  compressionDepth,
  CPR_PARAMETERS,
  defibrillationEnergy,
  fluidVolumes,
  IOT_CHECKLIST,
  MASSIVE_TRANSFUSION,
  minimumSystolicPressure,
  REVERSIBLE_CAUSES,
  TRANSFUSION_COMPONENTS,
  transfusionVolumes,
  VITAL_SIGN_AGES,
  VITAL_SIGNS,
} from '@clinical-tools/pediatrics/support';
import { SectionHeader } from '@/components/layout/page-header';
import { Callout } from '@/components/ui/callout';
import { cn } from '@/lib/utils';
import { usePediatricSession } from './pediatric-session';

export function scenarioHref(id: string): string {
  return `/ferramentas/pediatria/cenarios/${id}`;
}

function NeedsWeight({ children = 'Informe o peso para calcular.' }: { children?: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Bloco "rótulo, número grande, unidade" das telas de apoio. */
function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold text-foreground tabular-nums">
        {value}{' '}
        {unit ? <span className="text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </dd>
    </div>
  );
}

function useKg(): number | null {
  const { patient } = usePediatricSession();
  return patient.weight.status === 'pronto' ? patient.weight.kg : null;
}

/** Os sete cenários (CC-320): cada um abre só as drogas e infusões dele. */
export function ScenarioList() {
  return (
    <section
      id="cenarios"
      aria-labelledby="pediatria-cenarios"
      className="flex scroll-mt-20 flex-col gap-2"
    >
      <SectionHeader
        title={<span id="pediatria-cenarios">Cenários</span>}
        count={PEDIATRIC_SCENARIOS.length}
      />
      <ul className="flex flex-col">
        {PEDIATRIC_SCENARIOS.map((scenario) => (
          <li key={scenario.id}>
            <Link
              href={scenarioHref(scenario.id)}
              className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{scenario.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {scenario.description}
                </span>
              </span>
              <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** PCR pediátrica (CC-320): parâmetros de RCP, desfibrilação, cardioversão e 6H/6T. */
export function CprSection() {
  const kg = useKg();
  const energy = kg === null ? null : defibrillationEnergy(kg);
  return (
    <section id="pcr" aria-labelledby="pediatria-pcr" className="flex scroll-mt-20 flex-col gap-3">
      <SectionHeader
        title={
          <span id="pediatria-pcr" className="flex items-center gap-2">
            <Heartbeat className="size-[18px] text-muted-foreground" aria-hidden="true" />
            PCR pediátrica
          </span>
        }
        description="Parâmetros de RCP (PALS/AHA)."
      />
      <dl className="grid grid-cols-2 gap-2">
        <Figure label={CPR_PARAMETERS[0]?.label ?? ''} value={CPR_PARAMETERS[0]?.value ?? ''} />
        <Figure label="Profundidade" value={kg === null ? '—' : compressionDepth(kg)} />
        {CPR_PARAMETERS.slice(1).map((parameter) => (
          <div
            key={parameter.label}
            className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2"
          >
            <dt className="text-xs text-muted-foreground">{parameter.label}</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
              {parameter.value}
            </dd>
            {parameter.note ? (
              <dd className="text-xs text-muted-foreground">{parameter.note}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      {energy ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Figure label="1ª desfibrilação (2 J/kg)" value={String(energy.first)} unit="J" />
          <Figure label="2ª desfibrilação (4 J/kg)" value={String(energy.second)} unit="J" />
          <div className="col-span-2 flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">Cardioversão (0,5–1 J/kg)</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
              {energy.cardioversion[0]}–{energy.cardioversion[1]}{' '}
              <span className="text-xs font-normal text-muted-foreground">J</span>
            </dd>
            <dd className="text-xs text-muted-foreground">
              Refratária: 2 J/kg ({energy.refractory} J)
            </dd>
          </div>
        </dl>
      ) : (
        <NeedsWeight>Informe o peso para calcular a energia do choque.</NeedsWeight>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['h', 't'] as const).map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              Causas reversíveis: 6 {group.toUpperCase()}
            </h3>
            <ul className="flex flex-col divide-y divide-border text-sm text-foreground">
              {REVERSIBLE_CAUSES[group].map((cause) => (
                <li key={cause} className="py-1.5">
                  {cause}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Checklist de intubação (CC-320), com o material da cor em uso ao lado. */
export function IntubationChecklist({ className }: { className?: string }) {
  const { patient } = usePediatricSession();
  const equipment =
    patient.weight.status === 'pronto' ? airwayEquipment(patient.weight.color) : null;
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const baseId = useId();

  return (
    <ul
      className={cn(
        'flex flex-col divide-y divide-border rounded-lg border border-border',
        className,
      )}
    >
      {IOT_CHECKLIST.map((item, index) => {
        const id = `${baseId}-${index}`;
        const value = item.equipment && equipment ? equipment.checklist[item.equipment] : null;
        return (
          <li key={item.text}>
            <label
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-foreground"
            >
              <input
                id={id}
                type="checkbox"
                checked={checked.has(index)}
                onChange={() =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
                className="size-5 shrink-0 accent-foreground"
              />
              <span className="min-w-0 flex-1">{item.text}</span>
              {value ? <span className="shrink-0 font-semibold tabular-nums">{value}</span> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function ChecklistSection() {
  return (
    <section
      id="checklist-iot"
      aria-labelledby="pediatria-checklist"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={
          <span id="pediatria-checklist" className="flex items-center gap-2">
            <ListChecks className="size-[18px] text-muted-foreground" aria-hidden="true" />
            Checklist de intubação
          </span>
        }
      />
      <IntubationChecklist />
    </section>
  );
}

/** Fluidos e volumes (CC-320): bolus de 20 mL/kg, Holliday-Segar e volemia. */
export function FluidFigures() {
  const kg = useKg();
  if (kg === null) return <NeedsWeight />;
  const fluids = fluidVolumes(kg);
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Figure
        label="Bolus de cristaloide (20 mL/kg)"
        value={formatDecimal(fluids.bolusMl, 0)}
        unit="mL"
      />
      <Figure
        label="Manutenção (Holliday-Segar)"
        value={formatDecimal(fluids.maintenanceMlPerHour, 0)}
        unit="mL/h"
      />
      <Figure
        label="Volemia estimada (80 mL/kg)"
        value={formatDecimal(fluids.bloodVolumeMl, 0)}
        unit="mL"
      />
    </dl>
  );
}

export function FluidsSection() {
  const kg = useKg();
  return (
    <section
      id="fluidos"
      aria-labelledby="pediatria-fluidos"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={
          <span id="pediatria-fluidos" className="flex items-center gap-2">
            <Drop className="size-[18px] text-muted-foreground" aria-hidden="true" />
            Fluidos e transfusão
          </span>
        }
      />
      <FluidFigures />
      {kg === null ? null : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {TRANSFUSION_COMPONENTS.map((component) => {
              const [low, high] = transfusionVolumes(kg, component);
              return (
                <Figure
                  key={component.id}
                  label={`${component.name} (${component.dose})`}
                  value={`${formatDecimal(low, 0)}–${formatDecimal(high, 0)}`}
                  unit="mL"
                />
              );
            })}
          </dl>
          <Callout tone="gray" title={MASSIVE_TRANSFUSION.title}>
            {MASSIVE_TRANSFUSION.trigger} {MASSIVE_TRANSFUSION.ratio} Volemia estimada (80 mL/kg):{' '}
            {formatDecimal(fluidVolumes(kg).bloodVolumeMl, 0)} mL.
          </Callout>
        </>
      )}
    </section>
  );
}

/** Sinais vitais por idade e PAS mínima (CC-320). */
export function VitalSignsSection() {
  const { patient } = usePediatricSession();
  const ageYears = patient.age.status === 'pronto' ? patient.age.years : null;
  return (
    <section
      id="sinais-vitais"
      aria-labelledby="pediatria-sinais"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader title={<span id="pediatria-sinais">Sinais vitais por idade</span>} />
      <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-foreground">
        {ageYears === null ? (
          <span className="text-muted-foreground">Informe a idade para estimar a PAS mínima.</span>
        ) : (
          <>
            PAS mínima estimada:{' '}
            <strong className="font-semibold tabular-nums">
              {minimumSystolicPressure(ageYears)} mmHg
            </strong>
            {patient.age.status === 'pronto' && patient.age.source === 'broselow' ? (
              <span className="text-muted-foreground"> (idade da cor de Broselow)</span>
            ) : null}
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Frequência cardíaca e respiratória normais por idade
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground"
              >
                Parâmetro
              </th>
              {VITAL_SIGN_AGES.map((age) => (
                <th
                  key={age}
                  scope="col"
                  className="border-b border-border px-2 py-1.5 text-center font-medium whitespace-nowrap text-muted-foreground"
                >
                  {age}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VITAL_SIGNS.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-border px-2 py-1.5 text-left font-normal text-muted-foreground"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={VITAL_SIGN_AGES[index]}
                    className="border-b border-border px-2 py-1.5 text-center text-foreground tabular-nums"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        PAS mínima = 70 + (2 × idade). A partir de 10 anos, considera-se 90 mmHg como piso.
      </p>
    </section>
  );
}
