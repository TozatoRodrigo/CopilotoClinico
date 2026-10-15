import type { PsSyndrome } from '../../../../shared/contracts/clinical';
import {
  ACLS_MEDICATIONS,
  ACLS_PROVENANCE,
  ACLS_REFERENCE_CITATION,
  DEFAULT_EPINEPHRINE_INTERVAL_SECONDS,
  GUIDE_TEXT,
  type AclsMedication,
} from '../../../../shared/clinical-tools/acls/content';
import {
  PALLIATIVE_REFERENCES,
  SYMPTOM_PAGES,
  SYMPTOM_TABS,
  type ContentBlock,
  type MedicationColumns,
  type SymptomTab,
} from '../../../../shared/clinical-tools/palliative/content';
import {
  SUBCUTANEOUS_MEDICATIONS,
  SUBCUTANEOUS_MEDICATIONS_SOURCE,
  type SubcutaneousMedication,
} from '../../../../shared/clinical-tools/palliative/hypodermoclysis';
import {
  METHADONE_WARNING,
  OPIOID_EQUIVALENCE_TABLE,
  OPIOID_GUIDANCE,
  OPIOID_TABLE_TITLE,
} from '../../../../shared/clinical-tools/palliative/opioids';
import { PALLIATIVE_PROVENANCE } from '../../../../shared/clinical-tools/palliative/provenance';
import { MAX_CLAIMS } from '../../domain/card-content';
import { anyCardDraft, slug, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { fact, num, splitSentences } from './text';

/**
 * CC-405 — Cuidados paliativos (CC-329) e ACLS (CC-313). Paliativos: o
 * conversor de opioides (tabela de equianalgesia), as medicações por
 * hipodermóclise e as tabelas de medicação de cada sintoma. ACLS: um cartão
 * por medicação da parada (as duas doses de amiodarona juntas), com a
 * citação da AHA que o ANY traz.
 */

/** Quantidade como a tabela escreve, quando é dose: tem número e cabe no campo. */
function amountOf(dose: string): string | null {
  return /\d/.test(dose) && dose.length <= 80 ? dose : null;
}

const MORPHINE_ROW = OPIOID_EQUIVALENCE_TABLE.find((row) => row.opioid === 'morfina-vo');

function opioidConversionDraft(): AnyCardDraft {
  const reference = MORPHINE_ROW ? `${MORPHINE_ROW.label} ${MORPHINE_ROW.dose}` : 'Morfina VO';
  const rows = OPIOID_EQUIVALENCE_TABLE.map((row) => {
    const equivalence = row === MORPHINE_ROW ? 'referência da tabela' : `equivale a ${reference}`;
    const line = `${OPIOID_TABLE_TITLE}: ${row.label} ${row.dose} (fator ${row.factor}; ${equivalence}).`;
    const amount = amountOf(row.dose);
    return amount ? fact(line, 'conduct', { drug: row.label, amount }) : fact(line, 'pitfall');
  });
  const guidance = fact(`Conversão de opioides: ${OPIOID_GUIDANCE}`, 'conduct');
  return anyCardDraft({
    toolId: 'paliativos',
    itemId: 'paliativos/conversao-opioides',
    itemLabel: 'Conversão de opioides',
    topic: 'Conversão entre opioides (equianalgesia em 24 h)',
    question: 'Como converter a dose entre opioides (equianalgesia em 24 h)?',
    population: 'Paciente em uso de opioide que precisa trocar de droga ou de via',
    answer: [
      guidance.line,
      ...rows
        .filter((row) => row.dose)
        .slice(1, 3)
        .map((row) => row.line),
    ],
    facts: [guidance, ...rows, fact(`Metadona: ${METHADONE_WARNING}`, 'pitfall')],
    provenance: PALLIATIVE_PROVENANCE,
    // Os achados da seção do conversor citam partes da tela, não a droga.
    findingTerms: [
      'conversor',
      'equianalgesia',
      'metadona',
      'fentanil, fator',
      'tabela de equivalência',
      'redução de 25%',
      'rótulo do campo',
      'faixas de entrada',
      'resultado',
      'opioides da lista',
    ],
  });
}

const SC_REFERENCE = SUBCUTANEOUS_MEDICATIONS_SOURCE.replace(/^Fonte:\s*/, '');

function subcutaneousDraft(medication: SubcutaneousMedication): AnyCardDraft {
  const doseLine = `${medication.name} por hipodermóclise (via subcutânea): ${medication.dose}.`;
  const amount = amountOf(medication.dose);
  return anyCardDraft({
    toolId: 'paliativos',
    itemId: `paliativos/hipodermoclise-${slug(medication.name)}`,
    itemLabel: `${medication.name} (hipodermóclise)`,
    topic: `${medication.name} por hipodermóclise`,
    question: `Qual a dose e a diluição de ${medication.name} por hipodermóclise?`,
    population: 'Paciente em cuidados paliativos com via subcutânea (hipodermóclise)',
    answer: [doseLine],
    facts: [
      amount
        ? fact(doseLine, 'conduct', { drug: medication.name, amount, route: null })
        : fact(doseLine, 'conduct'),
      fact(`${medication.name} por hipodermóclise, diluição: ${medication.dilution}.`, 'conduct'),
      ...(medication.note
        ? splitSentences(`${medication.name} por hipodermóclise: ${medication.note}.`).map((line) =>
            fact(line, 'conduct'),
          )
        : []),
    ],
    provenance: PALLIATIVE_PROVENANCE,
    reference: SC_REFERENCE,
    findingTerms: [medication.name, 'hipodermóclise', 'técnica'],
  });
}

const SYMPTOM_LABEL = new Map<string, string>(SYMPTOM_TABS.map((tab) => [tab.id, tab.label]));
const SYMPTOM_REFERENCE =
  PALLIATIVE_REFERENCES.find((group) => /sintomas/i.test(group.title))?.items.join(' ') ?? null;
const SYNDROME_BY_SYMPTOM: Partial<Record<SymptomTab, PsSyndrome>> = { dispneia: 'dispneia' };

interface SymptomLines {
  doses: AnyCardFact[];
  notes: AnyCardFact[];
  lists: string[];
}

/** A droga da linha: o nome da medicação, ou a do título ("Protocolo (Midazolam)") quando a coluna é etapa. */
function rowDrug(name: string, columns: MedicationColumns, heading: string | null): string {
  if (columns.name !== 'Etapa') return name;
  return /\(([^)]+)\)\s*$/.exec(heading ?? '')?.[1] ?? name;
}

