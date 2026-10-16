import {
  FACILITY_TYPE_LABELS,
  PRACTICE_SITE_LIMITS,
  SITE_SPECIALIST_LABELS,
} from '@/lib/practice-site-contract';
import type {
  EncounterContext,
  FacilityType,
  PracticeSite,
  PracticeSiteInput,
  SiteSpecialist,
} from '@/lib/types';

/**
 * CC-602 — o local de plantão no caso: funções puras usadas pelo caso novo,
 * pelo relato do caso e pelas Configurações. Ficam fora dos componentes para
 * o preenchimento do contexto ser testado sem tela.
 */

export const EMPTY_CONTEXT: EncounterContext = {
  hasCT: false,
  isSus: false,
  hasLab: false,
  hasICU: false,
};

/** Valor do seletor de local para "sem local declarado". */
export const NO_SITE = 'sem-local';

/** O local padrão do médico; `null` sem nenhum local salvo. */
export function defaultSite(sites: readonly PracticeSite[] | undefined): PracticeSite | null {
  return sites?.find((site) => site.isDefault) ?? sites?.[0] ?? null;
}

/**
 * O contexto do caso a partir de um local salvo: os recursos dele e uma
 * cópia do perfil (editar o perfil depois não muda o caso).
 */
export function contextFromSite(site: PracticeSite): EncounterContext {
  return {
    hasCT: site.hasCT,
    isSus: site.isSus,
    hasLab: site.hasLab,
    hasICU: site.hasICU,
    site: {
      siteId: site.id,
      name: site.name,
      facilityType: site.facilityType,
      specialists: [...site.specialists],
      referenceTravelMinutes: site.referenceTravelMinutes,
      referenceDistanceKm: site.referenceDistanceKm,
    },
  };
}

/** Sem local: os recursos marcados ficam, o local sai. */
export function withoutSite(context: EncounterContext): EncounterContext {
  return {
    hasCT: context.hasCT,
    isSus: context.isSus,
    hasLab: context.hasLab,
    hasICU: context.hasICU,
  };
}

/**
 * Contexto de um caso novo: o do caso-piloto, senão o do local padrão,
 * senão nada marcado (como antes do perfil).
 */
export function prefilledContext(
  sites: readonly PracticeSite[] | undefined,
  demoContext?: EncounterContext,
): EncounterContext {
  if (demoContext) return demoContext;
  const site = defaultSite(sites);
  return site ? contextFromSite(site) : EMPTY_CONTEXT;
}

/**
 * Contexto do relato: o que o caso já tem gravado (veio do local escolhido
 * ao criar o caso), ou o do caso-piloto. Caso antigo sem contexto, nada
 * marcado.
 */
export function caseContext(
  stored: EncounterContext | null | undefined,
  demoContext?: EncounterContext,
): EncounterContext {
  return demoContext ?? stored ?? EMPTY_CONTEXT;
}

/** Valor do seletor de local para um contexto. */
export function selectedSiteValue(context: EncounterContext): string {
  return context.site?.siteId ?? (context.site ? 'deste-caso' : NO_SITE);
}

const RESOURCE_SHORT_LABELS = { hasCT: 'TC', hasLab: 'laboratório', hasICU: 'UTI' } as const;

