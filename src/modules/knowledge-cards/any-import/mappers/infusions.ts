import type { PsSyndrome } from '../../../../shared/contracts/clinical';
import {
  INFUSION_DRUGS,
  type DrugBolus,
  type DrugMode,
  type InfusionDrug,
} from '../../../../shared/clinical-tools/infusions/drugs';
import { HEPARIN_PROTOCOL } from '../../../../shared/clinical-tools/infusions/heparin';
import { INSULIN_PROTOCOL } from '../../../../shared/clinical-tools/infusions/insulin';
import { anyCardDraft, slug, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { fact, num, splitMax, splitRepeat, splitRoute } from './text';

/**
 * CC-405 — Infusões contínuas (CC-311 e CC-312): um cartão por droga e modo
 * de indicação (a sedação e o status epilepticus do midazolam são situações
 * diferentes), mais heparina por indicação e insulina. O ANY não cita
 * referência bibliográfica nas infusões (achado 1.9 da revisão).
 */

const POPULATION = 'Adulto, infusão contínua em bomba de infusão';

function syndromeOf(drug: InfusionDrug, mode: DrugMode | null): PsSyndrome | null {
  if (mode?.id === 'status') return 'crise-convulsiva';
  if (mode?.id === 'scape') return 'dispneia';
  if (drug.id === 'nitroprussiato') return 'pressao-arterial-elevada';
  if (drug.category === 'vasopressors') return 'choque';
  return null;
}

/** Faixa como a tela mostra: a do modo ou, sem modo, a da droga (`doseSettings`). */
function rangeText(drug: InfusionDrug, mode: DrugMode | null): string {
  return mode?.rangeLabel ?? `${num(drug.doseMin)} - ${num(drug.doseMax)} ${drug.doseUnit}`;
}

function bolusFact(name: string, bolus: DrugBolus): AnyCardFact {
  const rows = bolus.rows.map((row) => `${row.label.toLowerCase()} ${row.value}`).join('; ');
  const line = `${name} — ${bolus.title}: ${rows}.`;
  const doseRow = bolus.rows.find((row) => /^(dose|bolus)$/i.test(row.label));
  if (!doseRow) return fact(line, 'conduct');
  const repeatRow = bolus.rows.find((row) => /^repetir/i.test(row.label));
  const repeat = repeatRow ? splitRepeat(repeatRow.value) : null;
  return fact(line, 'conduct', {
    drug: name,
    ...splitRoute(doseRow.value),
    frequency: repeat?.frequency ?? null,
    maxDose: repeat?.maxDose ?? null,
  });
}

function thresholdFact(
  name: string,
  unit: string,
  caution: number | undefined,
  critical: number | undefined,
): AnyCardFact | null {
  const parts = [
    caution !== undefined
      ? `acima de ${num(caution)} ${unit} a ferramenta marca "acima do usual"`
      : null,
    critical !== undefined ? `acima de ${num(critical)} ${unit}, "dose crítica"` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? fact(`${name}: ${parts.join('; ')}.`, 'alarm_sign') : null;
}

function drugDraft(drug: InfusionDrug, mode: DrugMode | null): AnyCardDraft {
  const label = mode ? `${drug.name} — ${mode.label}` : drug.name;
  const range = rangeText(drug, mode);
  const doseLine = `${label}: faixa de dose em infusão contínua ${range}.`;
  const doseFact = fact(doseLine, 'conduct', { drug: drug.name, amount: range });
  const facts: AnyCardFact[] = [
    doseFact,
    fact(
      `${drug.name}, diluição padrão: ${drug.presentation} (${num(drug.concentration)} ${drug.concentrationUnit}).`,
      'conduct',
    ),
  ];
  const thresholds = thresholdFact(
    drug.name,
    drug.doseUnit,
    mode?.cautionThreshold ?? drug.cautionThreshold,
    mode?.criticalThreshold ?? drug.criticalThreshold,
  );
  if (thresholds) facts.push(thresholds);
  if (mode?.bolus) facts.push(bolusFact(drug.name, mode.bolus));

  const alternatives = (drug.dilutions ?? []).filter((dilution) => !dilution.isDefault);
  return anyCardDraft({
    toolId: 'infusoes',
    itemId: mode ? `infusoes/${drug.id}-${slug(mode.id)}` : `infusoes/${drug.id}`,
    itemLabel: label,
    topic: mode
      ? `${drug.name} em infusão contínua (${mode.label})`
      : `${drug.name} em infusão contínua`,
    syndrome: syndromeOf(drug, mode),
    question: `Qual a dose de ${drug.name} em infusão contínua${mode ? ` (${mode.label})` : ''} no adulto?`,
    population: POPULATION,
    answer: [doseLine],
    facts,
    context: [
      `${drug.name}: dose inicial da ferramenta ${num(mode?.doseDefault ?? drug.doseDefault)} ${drug.doseUnit}${drug.usesWeight ? '' : ', sem peso'}.`,
      ...(alternatives.length > 0
        ? [`${drug.name}, diluições alternativas: ${alternatives.map((d) => d.label).join('; ')}.`]
        : []),
    ],
    provenance: drug.provenance,
    findingTerms: [drug.name, drug.id, ...drug.aliases.filter((alias) => alias.length > 3)],
  });
}

const HEPARIN = 'Heparina não fracionada';

function heparinDrafts(): AnyCardDraft[] {
  const { indications, nomogram, preparation, concentration, provenance } = HEPARIN_PROTOCOL;
  const nomogramFacts = nomogram.map((row) => {
    const line = `${HEPARIN}, ajuste por TTPa/R ${row.range}: bolus ${row.bolusText}; infusão ${row.actionText}.`;
    return /\d/.test(row.bolusText)
      ? fact(line, 'conduct', { drug: HEPARIN, amount: row.bolusText })
      : fact(line, 'conduct');
  });
  return Object.entries(indications).map(([id, indication]) => {
    const bolusLine = `${HEPARIN}, ${indication.bolusTitle.toLowerCase()}: ${indication.bolusText}.`;
    const infusionLine = `${HEPARIN}, infusão inicial (${indication.label}): ${indication.infusionText}.`;
    return anyCardDraft({
      toolId: 'infusoes',
      itemId: `infusoes/heparina-${slug(id)}`,
      itemLabel: `Heparina (${indication.label})`,
      topic: `Heparina não fracionada em infusão contínua (${indication.label})`,
      question: `Qual o esquema de heparina não fracionada em infusão contínua na ${indication.label}?`,
      population: POPULATION,
      answer: [bolusLine, infusionLine],
      facts: [
        fact(bolusLine, 'conduct', { drug: HEPARIN, ...splitMax(indication.bolusText) }),
        fact(infusionLine, 'conduct', { drug: HEPARIN, ...splitMax(indication.infusionText) }),
        ...nomogramFacts,
      ],
      context: [`${HEPARIN}, preparo: ${preparation} (${num(concentration)} UI/mL).`],
      provenance,
      findingTerms: ['heparina', `heparina ${indication.label}`],
    });
  });
}

const INSULIN = 'Insulina regular';

function insulinDraft(): AnyCardDraft {
  const { table, preparation, provenance } = INSULIN_PROTOCOL;
  const facts = table.map((row) => {
    const doses = [
      row.bolus > 0 ? `bolus ${row.bolusText} UI` : null,
      row.infusion > 0 ? `infusão ${row.infusionText} UI/h` : null,
    ].filter((part): part is string => part !== null);
    const conduct = doses.length > 0 ? doses.join(' e ') : row.infusionText;
    const line = `${INSULIN} em infusão, glicemia ${row.range} mg/dL: ${conduct}.`;
    return doses.length > 0
      ? fact(line, 'conduct', { drug: INSULIN, amount: conduct })
      : fact(line, 'criterion');
  });
  return anyCardDraft({
    toolId: 'infusoes',
    itemId: 'infusoes/insulina',
    itemLabel: 'Insulina regular',
    topic: 'Insulina regular em infusão contínua por glicemia',
    syndrome: 'disturbio-glicemico',
    question: 'Qual a dose de insulina regular em infusão contínua conforme a glicemia?',
    population: POPULATION,
    // Preparo e a primeira faixa que inicia infusão: o resto da tabela vem nas afirmações.
    answer: [
      `${INSULIN} em infusão contínua, preparo: ${preparation} (1 UI/mL).`,
      ...facts
        .filter((item) => item.dose)
        .slice(0, 1)
        .map((item) => item.line),
    ],
    facts,
    provenance,
    findingTerms: ['insulina'],
  });
}

export function infusionDrafts(): AnyCardDraft[] {
  return [
    ...INFUSION_DRUGS.flatMap((drug) =>
      drug.modes && drug.modes.length > 0
        ? drug.modes.map((mode) => drugDraft(drug, mode))
        : [drugDraft(drug, null)],
    ),
    ...heparinDrafts(),
    insulinDraft(),
  ];
}