function walkSymptomBlocks(
  label: string,
  blocks: readonly ContentBlock[],
  lines: SymptomLines,
  context: { heading: string | null; group: string | null },
): void {
  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        context.heading = block.text;
        break;
      case 'group':
        walkSymptomBlocks(label, block.blocks, lines, { ...context, group: block.title });
        break;
      case 'medications': {
        const where = [label, context.group ?? context.heading].filter(Boolean).join(', ');
        for (const row of block.rows) {
          const detail =
            row.detail && block.columns.detail ? ` (${block.columns.detail}: ${row.detail})` : '';
          const line = `${where} — ${row.name}: ${row.dose}${detail}.`;
          const amount = amountOf(row.dose);
          lines.doses.push(
            amount
              ? fact(line, 'conduct', {
                  drug: rowDrug(row.name, block.columns, context.heading),
                  amount,
                })
              : fact(line, 'conduct'),
          );
        }
        break;
      }
      case 'note':
        lines.notes.push(
          fact(
            `${label}, ${block.note.title}: ${block.note.text}`,
            block.note.kind === 'atencao' || block.note.kind === 'risco' ? 'pitfall' : 'conduct',
          ),
        );
        break;
      case 'list':
        lines.lists.push(`${label}, ${context.heading ?? 'lista'}: ${block.items.join('; ')}.`);
        break;
      case 'text':
        lines.lists.push(`${label}, ${context.group ?? context.heading ?? ''}: ${block.text}.`);
        break;
      case 'signs':
        lines.lists.push(
          `${label}, ${block.caption}: ${block.rows.map((row) => `${row.sign} ${row.time}`).join('; ')}.`,
        );
        break;
    }
  }
}

function symptomDraft(tab: SymptomTab): AnyCardDraft | null {
  const label = `Paliativos, ${SYMPTOM_LABEL.get(tab) ?? tab}`;
  const lines: SymptomLines = { doses: [], notes: [], lists: [] };
  walkSymptomBlocks(label, SYMPTOM_PAGES[tab], lines, { heading: null, group: null });
  if (lines.doses.length === 0) return null;
  // Doses e avisos viram afirmação até o teto do cartão; o resto fica no texto da fonte.
  const ranked = [...lines.doses, ...lines.notes];
  const facts = ranked.slice(0, MAX_CLAIMS);
  return anyCardDraft({
    toolId: 'paliativos',
    itemId: `paliativos/sintoma-${tab}`,
    itemLabel: `Manejo de sintomas — ${SYMPTOM_LABEL.get(tab) ?? tab}`,
    topic: `Cuidados paliativos no PS: ${(SYMPTOM_LABEL.get(tab) ?? tab).toLowerCase()}`,
    syndrome: SYNDROME_BY_SYMPTOM[tab] ?? null,
    question: `Quais medicações e doses no manejo de ${(SYMPTOM_LABEL.get(tab) ?? tab).toLowerCase()} em cuidados paliativos no PS?`,
    population: 'Paciente em cuidados paliativos no departamento de emergência',
    answer: lines.doses.slice(0, 3).map((item) => item.line),
    facts,
    context: [...ranked.slice(MAX_CLAIMS).map((item) => item.line), ...lines.lists],
    provenance: PALLIATIVE_PROVENANCE,
    reference: SYMPTOM_REFERENCE,
    findingTerms: [SYMPTOM_LABEL.get(tab) ?? tab, 'manejo de sintomas'],
  });
}