function joinWithE(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/** "UPA 24h porte I · sem TC e UTI · referência a 90 min" — o que a análise vai considerar. */
export function describeSite(
  site: Pick<PracticeSite, 'facilityType' | 'referenceTravelMinutes' | 'referenceDistanceKm'>,
  resources: Pick<EncounterContext, 'hasCT' | 'hasLab' | 'hasICU'>,
): string {
  const missing = (Object.keys(RESOURCE_SHORT_LABELS) as Array<keyof typeof RESOURCE_SHORT_LABELS>)
    .filter((key) => !resources[key])
    .map((key) => RESOURCE_SHORT_LABELS[key]);
  const parts: string[] = [FACILITY_TYPE_LABELS[site.facilityType]];
  parts.push(missing.length > 0 ? `sem ${joinWithE(missing)}` : 'com TC, laboratório e UTI');
  if (site.referenceTravelMinutes !== null) {
    parts.push(`referência a ${site.referenceTravelMinutes} min`);
  } else if (site.referenceDistanceKm !== null) {
    parts.push(`referência a ${site.referenceDistanceKm} km`);
  }
  return parts.join(' · ');
}

export function specialistsLabel(specialists: readonly SiteSpecialist[]): string {
  return specialists.length > 0
    ? specialists.map((specialist) => SITE_SPECIALIST_LABELS[specialist]).join(', ')
    : 'Nenhum especialista além do plantonista';
}

/** Valores do formulário: números ficam como texto até salvar. */
export interface SiteFormValues {
  name: string;
  facilityType: FacilityType;
  hasCT: boolean;
  hasLab: boolean;
  hasICU: boolean;
  isSus: boolean;
  specialists: SiteSpecialist[];
  referenceTravelMinutes: string;
  referenceDistanceKm: string;
  isDefault: boolean;
}

export function emptySiteForm(isFirst: boolean): SiteFormValues {
  return {
    name: '',
    facilityType: 'upa_porte_1',
    hasCT: false,
    hasLab: true,
    hasICU: false,
    isSus: true,
    specialists: [],
    referenceTravelMinutes: '',
    referenceDistanceKm: '',
    isDefault: isFirst,
  };
}

export function siteFormFrom(site: PracticeSite): SiteFormValues {
  return {
    name: site.name,
    facilityType: site.facilityType,
    hasCT: site.hasCT,
    hasLab: site.hasLab,
    hasICU: site.hasICU,
    isSus: site.isSus,
    specialists: [...site.specialists],
    referenceTravelMinutes: site.referenceTravelMinutes?.toString() ?? '',
    referenceDistanceKm: site.referenceDistanceKm?.toString() ?? '',
    isDefault: site.isDefault,
  };
}

type FormResult = { ok: true; input: PracticeSiteInput } | { ok: false; error: string };

function wholeNumber(raw: string, min: number, max: number): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const value = Number(trimmed);
  return value >= min && value <= max ? value : 'invalid';
}

/**
 * Mesmas regras do servidor (`practiceSiteInputSchema`), para o médico ver o
 * erro antes de salvar. O servidor continua validando.
 */
export function toPracticeSiteInput(values: SiteFormValues): FormResult {
  const name = values.name.trim();
  if (name.length < 2) return { ok: false, error: 'Dê um nome ao local (ex.: "UPA Centro").' };
  if (name.length > PRACTICE_SITE_LIMITS.nameMaxChars) {
    return { ok: false, error: `Nome com até ${PRACTICE_SITE_LIMITS.nameMaxChars} caracteres.` };
  }
  const minutes = wholeNumber(
    values.referenceTravelMinutes,
    1,
    PRACTICE_SITE_LIMITS.referenceTravelMinutesMax,
  );
  if (minutes === 'invalid') {
    return { ok: false, error: 'Tempo até a referência: minutos inteiros, de 1 a 1440.' };
  }
  const km = wholeNumber(
    values.referenceDistanceKm,
    0,
    PRACTICE_SITE_LIMITS.referenceDistanceKmMax,
  );
  if (km === 'invalid') {
    return { ok: false, error: 'Distância até a referência: km inteiros, até 3000.' };
  }
  return {
    ok: true,
    input: {
      name,
      facilityType: values.facilityType,
      hasCT: values.hasCT,
      hasLab: values.hasLab,
      hasICU: values.hasICU,
      isSus: values.isSus,
      specialists: values.specialists,
      referenceTravelMinutes: minutes,
      referenceDistanceKm: km,
      isDefault: values.isDefault,
    },
  };
}
