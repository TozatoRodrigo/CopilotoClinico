import {
  AIRWAY_DRUG_CATEGORIES,
  AIRWAY_DRUGS,
  receivesDoseReduction,
  type AirwayDrug,
} from '../../../../shared/clinical-tools/airway/drugs';
import { AIRWAY_PROVENANCE, NOTICES } from '../../../../shared/clinical-tools/airway/content';
import {
  COMBATIVE,
  KETOFOL_SCREEN,
  NON_URGENT,
  ORAL_SEDATION,
  SEDATION_PROVENANCE,
  URGENT_IM,
  type RegimenCard,
} from '../../../../shared/clinical-tools/sedation/content';
import {
  formatAmount,
  KETOFOL,
  mixtureAmount,
  REGIMENS,
  regimenTitle,
  SEDATION_DRUGS,
  type RegimenId,
} from '../../../../shared/clinical-tools/sedation/doses';
import { anyCardDraft, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { fact, num } from './text';

/**
 * CC-405 — Via aérea (CC-315) e Sedação (CC-328). Na via aérea, um cartão
 * por droga da sequência rápida, com a régua de dose por kg do ANY. Na
 * sedação, um cartão por situação do roteiro (VO, IM urgente, não urgente,
 * combativo, cetofol), com uma afirmação por droga de cada regime.
 */

const CATEGORY_LABEL = new Map<string, string>(
  AIRWAY_DRUG_CATEGORIES.map((category) => [category.id, category.label]),
);

function airwayDraft(drug: AirwayDrug): AnyCardDraft {
  const range = `${num(drug.rate.min)} - ${num(drug.rate.max)} ${drug.rateUnit}`;
  const category = CATEGORY_LABEL.get(drug.category) ?? drug.category;
  const doseLine = `${drug.name} na intubação em sequência rápida (${category}): ${range}.`;
  const facts: AnyCardFact[] = [
    fact(doseLine, 'conduct', { drug: drug.name, amount: range }),
    fact(`${drug.name}, apresentação: ${drug.presentation}.`, 'conduct'),
  ];
  if (receivesDoseReduction(drug)) {
    facts.push(fact(NOTICES.reducaoDose.lines.join(' '), 'pitfall'));
  }
  if (drug.alert) facts.push(fact(`${drug.name}: ${drug.alert}`, 'pitfall'));
  return anyCardDraft({
    toolId: 'via-aerea',
    itemId: `via-aerea/${drug.id}`,
    itemLabel: drug.name,
    topic: `${drug.name} na intubação em sequência rápida`,
    question: `Qual a dose de ${drug.name} na intubação em sequência rápida do adulto?`,
    population: 'Adulto, intubação em sequência rápida no PS',
    answer: [doseLine],
    facts,
    context: [
      `${drug.name}: valor inicial da régua da ferramenta ${num(drug.rate.initial)} ${drug.rateUnit}.`,
    ],
    provenance: AIRWAY_PROVENANCE,
    findingTerms: [
      drug.name,
      drug.id,
      'réguas',
      ...(receivesDoseReduction(drug) ? ['redução de dose'] : []),
    ],
  });
}

/** Uma afirmação por droga do regime, cada uma com a sua dose e a via. */
function regimenFacts(id: RegimenId): AnyCardFact[] {
  const regimen = REGIMENS[id];
  const title = regimenTitle(regimen);
  return regimen.components.map(({ drug, amount }) => {
    const name = SEDATION_DRUGS[drug];
    const dose = formatAmount(amount);
    return fact(`${title} — ${name} ${dose} ${regimen.route}.`, 'conduct', {
      drug: name,
      amount: dose,
      route: regimen.route,
    });
  });
}

function regimenCardFacts(card: RegimenCard): AnyCardFact[] {
  return [
    ...card.regimens.flatMap(regimenFacts),
    ...card.notes.map((note) => fact(`${card.title}: ${note}.`, 'conduct')),
  ];
}

function notice(title: string, lines: readonly string[], kind: AnyCardFact['kind']): AnyCardFact {
  return fact(`${title}: ${lines.join(' / ')}.`, kind);
}

const AGITATION = 'agitacao-psicomotora' as const;

function sedationDrafts(): AnyCardDraft[] {
  const base = { toolId: 'sedacao' as const, provenance: SEDATION_PROVENANCE };

  const oral = regimenCardFacts(ORAL_SEDATION.card);
  const urgent = [
    ...URGENT_IM.options.flatMap((option) => [
      ...regimenFacts(option.regimen),
      fact(`${regimenTitle(REGIMENS[option.regimen])}: ${option.timing}.`, 'criterion'),
      ...(option.preferIf
        ? [
            fact(
              `${regimenTitle(REGIMENS[option.regimen])}, preferir se: ${option.preferIf}.`,
              'criterion',
            ),
          ]
        : []),
    ]),
    notice(URGENT_IM.midazolamCaution.title, URGENT_IM.midazolamCaution.lines, 'pitfall'),
  ];
  const nonUrgent = regimenCardFacts(NON_URGENT.card);
  const combative = [
    ...COMBATIVE.options.flatMap((option) => [
      ...regimenFacts(option.regimen),
      fact(`${regimenTitle(REGIMENS[option.regimen])}: ${option.timing}.`, 'criterion'),
    ]),
    notice(COMBATIVE.risk.title, COMBATIVE.risk.lines, 'conduct'),
    notice(
      COMBATIVE.midazolamContraindication.title,
      COMBATIVE.midazolamContraindication.lines,
      'pitfall',
    ),
  ];

  const { induction, maintenance } = KETOFOL;
  const inductionLine = `Cetofol 1:1, indução: ${num(induction.standardMgPerKg)} mg/kg de cada componente (cetamina e propofol); com sedação nas últimas 4 h, ${num(induction.reducedMgPerKg)} mg/kg.`;
  const maintenanceLine = `Cetofol 1:1, manutenção: ${num(maintenance.standardMgPerKg)} mg/kg de cada componente; com sedação nas últimas 4 h, ${num(maintenance.reducedMgPerKg)} mg/kg; ${KETOFOL_SCREEN.maintenanceRepeat.toLowerCase()}.`;
  const preparationLine = `Cetofol 1:1, preparo: ${KETOFOL.mixture.map((part) => `${part.label} ${mixtureAmount(part)}`).join(' + ')} = ${num(KETOFOL.totalVolumeMl)} mL (${num(KETOFOL.concentrationMgPerMl)} mg/mL de cada componente).`;

  return [
    anyCardDraft({
      ...base,
      itemId: 'sedacao/sedacao-vo',
      itemLabel: ORAL_SEDATION.card.title,
      topic: 'Sedação leve por via oral para procedimento',
      question: 'Quais as opções de sedação leve por via oral para procedimento no adulto?',
      population: 'Adulto colaborativo que precisa de sedação leve para procedimento',
      answer: oral.filter((item) => item.dose).map((item) => item.line),
      facts: oral,
      findingTerms: ['VO', 'sedação vo', 'midazolam vo', 'clonazepam'],
    }),
    anyCardDraft({
      ...base,
      itemId: 'sedacao/agitacao-im-urgente',
      itemLabel: 'Agitação, sedação IM urgente',
      topic: 'Agitação psicomotora: sedação IM urgente sem acesso IV',
      syndrome: AGITATION,
      question: 'Qual medicação IM usar na agitação que precisa de sedação rápida, sem acesso IV?',
      population: 'Adulto agitado, sem acesso IV, com necessidade de onset rápido',
      answer: urgent.filter((item) => item.dose).map((item) => item.line),
      facts: urgent,
      findingTerms: ['im urgente', 'cetamina im', 'midazolam im', 'contraindicações'],
    }),
    anyCardDraft({
      ...base,
      itemId: 'sedacao/agitacao-nao-urgente',
      itemLabel: NON_URGENT.card.title,
      topic: 'Agitação psicomotora não urgente: haloperidol + prometazina IM',
      syndrome: AGITATION,
      question: 'Qual a sedação IM na agitação psicomotora não urgente?',
      population: 'Adulto agitado, pouco colaborativo, sem urgência de onset',
      answer: nonUrgent.filter((item) => item.dose).map((item) => item.line),
      facts: nonUrgent,
      findingTerms: ['não urgente', 'nao-urgente', 'haloperidol', 'prometazina'],
    }),
    anyCardDraft({
      ...base,
      itemId: 'sedacao/agitacao-combativo',
      itemLabel: 'Paciente combativo',
      topic: 'Agitação grave (paciente combativo): contenção química IM',
      syndrome: AGITATION,
      question: 'Qual a contenção química IM no paciente combativo com agitação grave?',
      population: 'Adulto combativo, agitação grave com risco imediato',
      answer: combative
        .filter((item) => item.dose)
        .slice(0, 4)
        .map((item) => item.line),
      facts: combative,
      findingTerms: [
        'combativo',
        'contenção',
        'contraindicações',
        'cetamina im',
        'midazolam im',
        'haloperidol',
        'prometazina',
      ],
    }),
    anyCardDraft({
      ...base,
      itemId: 'sedacao/cetofol',
      itemLabel: 'Cetofol 1:1',
      topic: 'Cetofol 1:1 para sedação procedimental IV',
      question: 'Qual a dose de cetofol 1:1 na sedação procedimental IV do adulto?',
      population: 'Adulto em sedação procedimental IV na sala de emergência',
      answer: [inductionLine],
      facts: [
        fact(inductionLine, 'conduct', {
          drug: 'Cetofol 1:1',
          amount: `${num(induction.standardMgPerKg)} mg/kg de cada componente`,
        }),
        fact(maintenanceLine, 'conduct', {
          drug: 'Cetofol 1:1',
          amount: `${num(maintenance.standardMgPerKg)} mg/kg de cada componente`,
          frequency: KETOFOL_SCREEN.maintenanceRepeat.toLowerCase(),
        }),
        fact(preparationLine, 'conduct'),
        notice(KETOFOL_SCREEN.reduced.title, KETOFOL_SCREEN.reduced.lines, 'pitfall'),
      ],
      findingTerms: ['cetofol'],
    }),
  ];
}

export function airwayDrafts(): AnyCardDraft[] {
  return AIRWAY_DRUGS.map(airwayDraft);
}

export { sedationDrafts };
