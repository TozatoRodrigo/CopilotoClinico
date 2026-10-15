import type { KnowledgeCardClaimKind } from '../../../../shared/contracts/knowledge-cards';
import {
  BLOCKS_PROVENANCE,
  LAST_PROTOCOL,
  LAST_STEPS,
  LAST_WARNING_SIGNS,
  MAX_DOSE_NOTICE,
} from '../../../../shared/clinical-tools/blocks/content';
import {
  EPINEPHRINE_LABEL,
  LIPID_EMULSION_20,
  LOCAL_ANESTHETICS,
  type LocalAnesthetic,
} from '../../../../shared/clinical-tools/blocks/doses';
import { ANTIDOTES, type Antidote } from '../../../../shared/clinical-tools/toxicology/antidotes';
import { TOX_PATH_PROVENANCE } from '../../../../shared/clinical-tools/toxicology/provenance';
import { anyCardDraft, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { doseFromLine, fact, num, textFact } from './text';

/**
 * CC-405 — Toxicologia (CC-323) e Bloqueios regionais (CC-330). Um cartão por
 * antídoto do guia do ToxPath (as linhas de dose viram dose estruturada da
 * própria linha), um por anestésico local (dose máxima com e sem
 * epinefrina) e um do LAST (emulsão lipídica e os passos).
 */

/** Tipo de afirmação pelo título da seção do card do antídoto. */
function sectionKind(title: string): KnowledgeCardClaimKind {
  if (/^indica/i.test(title) || /^meta/i.test(title)) return 'criterion';
  if (/^(contraindica|uso restrito)/i.test(title)) return 'pitfall';
  return 'conduct';
}

/**
 * Seções que nomeiam outra droga no mesmo card (o ANY junta fomepizol e
 * etanol): a dose da linha é da droga da seção, não do card.
 */
export const SECTION_DRUG: Readonly<Record<string, string>> = {
  'Fomepizol (se disponível)': 'Fomepizol',
  'Etanol IV (alternativa)': 'Etanol',
};

/** "Gluconato de cálcio 10%: 20-30 mL IV" ou "ou Cloreto de cálcio 10%: …" — a droga abre a linha. */
const LINE_DRUG = /^(?:ou\s+)?([A-ZÀ-Ú][\p{L} ]+?\s\d+(?:,\d+)?%):/u;

/**
 * Afirmação de uma linha de dose do card: a droga é a que abre a linha, a da
 * seção ou a do card, nessa ordem; a quantidade sai do resto da linha.
 */
function antidoteDoseFact(
  text: string,
  line: string,
  sectionTitle: string,
  antidote: Antidote,
): AnyCardFact {
  const named = LINE_DRUG.exec(line);
  if (!named?.[1]) return textFact(text, 'conduct', SECTION_DRUG[sectionTitle] ?? antidote.name);
  const dose = doseFromLine(line.slice(named[0].length));
  return dose ? fact(text, 'conduct', { drug: named[1], ...dose }) : fact(text, 'conduct');
}

function antidoteDraft(antidote: Antidote): AnyCardDraft {
  const facts: AnyCardFact[] = [];
  const context: string[] = [];
  for (const section of antidote.sections) {
    for (const line of section.lines) {
      const text = `${antidote.name} — ${section.title}: ${line}`;
      if (/^apresenta/i.test(section.title)) {
        context.push(text);
        continue;
      }
      const kind = sectionKind(section.title);
      facts.push(
        kind === 'conduct'
          ? antidoteDoseFact(text, line, section.title, antidote)
          : fact(text, kind),
      );
    }
  }
  facts.push(
    ...antidote.warnings.map((warning) => fact(`${antidote.name}, alerta: ${warning}`, 'pitfall')),
  );
  facts.push(
    ...antidote.infos.map((info) => fact(`${antidote.name}, observação: ${info}`, 'conduct')),
  );
  if (!antidote.available) {
    facts.push(
      fact(`${antidote.name}: marcado como não disponível no guia de antídotos do ANY.`, 'pitfall'),
    );
  }

  const doses = facts.filter((item) => item.dose);
  const answer = (doses.length > 0 ? doses : facts).slice(0, 3).map((item) => item.line);
  const shortName = antidote.name.replace(/\s*\(.*\)\s*$/, '');
  return anyCardDraft({
    toolId: 'toxicologia',
    itemId: `toxicologia/antidoto-${antidote.id}`,
    itemLabel: antidote.name,
    topic: `${antidote.name}: ${antidote.indication}`,
    syndrome: 'intoxicacao',
    question: antidote.available
      ? `${antidote.name} — ${antidote.indication}: qual a dose?`
      : `${antidote.name} — ${antidote.indication}: está disponível e qual a alternativa?`,
    population: 'Paciente intoxicado no PS (guia de antídotos do ANY)',
    answer,
    facts,
    context,
    provenance: TOX_PATH_PROVENANCE,
    findingTerms: [...new Set([antidote.id, antidote.name, shortName, 'guia de antídotos'])],
  });
}

function anestheticDraft(anesthetic: LocalAnesthetic): AnyCardDraft {
  const lines = (['sem', 'com'] as const).map((epinephrine) => {
    const max = `${num(anesthetic.maxMgPerKg[epinephrine])} mg/kg`;
    const line = `${anesthetic.name} ${EPINEPHRINE_LABEL[epinephrine].toLowerCase()}: até ${max} (dose máxima).`;
    return fact(line, 'conduct', { drug: anesthetic.name, amount: `até ${max}`, maxDose: max });
  });
  const concentrations = anesthetic.concentrations
    .map((concentration) => `${concentration.label} (${num(concentration.mgPerMl)} mg/mL)`)
    .join('; ');
  return anyCardDraft({
    toolId: 'bloqueios',
    itemId: `bloqueios/dose-maxima-${anesthetic.id}`,
    itemLabel: `${anesthetic.name}, dose máxima`,
    topic: `Dose máxima de ${anesthetic.name} (anestésico local)`,
    question: `Qual a dose máxima de ${anesthetic.name} no bloqueio ou na infiltração, com e sem epinefrina?`,
    population: 'Adulto, anestesia local ou bloqueio regional no PS',
    answer: lines.map((item) => item.line),
    facts: [...lines, fact(`${MAX_DOSE_NOTICE.title}: ${MAX_DOSE_NOTICE.text}`, 'pitfall')],
    context: [`${anesthetic.name}, concentrações: ${concentrations}.`],
    provenance: BLOCKS_PROVENANCE,
    findingTerms: [anesthetic.name, anesthetic.id, 'dose máxima'],
  });
}

function lastDraft(): AnyCardDraft {
  const { bolusMlPerKg, infusionMlPerKgPerMin, maxMlPerKg } = LIPID_EMULSION_20;
  const lipid = LAST_PROTOCOL.lipidTitle;
  const bolusLine = `${lipid} no LAST: bolus ${num(bolusMlPerKg)} mL/kg (dose máxima total ${num(maxMlPerKg)} mL/kg).`;
  const infusionLine = `${lipid} no LAST: infusão ${num(infusionMlPerKgPerMin)} mL/kg/min.`;
  return anyCardDraft({
    toolId: 'bloqueios',
    itemId: 'bloqueios/last',
    itemLabel: LAST_PROTOCOL.title,
    topic: `${LAST_PROTOCOL.subtitle} (LAST)`,
    syndrome: 'intoxicacao',
    question:
      'Como tratar a toxicidade sistêmica por anestésico local (LAST) e qual a dose da emulsão lipídica?',
    population: 'Adulto com sinais de toxicidade sistêmica por anestésico local',
    answer: [bolusLine, infusionLine],
    facts: [
      fact(bolusLine, 'conduct', {
        drug: lipid,
        amount: `${num(bolusMlPerKg)} mL/kg`,
        maxDose: `${num(maxMlPerKg)} mL/kg`,
      }),
      fact(infusionLine, 'conduct', {
        drug: lipid,
        amount: `${num(infusionMlPerKgPerMin)} mL/kg/min`,
      }),
      ...LAST_STEPS.map((step, index) =>
        fact(`LAST, passo ${index + 1} — ${step.title}: ${step.detail}.`, 'conduct'),
      ),
      ...LAST_WARNING_SIGNS.map((sign) =>
        fact(
          `LAST, ${LAST_PROTOCOL.warningSignsTitle.toLowerCase()} — ${sign.title}: ${sign.text}.`,
          'alarm_sign',
        ),
      ),
    ],
    provenance: BLOCKS_PROVENANCE,
    findingTerms: ['LAST', 'emulsão lipídica'],
  });
}

export function toxicologyDrafts(): AnyCardDraft[] {
  return ANTIDOTES.map(antidoteDraft);
}

export function blockDrafts(): AnyCardDraft[] {
  return [...LOCAL_ANESTHETICS.map(anestheticDraft), lastDraft()];
}
