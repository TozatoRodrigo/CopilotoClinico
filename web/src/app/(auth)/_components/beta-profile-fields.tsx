'use client';

import {
  BETA_CITY_TYPES,
  BETA_CITY_TYPE_LABELS,
  BETA_FACILITY_TYPES,
  BETA_FACILITY_TYPE_LABELS,
  BETA_TRAINING_LABELS,
  BETA_TRAINING_VALUES,
  BRAZIL_UFS,
  type BetaProfile,
} from '@contracts/beta';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldError } from './auth-ui';
import { OptionCard } from './option-card';

export type BetaProfileDraft = Partial<BetaProfile>;

export type BetaProfileErrors = Partial<Record<keyof BetaProfile, string>>;

const FIELD_MESSAGES: Record<keyof BetaProfile, string> = {
  training: 'Escolha a sua formação.',
  facilityType: 'Escolha onde você dá plantão.',
  uf: 'Escolha a UF do plantão.',
  cityType: 'Escolha o tipo de cidade.',
};

/** O perfil completo, ou os erros de cada campo que falta. */
export function validateBetaProfile(
  draft: BetaProfileDraft,
): { profile: BetaProfile; errors: null } | { profile: null; errors: BetaProfileErrors } {
  const { training, facilityType, uf, cityType } = draft;
  if (training && facilityType && uf && cityType) {
    return { profile: { training, facilityType, uf, cityType }, errors: null };
  }
  const errors: BetaProfileErrors = {};
  for (const key of Object.keys(FIELD_MESSAGES) as (keyof BetaProfile)[]) {
    if (!draft[key]) errors[key] = FIELD_MESSAGES[key];
  }
  return { profile: null, errors };
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

/**
 * CC-702 — perfil mínimo do participante (o que a CC-701 registra:
 * formação, local e porte do serviço, UF e capital/interior). Obrigatório no
 * onboarding do beta; opcional na lista de espera.
 */
export function BetaProfileFields({
  idPrefix,
  value,
  onChange,
  errors = {},
  disabled = false,
}: {
  /** Prefixo dos ids: a lista de espera e o onboarding nunca dividem a página, mas os testes sim. */
  idPrefix: string;
  value: BetaProfileDraft;
  onChange: (next: BetaProfileDraft) => void;
  errors?: BetaProfileErrors;
  disabled?: boolean;
}) {
  function set<K extends keyof BetaProfile>(key: K, next: BetaProfile[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
          Formação
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BETA_TRAINING_VALUES.map((training) => (
            <OptionCard
              key={training}
              name={`${idPrefix}-training`}
              value={training}
              checked={value.training === training}
              onSelect={(next) => isOneOf(BETA_TRAINING_VALUES, next) && set('training', next)}
            >
              {BETA_TRAINING_LABELS[training]}
            </OptionCard>
          ))}
        </div>
        {errors.training && (
          <FieldError id={`${idPrefix}-training-error`}>{errors.training}</FieldError>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
          Onde você dá plantão
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BETA_FACILITY_TYPES.map((facilityType) => (
            <OptionCard
              key={facilityType}
              name={`${idPrefix}-facility`}
              value={facilityType}
              checked={value.facilityType === facilityType}
              onSelect={(next) => isOneOf(BETA_FACILITY_TYPES, next) && set('facilityType', next)}
            >
              {BETA_FACILITY_TYPE_LABELS[facilityType]}
            </OptionCard>
          ))}
        </div>
        {errors.facilityType && (
          <FieldError id={`${idPrefix}-facility-error`}>{errors.facilityType}</FieldError>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-uf`}>UF do plantão</Label>
        <Select
          value={value.uf ?? ''}
          onValueChange={(next) => isOneOf(BRAZIL_UFS, next) && set('uf', next)}
          disabled={disabled}
        >
          <SelectTrigger
            id={`${idPrefix}-uf`}
            className="w-32 data-[size=default]:h-10"
            aria-invalid={!!errors.uf}
            aria-describedby={errors.uf ? `${idPrefix}-uf-error` : undefined}
          >
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            {BRAZIL_UFS.map((uf) => (
              <SelectItem key={uf} value={uf}>
                {uf}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.uf && <FieldError id={`${idPrefix}-uf-error`}>{errors.uf}</FieldError>}
      </div>

      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">Cidade</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {BETA_CITY_TYPES.map((cityType) => (
            <OptionCard
              key={cityType}
              name={`${idPrefix}-city`}
              value={cityType}
              checked={value.cityType === cityType}
              onSelect={(next) => isOneOf(BETA_CITY_TYPES, next) && set('cityType', next)}
            >
              {BETA_CITY_TYPE_LABELS[cityType]}
            </OptionCard>
          ))}
        </div>
        {errors.cityType && (
          <FieldError id={`${idPrefix}-city-error`}>{errors.cityType}</FieldError>
        )}
      </fieldset>
    </div>
  );
}
