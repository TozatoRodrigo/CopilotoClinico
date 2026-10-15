import type { PsSyndrome } from '../../../../shared/contracts/clinical';
import type { BolusDrug, DoseLeg } from '../../../../shared/clinical-tools/pediatrics/bolus';
import {
  BOLUS_GROUPS,
  PREPARATIONS,
  type BolusGroup,
  type BolusGroupId,
} from '../../../../shared/clinical-tools/pediatrics/bolus-drugs';
import {
  formatConcentration,
  PEDIATRIC_INFUSIONS,
  WEIGHT_BAND_LABEL,
  WEIGHT_BANDS,
  type PediatricInfusion,
} from '../../../../shared/clinical-tools/pediatrics/infusions';
import { PEDIATRIC_DOSES_PROVENANCE } from '../../../../shared/clinical-tools/pediatrics/provenance';
import { anyCardDraft, slug, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { fact, num, splitSentences } from './text';

/**
 * CC-405 — Emergência pediátrica (CC-319): as 65 drogas em bolus e as 16
 * infusões contínuas do PedGuide v4, um cartão por droga. As doses esperam a
 * assinatura da fonte única (CC-321); o achado de cada id na reconciliação
 * vai para o revisor (review-findings.ts). Os achados da revisão citam a droga
 * pelo id do ANY, que é o termo de ligação.
 */

const SYNDROME_BY_GROUP: Partial<Record<BolusGroupId, PsSyndrome>> = {
  anticonvulsivantes: 'crise-convulsiva',
  respiratorio: 'dispneia',
  toxicologia: 'intoxicacao',
  'anti-histaminicos': 'reacao-alergica',
};

/**
 * O fármaco como a decisão o procura (CC-408: toda palavra do nome no texto da
 * conduta): sem o complemento depois de " — " ("N-ACETILCISTEÍNA — Fase 1").
 */
function drugOf(name: string): string {
  return name.split(' — ')[0]!.trim();
}

/** "1 mg", "6 mg (1ª dose) / 12 mg (2ª dose)": o teto que a conta aplica. */
function capText(legs: readonly DoseLeg[], unit: string): string | null {
  const capped = legs.filter((leg): leg is DoseLeg & { cap: number } => leg.cap !== undefined);
  if (capped.length === 0) return null;
  if (capped.length === legs.length && new Set(capped.map((leg) => leg.cap)).size === 1) {
    return `${num(capped[0]!.cap)} ${unit}`;
  }
  return capped
    .map((leg) => `${num(leg.cap)} ${unit}${leg.label ? ` (${leg.label})` : ''}`)
    .join(' / ');
}

function floorText(legs: readonly DoseLeg[], unit: string): string | null {
  const floors = [...new Set(legs.flatMap((leg) => (leg.floor === undefined ? [] : [leg.floor])))];
  return floors.length > 0 ? floors.map((floor) => `${num(floor)} ${unit}`).join(' / ') : null;
}

/** Teto e piso de cada forma de dose; o resto da forma vira linha própria. */
function doseLimits(drug: BolusDrug): { maxDose: string | null; minDose: string | null } {
  const { dose } = drug;
  switch (dose.kind) {
    case 'por-kg':
      return { maxDose: capText(dose.legs, dose.unit), minDose: floorText(dose.legs, dose.unit) };
    case 'bolus-e-infusao':
      return { maxDose: capText([dose.bolus], dose.unit), minDose: null };
    default:
      return { maxDose: null, minDose: null };
  }
}

/** Linhas que a forma da dose acrescenta (infusão depois do bolus, degrau de peso, idade). */
function shapeFacts(drug: BolusDrug): AnyCardFact[] {
  const { dose } = drug;
  const name = drug.name;
  const drugName = drugOf(name);
  switch (dose.kind) {
    case 'bolus-e-infusao': {
      const range = dose.infusionMlPerKgPerHour.map((value) => num(value)).join(' - ');
      const line = `${name}, infusão depois do bolus: ${range} mL/kg/h (${dose.note}).`;
      return [fact(line, 'conduct', { drug: drugName, amount: `${range} mL/kg/h` })];
    }
    case 'degrau-de-peso': {
      const lower = `${num(dose.lower.dose)} ${dose.unit}`;
      const upper = `${num(dose.upper.dose)} ${dose.unit}`;
      return [
        fact(`${name}: ${lower} (${dose.lower.note}).`, 'conduct', {
          drug: drugName,
          amount: lower,
        }),
        fact(`${name}: ${upper} (${dose.upper.note}).`, 'conduct', {
          drug: drugName,
          amount: upper,
        }),
      ];
    }
    case 'holliday-segar':
      return [
        fact(
          `${name}: vazão de manutenção de Holliday-Segar, até ${num(dose.capMlPerHour)} mL/h (${dose.note}).`,
          'conduct',
        ),
      ];
    case 'volume-por-kg':
      return [
        fact(
          `${name}: ${num(dose.mlPerKg)} mL/kg na conta, ${num(dose.concentration)} ${dose.unit}/mL.`,
          'conduct',
        ),
      ];
    case 'por-idade': {
      const bands = dose.bands.map((band) => {
        const limits = [
          band.belowYears !== undefined ? `abaixo de ${num(band.belowYears)} anos` : null,
          band.upToKg !== undefined ? `até ${num(band.upToKg)} kg` : null,
        ].filter((part): part is string => part !== null);
        const amount = `${band.doses.map((value) => num(value)).join(' a ')} ${dose.unit}`;
        return fact(`${name}, ${limits.join(' ou ')}: ${amount} (${band.note}).`, 'conduct', {
          drug: drugName,
          amount,
        });
      });
      const otherwise = `${dose.otherwise.doses.map((value) => num(value)).join(' a ')} ${dose.unit}`;
      return [
        ...bands,
        fact(`${name}, demais idades: ${otherwise} (${dose.otherwise.note}).`, 'conduct', {
          drug: drugName,
          amount: otherwise,
        }),
        fact(
          `${name}: ${dose.belowMinimumMessage} (abaixo de ${num(dose.minimumYears)} anos).`,
          'pitfall',
        ),
      ];
    }
    default:
      return [];
  }
}

function bolusDraft(drug: BolusDrug, group: BolusGroup): AnyCardDraft {
  const { maxDose, minDose } = doseLimits(drug);
  const doseLine =
    `${drug.name}: ${drug.doseLabel}` +
    (drug.calculatedAt ? ` (conta em ${drug.calculatedAt})` : '') +
    (maxDose ? `; teto por dose na conta: ${maxDose}` : '') +
    (minDose ? `; mínimo por dose: ${minDose}` : '') +
    '.';
  const facts: AnyCardFact[] = [
    fact(doseLine, 'conduct', { drug: drugOf(drug.name), amount: drug.doseLabel, maxDose }),
    ...shapeFacts(drug),
    ...splitSentences(`${drug.name}: ${drug.instruction}`).map((line) => fact(line, 'conduct')),
  ];
  if (drug.notRoutine) {
    facts.push(fact(`${drug.name}: sem indicação de rotina (selo do PedGuide).`, 'pitfall'));
  }
  if (group.notice) facts.push(fact(group.notice, 'notification'));

  const preparation = drug.preparation ? PREPARATIONS[drug.preparation] : null;
  return anyCardDraft({
    toolId: 'pediatria',
    itemId: `pediatria/bolus-${slug(drug.id)}`,
    itemLabel: drug.name,
    topic: `${drug.name} em bolus na criança (${group.title})`,
    syndrome: SYNDROME_BY_GROUP[group.id] ?? null,
    question: `Pediatria, ${group.title}: qual a dose de ${drug.name}?`,
    population:
      drug.dose.kind === 'por-idade'
        ? 'Criança, dose pela idade (PedGuide do ANY)'
        : 'Criança, dose por peso (PedGuide do ANY)',
    answer: [doseLine],
    facts,
    context: [
      ...(/[a-z0-9]/i.test(drug.presentation)
        ? [`${drug.name}, apresentação: ${drug.presentation}.`]
        : []),
      ...(preparation ? [`${preparation.title}, preparo: ${preparation.steps.join('; ')}.`] : []),
    ],
    provenance: PEDIATRIC_DOSES_PROVENANCE,
    findingTerms: [drug.id],
  });
}

function infusionDraft(infusion: PediatricInfusion): AnyCardDraft {
  const range = `${num(infusion.range.min)} - ${num(infusion.range.max)} ${infusion.unit}`;
  const doseLine = `${infusion.name} em infusão contínua na criança: ${range}.`;
  const dilutions = WEIGHT_BANDS.map((band) => {
    const dilution = infusion.dilutions[band];
    return fact(
      `${infusion.name}, diluição para ${WEIGHT_BAND_LABEL[band]}: ${num(dilution.drugMl)} mL da apresentação (${infusion.presentation}) + ${num(dilution.diluentMl)} mL de diluente = ${num(dilution.finalVolumeMl)} mL (${formatConcentration(dilution.concentration, infusion.unit)}).`,
      'conduct',
    );
  });
  return anyCardDraft({
    toolId: 'pediatria',
    itemId: `pediatria/infusao-${slug(infusion.id)}`,
    itemLabel: `${infusion.name} (infusão contínua)`,
    topic: `${infusion.name} em infusão contínua na criança`,
    syndrome: infusion.category === 'vasoativos' ? 'choque' : null,
    question: `Qual a dose de ${infusion.name} em infusão contínua na criança?`,
    population: 'Criança, infusão contínua por peso (PedGuide do ANY)',
    answer: [doseLine],
    facts: [
      fact(doseLine, 'conduct', { drug: drugOf(infusion.name), amount: range }),
      ...dilutions,
      ...(infusion.warning ? [fact(`${infusion.name}: ${infusion.warning}.`, 'pitfall')] : []),
    ],
    context: [
      `${infusion.name}: dose inicial da ferramenta ${num(infusion.defaultDose)} ${infusion.unit}.`,
    ],
    provenance: PEDIATRIC_DOSES_PROVENANCE,
    findingTerms: [infusion.id],
  });
}

export function pediatricDrafts(): AnyCardDraft[] {
  return [
    ...BOLUS_GROUPS.flatMap((group) => group.drugs.map((drug) => bolusDraft(drug, group))),
    ...PEDIATRIC_INFUSIONS.map(infusionDraft),
  ];
}