export function palliativeDrafts(): AnyCardDraft[] {
  return [
    opioidConversionDraft(),
    ...SUBCUTANEOUS_MEDICATIONS.map(subcutaneousDraft),
    ...SYMPTOM_TABS.flatMap((tab) => {
      const draft = symptomDraft(tab.id);
      return draft ? [draft] : [];
    }),
  ];
}

// ---- ACLS ------------------------------------------------------------------

/** "Amiodarona 300 mg IV" → droga, quantidade e via (o nome da medicação traz a dose no ANY). */
const ACLS_NAME =
  /^(?<drug>.+?) (?<amount>\d[\d,.]*\s*(?:mg|g|mEq\/kg|mEq))(?: (?<route>IV\/IO|IV))?$/;

export function parseAclsMedication(medication: AclsMedication) {
  const groups = ACLS_NAME.exec(medication.name)?.groups;
  if (!groups?.drug || !groups.amount) {
    throw new Error(`Medicação de ACLS sem dose legível no nome: ${medication.id}`);
  }
  return { drug: groups.drug, amount: groups.amount, route: groups.route ?? null };
}

function aclsFact(medication: AclsMedication): AnyCardFact {
  const parsed = parseAclsMedication(medication);
  const line = `ACLS — ${medication.name}: ${medication.hint}.`;
  // "A cada 3-5 min" é frequência; os outros lembretes são quando usar.
  const frequency = /^a cada /i.test(medication.hint) ? medication.hint : null;
  return fact(line, 'conduct', { ...parsed, frequency });
}

/** Como a revisão do ACLS chama a droga no "Onde" ("Cálcio", "Magnésio"). */
const ACLS_EXTRA_TERMS: Record<string, readonly string[]> = {
  'gluconato-calcio': ['cálcio'],
  'sulfato-magnesio': ['magnésio'],
};

/** A amiodarona tem duas doses (300 e 150 mg): um cartão com as duas. */
const ACLS_CARD_OF: Record<AclsMedication['id'], string> = {
  epinefrina: 'epinefrina',
  'amiodarona-300': 'amiodarona',
  'amiodarona-150': 'amiodarona',
  lidocaina: 'lidocaina',
  'sulfato-magnesio': 'sulfato-magnesio',
  'gluconato-calcio': 'gluconato-calcio',
  bicarbonato: 'bicarbonato',
};

function aclsExtraFacts(cardId: string): AnyCardFact[] {
  switch (cardId) {
    case 'epinefrina':
      return [
        fact(
          `ACLS — epinefrina: intervalo sugerido na ferramenta, ${num(DEFAULT_EPINEPHRINE_INTERVAL_SECONDS / 60)} min.`,
          'conduct',
        ),
      ];
    case 'amiodarona':
      return [
        fact(`ACLS — ${GUIDE_TEXT.amiodarone300}: ${GUIDE_TEXT.amiodarone300Detail}.`, 'criterion'),
        fact(`ACLS — ${GUIDE_TEXT.amiodarone150}: ${GUIDE_TEXT.amiodarone150Detail}.`, 'criterion'),
      ];
    default:
      return [];
  }
}

/** Lidocaína: o lembrete traz a dose por peso ("Alternativa: 1-1,5 mg/kg"). */
function weightAlternative(medication: AclsMedication): AnyCardFact | null {
  const match = /(?<amount>\d[\d,.]*\s*-\s*\d[\d,.]*\s*mg\/kg)/.exec(medication.hint);
  if (!match?.groups?.amount) return null;
  const { drug } = parseAclsMedication(medication);
  return fact(`ACLS — ${drug}, dose por peso: ${medication.hint}.`, 'conduct', {
    drug,
    amount: match.groups.amount,
  });
}

export function aclsDrafts(): AnyCardDraft[] {
  const cards = new Map<string, AclsMedication[]>();
  for (const medication of ACLS_MEDICATIONS) {
    const cardId = ACLS_CARD_OF[medication.id];
    cards.set(cardId, [...(cards.get(cardId) ?? []), medication]);
  }
  return [...cards.entries()].map(([cardId, medications]) => {
    const doseFacts = medications.map(aclsFact);
    const alternatives = medications.flatMap((medication) => {
      const alternative = weightAlternative(medication);
      return alternative ? [alternative] : [];
    });
    const { drug } = parseAclsMedication(medications[0]!);
    return anyCardDraft({
      toolId: 'acls',
      itemId: `acls/${cardId}`,
      itemLabel: drug,
      topic: `${drug} na parada cardiorrespiratória (ACLS)`,
      question: `Qual a dose de ${drug.toLowerCase()} na parada cardiorrespiratória do adulto?`,
      population: 'Adulto em parada cardiorrespiratória (ACLS)',
      answer: doseFacts.map((item) => item.line),
      facts: [...doseFacts, ...alternatives, ...aclsExtraFacts(cardId)],
      provenance: ACLS_PROVENANCE,
      reference: ACLS_REFERENCE_CITATION,
      findingTerms: [drug, cardId, ...(ACLS_EXTRA_TERMS[cardId] ?? [])],
    });
  });
}
