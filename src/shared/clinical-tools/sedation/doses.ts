import { formatCompact, formatDecimal } from '../numbers';

/**
 * Doses do roteiro de sedação (CC-328), iguais ao SedaPath do ANY App v4:
 * cada regime é dado estruturado (droga, quantidade, via) e o texto da tela
 * sai daqui ("Midazolam 7,5–15 mg VO"). Nenhuma dose mora em componente
 * (ADR-017). O teste diferencial (tests/clinical-tools) compara com a página
 * do ANY o texto de cada regime e a conta em 1.000 pesos.
 */

export const SEDATION_DRUGS = {
  midazolam: 'Midazolam',
  clonazepam: 'Clonazepam',
  cetamina: 'Cetamina',
  haloperidol: 'Haloperidol',
  prometazina: 'Prometazina',
  propofol: 'Propofol',
} as const;

export type SedationDrugId = keyof typeof SEDATION_DRUGS;

export type SedationRoute = 'VO' | 'IM' | 'IV';

export type DoseAmount =
  | { kind: 'fixa'; mg: number }
  | { kind: 'faixa'; minMg: number; maxMg: number }
  | { kind: 'por-kg'; mgPerKg: number };

export interface DrugDose {
  drug: SedationDrugId;
  amount: DoseAmount;
}

export const REGIMEN_IDS = [
  'midazolam-vo',
  'clonazepam-vo',
  'cetamina-im',
  'midazolam-im',
  'haloperidol-prometazina-im',
  'midazolam-haloperidol-prometazina-im',
] as const;

export type RegimenId = (typeof REGIMEN_IDS)[number];

export interface Regimen {
  id: RegimenId;
  route: SedationRoute;
  /** Drogas dadas juntas, na ordem do ANY. */
  components: readonly DrugDose[];
}

const MIDAZOLAM_IM: DrugDose = { drug: 'midazolam', amount: { kind: 'fixa', mg: 7.5 } };
const HALOPERIDOL_IM: DrugDose = { drug: 'haloperidol', amount: { kind: 'fixa', mg: 5 } };
const PROMETHAZINE_IM: DrugDose = { drug: 'prometazina', amount: { kind: 'fixa', mg: 50 } };

export const REGIMENS: Record<RegimenId, Regimen> = {
  'midazolam-vo': {
    id: 'midazolam-vo',
    route: 'VO',
    components: [{ drug: 'midazolam', amount: { kind: 'faixa', minMg: 7.5, maxMg: 15 } }],
  },
  'clonazepam-vo': {
    id: 'clonazepam-vo',
    route: 'VO',
    components: [{ drug: 'clonazepam', amount: { kind: 'faixa', minMg: 0.5, maxMg: 1 } }],
  },
  'cetamina-im': {
    id: 'cetamina-im',
    route: 'IM',
    components: [{ drug: 'cetamina', amount: { kind: 'por-kg', mgPerKg: 5 } }],
  },
  'midazolam-im': { id: 'midazolam-im', route: 'IM', components: [MIDAZOLAM_IM] },
  'haloperidol-prometazina-im': {
    id: 'haloperidol-prometazina-im',
    route: 'IM',
    components: [HALOPERIDOL_IM, PROMETHAZINE_IM],
  },
  'midazolam-haloperidol-prometazina-im': {
    id: 'midazolam-haloperidol-prometazina-im',
    route: 'IM',
    components: [MIDAZOLAM_IM, HALOPERIDOL_IM, PROMETHAZINE_IM],
  },
};

/** "7,5 mg", "7,5–15 mg", "5 mg/kg". */
export function formatAmount(amount: DoseAmount): string {
  switch (amount.kind) {
    case 'fixa':
      return `${formatCompact(amount.mg)} mg`;
    case 'faixa':
      return `${formatCompact(amount.minMg)}–${formatCompact(amount.maxMg)} mg`;
    case 'por-kg':
      return `${formatCompact(amount.mgPerKg)} mg/kg`;
  }
}

/** Nome do regime: drogas e via ("Cetamina IM", "Haloperidol + Prometazina IM"). */
export function regimenTitle(regimen: Regimen): string {
  return `${regimen.components.map(({ drug }) => SEDATION_DRUGS[drug]).join(' + ')} ${regimen.route}`;
}

/**
 * Dose do regime com a via. Com `names`, cada droga leva o nome
 * ("Haloperidol 5 mg + Prometazina 50 mg IM"); sem, só a quantidade, para
 * quando o nome já está no título ("5 mg/kg IM").
 */
export function formatRegimen(regimen: Regimen, { names }: { names: boolean }): string {
  const parts = regimen.components.map(({ drug, amount }) =>
    names ? `${SEDATION_DRUGS[drug]} ${formatAmount(amount)}` : formatAmount(amount),
  );
  return `${parts.join(' + ')} ${regimen.route}`;
}

/**
 * Linha de dose de uma opção de medicação, abaixo do título: só a quantidade
 * quando é uma droga ("5 mg/kg IM"), cada droga com o nome quando são várias.
 */
export function medicationDoseLine(regimen: Regimen): string {
  return formatRegimen(regimen, { names: regimen.components.length > 1 });
}

