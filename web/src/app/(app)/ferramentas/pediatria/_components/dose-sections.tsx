'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { normalizeSearchText } from '@clinical-tools/catalog';
import { airwayEquipment } from '@clinical-tools/pediatrics/broselow';
import { BOLUS_GROUPS, type BolusGroup } from '@clinical-tools/pediatrics/bolus-drugs';
import type { BolusDrug } from '@clinical-tools/pediatrics/bolus';
import {
  INFUSION_CATEGORIES,
  PEDIATRIC_INFUSIONS,
  WEIGHT_BAND_LABEL,
  weightBand,
} from '@clinical-tools/pediatrics/infusions';
import { PediatricDrugCard } from '@/components/domain/clinical-tools/pediatrics/pediatric-drug-card';
import { PediatricInfusionCard } from '@/components/domain/clinical-tools/pediatrics/pediatric-infusion-card';
import { ToolCollapsible } from '@/components/domain/clinical-tools/pediatrics/tool-collapsible';
import { BroselowSwatch } from '@/components/domain/clinical-tools/pediatrics/broselow-picker';
import { SectionHeader } from '@/components/layout/page-header';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { usePediatricSession } from './pediatric-session';

/** Peso e idade em uso, como o cartão de droga espera. */
export function useDoseContext() {
  const { patient } = usePediatricSession();
  const kg = patient.weight.status === 'pronto' ? patient.weight.kg : null;
  const ageYears = patient.age.status === 'pronto' ? patient.age.years : null;
  return { kg, ageYears, ageInvalid: patient.age.status === 'invalido' };
}

function SearchField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="search"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 text-base max-sm:h-11 md:text-sm"
      />
    </div>
  );
}

/** Via aérea e equipamentos pela cor de Broselow em uso (CC-319). */
export function AirwaySection() {
  const { patient } = usePediatricSession();
  const { weight } = patient;
  const equipment = weight.status === 'pronto' ? airwayEquipment(weight.color) : null;
  const items = equipment
    ? [
        { label: 'Tubo traqueal', value: equipment.tube, unit: 'mm, com cuff' },
        { label: 'Fixação', value: equipment.fixation, unit: 'cm na gengiva' },
        { label: 'Lâmina', value: equipment.blade, unit: '' },
        { label: 'Máscara laríngea', value: equipment.laryngealMask, unit: 'tamanho' },
        { label: 'Sonda de aspiração', value: equipment.suctionCatheter, unit: 'French' },
        { label: 'Bougie', value: equipment.bougie, unit: 'French' },
      ]
    : [];

  return (
    <section
      id="via-aerea"
      aria-labelledby="pediatria-via-aerea"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={<span id="pediatria-via-aerea">Via aérea e equipamentos</span>}
        description={
          weight.status === 'pronto' ? (
            <span className="flex items-center gap-1.5">
              <BroselowSwatch colorKey={weight.color.key} />
              Faixa {weight.color.name} da fita de Broselow
            </span>
          ) : undefined
        }
      />
      {equipment ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-0.5 rounded-md bg-surface-subtle px-3 py-2"
            >
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-lg font-semibold text-foreground tabular-nums">
                {item.value}{' '}
                {item.unit ? (
                  <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Informe o peso ou a cor para ver o material.
        </p>
      )}
    </section>
  );
}

function matches(drug: BolusDrug, query: string): boolean {
  return normalizeSearchText(`${drug.name} ${drug.presentation}`).includes(query);
}

function GroupBody({ group, drugs }: { group: BolusGroup; drugs: readonly BolusDrug[] }) {
  const { kg, ageYears, ageInvalid } = useDoseContext();
  return (
    <>
      {group.notice ? (
        <Callout tone="orange" className="text-[0.8125rem]">
          {group.notice}
        </Callout>
      ) : null}
      {drugs.map((drug) => (
        <PediatricDrugCard
          key={drug.id}
          drug={drug}
          kg={kg}
          ageYears={ageYears}
          ageInvalid={ageInvalid}
        />
      ))}
    </>
  );
}

/** As 65 drogas em bolus em nove grupos, com busca por nome (CC-319). */
export function BolusSection() {
  const [query, setQuery] = useState('');
  const deferred = normalizeSearchText(useDeferredValue(query));
  const filtered = useMemo(
    () =>
      BOLUS_GROUPS.map((group) => ({
        group,
        drugs:
          deferred === '' ? group.drugs : group.drugs.filter((drug) => matches(drug, deferred)),
      })).filter(({ drugs }) => drugs.length > 0),
    [deferred],
  );

  return (
    <section
      id="doses"
      aria-labelledby="pediatria-doses"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={<span id="pediatria-doses">Doses em bolus</span>}
        count={BOLUS_GROUPS.reduce((total, group) => total + group.drugs.length, 0)}
      />
      <SearchField
        id="pediatria-busca-droga"
        label="Buscar droga em bolus"
        value={query}
        onChange={setQuery}
        placeholder="Buscar droga (ex.: midazolam, adrenalina)"
      />
      {deferred !== '' ? (
        filtered.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            Nenhuma droga encontrada para “{query.trim()}”.
          </p>
        ) : (
          filtered.map(({ group, drugs }) => (
            <section key={group.id} aria-label={group.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
              <GroupBody group={group} drugs={drugs} />
            </section>
          ))
        )
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {filtered.map(({ group, drugs }) => (
            <ToolCollapsible key={group.id} title={group.title} meta={drugs.length}>
              <GroupBody group={group} drugs={drugs} />
            </ToolCollapsible>
          ))}
        </div>
      )}
    </section>
  );
}

/** As 16 infusões contínuas, na faixa de diluição do peso em uso (CC-319). */
export function InfusionSection() {
  const { kg } = useDoseContext();
  const [query, setQuery] = useState('');
  const deferred = normalizeSearchText(useDeferredValue(query));
  const visible = PEDIATRIC_INFUSIONS.filter(
    (infusion) => deferred === '' || normalizeSearchText(infusion.name).includes(deferred),
  );

  return (
    <section
      id="infusoes"
      aria-labelledby="pediatria-infusoes"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <SectionHeader
        title={<span id="pediatria-infusoes">Infusões contínuas</span>}
        count={PEDIATRIC_INFUSIONS.length}
        description={
          kg === null
            ? 'Diluição em três faixas de peso: < 15 kg, 15–40 kg e > 40 kg.'
            : `Diluição da faixa ${WEIGHT_BAND_LABEL[weightBand(kg)]}.`
        }
      />
      <SearchField
        id="pediatria-busca-infusao"
        label="Buscar infusão"
        value={query}
        onChange={setQuery}
        placeholder="Buscar infusão (ex.: epinefrina)"
      />
      {INFUSION_CATEGORIES.map((category) => {
        const infusions = visible.filter((infusion) => infusion.category === category.id);
        if (infusions.length === 0) return null;
        return (
          <section key={category.id} aria-label={category.label} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{category.label}</h3>
            {infusions.map((infusion) => (
              <PediatricInfusionCard key={infusion.id} infusion={infusion} kg={kg} />
            ))}
          </section>
        );
      })}
      {visible.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">
          Nenhuma infusão encontrada para “{query.trim()}”.
        </p>
      ) : null}
    </section>
  );
}