// ---- Cetamina IM ------------------------------------------------------------

/** Calculadora da cetamina IM do ANY: 5 mg/kg, volume na apresentação de 50 mg/mL. */
export const KETAMINE_IM = {
  regimen: 'cetamina-im',
  mgPerKg: 5,
  concentrationMgPerMl: 50,
  /** Casas na tela, como o `fmt` do ANY: dose inteira, volume com uma casa. */
  doseDecimals: 0,
  volumeDecimals: 1,
} as const;

export interface KetamineImDose {
  doseMg: number;
  volumeMl: number;
}

/** Dose = peso × 5 mg/kg; volume = dose ÷ 50 mg/mL (as mesmas operações do ANY). */
export function ketamineImDose(weightKg: number): KetamineImDose {
  const doseMg = weightKg * KETAMINE_IM.mgPerKg;
  return { doseMg, volumeMl: doseMg / KETAMINE_IM.concentrationMgPerMl };
}

/** "350 mg" e "7,0 mL", com as casas do ANY. */
export function ketamineImTexts(dose: KetamineImDose): { dose: string; volume: string } {
  return {
    dose: `${formatDecimal(dose.doseMg, KETAMINE_IM.doseDecimals)} mg`,
    volume: `${formatDecimal(dose.volumeMl, KETAMINE_IM.volumeDecimals)} mL`,
  };
}

// ---- Cetofol 1:1 ------------------------------------------------------------

export interface MixtureComponent {
  label: string;
  volumeMl: number;
  /** Quantidade de droga no volume; a água não tem. */
  mg?: number;
}

/**
 * Cetofol 1:1 do ANY: cetamina e propofol na mesma seringa, 5 mg/mL de cada.
 * Indução 0,5 mg/kg e manutenção 0,25 mg/kg de cada componente; com sedação
 * nas últimas 4 h, metade (0,25 e 0,125 mg/kg). Os valores reduzidos ficam
 * escritos, como no ANY, e o teste confere que são a metade.
 */
export const KETOFOL = {
  concentrationMgPerMl: 5,
  induction: { standardMgPerKg: 0.5, reducedMgPerKg: 0.25 },
  maintenance: { standardMgPerKg: 0.25, reducedMgPerKg: 0.125 },
  reductionPercent: 50,
  doseDecimals: 0,
  volumeDecimals: 1,
  mixture: [
    { label: 'Cetamina 50 mg/mL', volumeMl: 2, mg: 100 },
    { label: 'Propofol 1%', volumeMl: 10, mg: 100 },
    { label: 'Água destilada', volumeMl: 8 },
  ] as readonly MixtureComponent[],
  totalVolumeMl: 20,
} as const;

export interface KetofolDose {
  mgPerKg: number;
  /** Dose de cada componente (cetamina e propofol). */
  doseMg: number;
  /** Volume da solução 1:1. */
  volumeMl: number;
}

export interface KetofolDoses {
  reduced: boolean;
  induction: KetofolDose;
  maintenance: KetofolDose;
}

function ketofolDose(weightKg: number, mgPerKg: number): KetofolDose {
  const doseMg = weightKg * mgPerKg;
  return { mgPerKg, doseMg, volumeMl: doseMg / KETOFOL.concentrationMgPerMl };
}

/** Indução e manutenção do cetofol; `reduced` com sedação nas últimas 4 h. */
export function ketofolDoses(weightKg: number, reduced: boolean): KetofolDoses {
  const { induction, maintenance } = KETOFOL;
  return {
    reduced,
    induction: ketofolDose(
      weightKg,
      reduced ? induction.reducedMgPerKg : induction.standardMgPerKg,
    ),
    maintenance: ketofolDose(
      weightKg,
      reduced ? maintenance.reducedMgPerKg : maintenance.standardMgPerKg,
    ),
  };
}

/** "350 mg", "18 mg": dose com as casas do ANY. */
export function formatMg(value: number, decimals: number): string {
  return `${formatDecimal(value, decimals)} mg`;
}

/** "7,0 mL". */
export function formatMl(value: number, decimals: number): string {
  return `${formatDecimal(value, decimals)} mL`;
}

/** Quantidade de um componente da mistura: "2 mL (100 mg)", "8 mL". */
export function mixtureAmount(component: MixtureComponent): string {
  const volume = `${formatCompact(component.volumeMl)} mL`;
  return component.mg === undefined ? volume : `${volume} (${formatCompact(component.mg)} mg)`;
}

/** "5 mg/mL de cada componente". */
export function ketofolConcentrationText(): string {
  return `${formatCompact(KETOFOL.concentrationMgPerMl)} mg/mL de cada componente`;
}

/** Dose do cetofol na tela: "35 mg de cada" (cetamina e propofol). */
export function ketofolEachText(dose: KetofolDose): string {
  return `${formatMg(dose.doseMg, KETOFOL.doseDecimals)} de cada`;
}

/** Volume do cetofol na tela: "7,0 mL". */
export function ketofolVolumeText(dose: KetofolDose): string {
  return formatMl(dose.volumeMl, KETOFOL.volumeDecimals);
}
