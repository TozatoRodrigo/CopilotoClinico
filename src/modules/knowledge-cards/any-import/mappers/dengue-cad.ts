import type { KnowledgeCardClaimKind } from '../../../../shared/contracts/knowledge-cards';
import {
  BASAL_INSULIN,
  DEXTROSE_TRIGGER,
  HHS_LIMITS,
  INITIAL_FLUID,
  INSULIN_BLOCKED,
  INSULIN_DOSES,
  INSULIN_PREPARATION,
  INSULIN_PRIMING,
  INSULIN_TEXTS,
  INSULIN_TEXTS_HHS,
  KCL_ROUTES,
  KCL_SPEED,
  LOW_POTASSIUM_ALERT,
  MAINTENANCE_FLUID,
  OVERLOAD_ALERT,
  PHOSPHATE,
  POTASSIUM_BANDS,
  POTASSIUM_MONITORING,
  REFERENCES,
  RENAL_FUNCTION_GATE,
  VOLEMIC_STATES,
} from '../../../../shared/clinical-tools/cad-ehh/content';
import {
  CAD_EHH_PROVENANCE,
  stripSourceTags,
} from '../../../../shared/clinical-tools/cad-ehh/sources';
import {
  DENGUE_GROUPS,
  DENGUE_PROVENANCE,
  DENGUE_REFERENCES,
  DENGUE_REFERENCES_SHORT,
  TRAIL_GROUP_STEP,
  type DengueBlock,
  type DengueGroup,
} from '../../../../shared/clinical-tools/dengue/content';
import { anyCardDraft, type AnyCardDraft, type AnyCardFact } from '../any-card-draft';
import { fact, patternFact } from './text';

/**
 * CC-405 — Dengue (CC-325) e CAD/EHH (CC-326). O texto destas ferramentas é
 * corrido ("Hidratação IV: SF 0,9% ou RL — 10 mL/kg/h por 2 horas"), então a
 * dose estruturada sai de padrões explícitos, um por linha de dose: sem
 * casamento, a linha fica sem dose estruturada e o teste do mapeador acusa.
 */

// ---- Dengue ----------------------------------------------------------------

/** Volume pelo peso não existe sem paciente: o marcador sai, a regra por kg fica. */
export function stripVolumePlaceholders(text: string): string {
  return text
    .replace(/\s*\([^()]*\{[^}]+\}[^()]*\)/g, '')
    .replace(/\{[^}]+\}/g, '[volume pelo peso]')
    .replace(/\*\*/g, '')
    .trim();
}

interface DoseRule {
  test: RegExp;
  drug: string;
  pattern: RegExp;
}

const DENGUE_DOSE_RULES: readonly DoseRule[] = [
  { test: /Hidratação oral/, drug: 'Hidratação oral', pattern: /(?<amount>\d+ mL\/kg\/dia)/ },
  {
    test: /Metoclopramida/,
    drug: 'Metoclopramida',
    pattern: /Metoclopramida (?<amount>\d+ mg) (?<route>IV\/VO) (?<frequency>\d+\/\d+h)/,
  },
  {
    test: /Hidratação IV/,
    drug: 'SF 0,9% ou RL',
    pattern: /(?<amount>\d+ mL\/kg\/h) (?<frequency>por \d+ horas)/,
  },
  { test: /Manutenção:/, drug: 'SF 0,9% ou RL', pattern: /(?<amount>\d+ mL\/kg em \d+h)/ },
  {
    test: /SF 0,9% — \d+ mL\/kg/,
    drug: 'SF 0,9%',
    pattern: /(?<amount>\d+ mL\/kg em até \d+ min)\. (?<frequency>Repetir até \d+x)/,
  },
  { test: /Albumina 20%/, drug: 'Albumina 20%', pattern: /(?<amount>[\d,]+-[\d,]+ g\/kg)/ },
  { test: /Bolus rápido/, drug: 'SF 0,9%', pattern: /(?<amount>\d+ mL\/kg)/ },
];

function dengueFact(line: string, kind: KnowledgeCardClaimKind): AnyCardFact {
  const rule = DENGUE_DOSE_RULES.find((candidate) => candidate.test.test(line));
  return rule ? patternFact(line, kind, rule.drug, rule.pattern) : fact(line, kind);
}

function blockKind(title: string): KnowledgeCardClaimKind {
  if (/retorno/i.test(title)) return 'alarm_sign';
  if (/^(reclassificar|crit[ée]rios|metas|condi[çc][õo]es de risco)/i.test(title))
    return 'criterion';
  return 'conduct';
}

function blockLines(
  group: DengueGroup,
  block: DengueBlock,
): { fact?: AnyCardFact; context?: string } {
  const prefix = `Dengue grupo ${group}`;
  switch (block.kind) {
    case 'notice':
    case 'note': {
      const body = [block.text, block.items?.join('; ')].filter(Boolean).join(' ');
      const title = block.title ?? 'Conduta';
      const line = `${prefix} — ${title.replace(/:$/, '')}: ${stripVolumePlaceholders(body)}`;
      return { fact: dengueFact(line, blockKind(title)) };
    }
    case 'volumes': {
      const details = block.figures.flatMap((figure) =>
        figure.detail?.kind === 'text' ? [stripVolumePlaceholders(figure.detail.text)] : [],
      );
      const line = `${prefix} — ${block.label}${details.length > 0 ? ` (${details.join('; ')})` : ''}.`;
      return /\d+ mL\/kg/.test(block.label)
        ? { fact: dengueFact(line, 'conduct') }
        : { context: line };
    }
    case 'paragraph':
      return { context: `${prefix}: ${stripVolumePlaceholders(block.text)}` };
    case 'list':
      return { context: `${prefix}: ${block.items.join('; ')}.` };
    default:
      return {};
  }
}

/** Como a revisão da dengue cita o manejo de cada grupo no "Onde". */
const DENGUE_FINDING_TERMS: Record<DengueGroup, readonly string[]> = {
  A: ['antieméticos', 'sinais de retorno'],
  B: ['condições de risco', 'sinais de retorno'],
  C: ['manutenção', 'expansão', 'número de expansões'],
  D: ['albumina', 'número de expansões'],
};

function dengueDraft(group: DengueGroup): AnyCardDraft {
  const facts: AnyCardFact[] = [];
  const context: string[] = [];
  for (const block of TRAIL_GROUP_STEP[group]) {
    const lines = blockLines(group, block);
    if (lines.fact) facts.push(lines.fact);
    if (lines.context) context.push(lines.context);
  }
  const doses = facts.filter((item) => item.dose);
  return anyCardDraft({
    toolId: 'dengue',
    itemId: `dengue/grupo-${group.toLowerCase()}`,
    itemLabel: `Grupo ${group}`,
    topic: `Dengue grupo ${group}: conduta e hidratação`,
    syndrome: 'febre',
    question: `Qual a conduta e a hidratação na dengue grupo ${group} no adulto?`,
    population: `Adulto (15 anos ou mais) com dengue classificada no grupo ${group}`,
    answer: (doses.length > 0 ? doses : facts).slice(0, 2).map((item) => item.line),
    facts,
    context,
    provenance: DENGUE_PROVENANCE,
    reference: DENGUE_REFERENCES.slice(0, 3).join(' '),
    referenceTitle: DENGUE_REFERENCES_SHORT,
    findingTerms: [`grupo ${group}`, ...DENGUE_FINDING_TERMS[group]],
  });
}

export function dengueDrafts(): AnyCardDraft[] {
  return DENGUE_GROUPS.map(dengueDraft);
}

// ---- CAD e EHH -------------------------------------------------------------

/** Marca de fonte do texto do KetoPath → a referência da lista do ANY. */
function referencesOf(lines: readonly string[], jbds: 'cad' | 'ehh'): string[] {
  const byTag: Record<string, string | undefined> = {
    ADA: REFERENCES[0]?.text,
    JBDS: (jbds === 'cad' ? REFERENCES[1] : REFERENCES[2])?.text,
    UTD: REFERENCES.find((reference) => reference.text.startsWith('UpToDate'))?.text,
  };
  const found = new Set<string>();
  for (const line of lines) {
    for (const match of line.matchAll(/\[(ADA|UTD|JBDS|LIT: ([^\],]+))[^\]]*\]/g)) {
      const author = match[2]?.trim().split(/\s+/)[0];
      const reference = author
        ? REFERENCES.find((candidate) => candidate.text.startsWith(author))?.text
        : byTag[match[1] ?? ''];
      if (reference) found.add(reference);
    }
  }
  return [...found];
}

interface CadLine {
  raw: string;
  kind: KnowledgeCardClaimKind;
  dose?: { drug: string; pattern: RegExp };
}

const INSULIN = 'Insulina regular';
const U_PER_KG_H = /(?<amount>\d+(?:,\d+)? U\/kg\/h)/;

function cadDraft(spec: {
  id: string;
  label: string;
  topic: string;
  question: string;
  jbds: 'cad' | 'ehh';
  lines: readonly CadLine[];
  /** Como a revisão (cad-ehh.md) cita o assunto no "Onde". */
  findingTerms: readonly string[];
  answerCount?: number;
}): AnyCardDraft {
  const facts = spec.lines.map((line) => {
    const text = stripSourceTags(line.raw);
    return line.dose
      ? patternFact(text, line.kind, line.dose.drug, line.dose.pattern)
      : fact(text, line.kind);
  });
  const references = referencesOf(
    spec.lines.map((line) => line.raw),
    spec.jbds,
  );
  const doses = facts.filter((item) => item.dose);
  return anyCardDraft({
    toolId: 'cad-ehh',
    itemId: `cad-ehh/${spec.id}`,
    itemLabel: spec.label,
    topic: spec.topic,
    syndrome: 'disturbio-glicemico',
    question: spec.question,
    population: 'Adulto com crise hiperglicêmica (CAD, EHH ou quadro misto)',
    answer: (doses.length > 0 ? doses : facts)
      .slice(0, spec.answerCount ?? 2)
      .map((item) => item.line),
    facts,
    provenance: CAD_EHH_PROVENANCE,
    reference: references.length > 0 ? references.join(' ') : null,
    referenceTitle: references.length > 1 ? (references[0] ?? null) : null,
    referenceUrl:
      REFERENCES.find((reference) => references.includes(reference.text) && reference.url)?.url ??
      null,
    findingTerms: [spec.label, ...spec.findingTerms],
  });
}

export function cadDrafts(): AnyCardDraft[] {
  const insulinRow = (situation: string) =>
    INSULIN_DOSES.find((row) => row.situation === situation);
  const rowLine = (situation: string): CadLine[] => {
    const row = insulinRow(situation);
    return row
      ? [
          {
            raw: `${INSULIN} em infusão, ${row.situation}: ${row.speed}.`,
            kind: 'conduct',
            dose: { drug: INSULIN, pattern: U_PER_KG_H },
          },
        ]
      : [];
  };

  return [
    cadDraft({
      id: 'insulina-cad',
      findingTerms: ['insulina', 'unidade da insulina', 'velocidade padrão'],
      label: 'Insulina na CAD',
      topic: 'Insulina regular em infusão na cetoacidose diabética',
      question: 'Qual a dose de insulina regular em infusão na cetoacidose diabética do adulto?',
      jbds: 'cad',
      lines: [
        ...rowLine('CAD'),
        ...rowLine('Misto CAD-EHH'),
        ...rowLine('Após glicemia <250 mg/dL'),
        { raw: `${INSULIN}, preparo: ${INSULIN_PREPARATION}`, kind: 'conduct' },
        { raw: INSULIN_BLOCKED, kind: 'pitfall' },
        ...INSULIN_TEXTS.map(
          (raw): CadLine => ({
            raw,
            kind: 'conduct',
            dose: /bolus/.test(raw)
              ? { drug: INSULIN, pattern: /(?<amount>0,1 U\/kg)(?!\/)/ }
              : undefined,
          }),
        ),
        ...INSULIN_PRIMING.slice(0, 2).map((raw): CadLine => ({ raw, kind: 'conduct' })),
      ],
    }),
    cadDraft({
      id: 'insulina-ehh',
      findingTerms: ['insulina', 'EHH', 'unidade da insulina'],
      label: 'Insulina no EHH',
      topic: 'Insulina regular em infusão no estado hiperglicêmico hiperosmolar',
      question: 'Qual a dose de insulina em infusão no estado hiperglicêmico hiperosmolar (EHH)?',
      jbds: 'ehh',
      lines: [
        ...rowLine('EHH sem cetose significativa'),
        ...INSULIN_TEXTS_HHS.map((raw): CadLine => ({ raw, kind: 'conduct' })),
        ...HHS_LIMITS.map((raw): CadLine => ({ raw: `EHH, limite: ${raw}.`, kind: 'pitfall' })),
      ],
    }),
    cadDraft({
      id: 'potassio',
      findingTerms: ['KCl', 'potássio', 'borda do K'],
      label: 'Potássio na CAD e no EHH',
      topic: 'Reposição de potássio (KCl) na CAD e no EHH',
      question:
        'Como repor potássio (KCl) na cetoacidose diabética e no EHH conforme o potássio sérico?',
      jbds: 'cad',
      lines: [
        { raw: RENAL_FUNCTION_GATE, kind: 'criterion' },
        ...POTASSIUM_BANDS.map(
          (band): CadLine => ({
            raw: `Potássio ${band.range}: ${band.conduct}.`,
            kind: 'conduct',
            dose: {
              drug: 'KCl',
              pattern: /(?<amount>\d+ a \d+ mEq de KCl (?:por hora|a cada litro de fluido))/,
            },
          }),
        ),
        ...KCL_SPEED.map((raw): CadLine => ({ raw, kind: 'conduct' })),
        {
          raw: `KCl, concentração máxima: ${KCL_ROUTES.map((route) => `${route.label.toLowerCase()} ${route.maxMEqPerLiter} mEq/L`).join('; ')} (norma institucional).`,
          kind: 'pitfall',
        },
        ...LOW_POTASSIUM_ALERT.map((raw): CadLine => ({ raw, kind: 'alarm_sign' })),
        ...POTASSIUM_MONITORING.map((raw): CadLine => ({ raw, kind: 'conduct' })),
      ],
    }),
    cadDraft({
      id: 'fluidos',
      findingTerms: ['fase B', 'fluido', 'sódio no EHH'],
      label: 'Fluidos na CAD e no EHH',
      topic: 'Reposição volêmica na CAD e no EHH',
      question: 'Qual fluido e em que velocidade na reposição volêmica da CAD e do EHH?',
      jbds: 'cad',
      lines: [
        ...INITIAL_FLUID.map(
          (raw): CadLine => ({
            raw,
            kind: 'conduct',
            dose: /1 L por hora/.test(raw)
              ? { drug: 'cristaloide isotônico', pattern: /(?<amount>\d+ L por hora)/ }
              : undefined,
          }),
        ),
        ...VOLEMIC_STATES.map(
          (state): CadLine => ({
            raw: `${state.label}: ${state.conduct}.`,
            kind: 'conduct',
            dose: /L\/h/.test(state.conduct)
              ? { drug: 'Salina 0,9%', pattern: /(?<amount>aproximadamente \d+ L\/h)/ }
              : undefined,
          }),
        ),
        {
          raw: `Fluido de manutenção, sódio corrigido abaixo de 135 mEq/L: ${MAINTENANCE_FLUID.below135}.`,
          kind: 'conduct',
          dose: { drug: 'Salina 0,9%', pattern: /(?<amount>\d+–\d+ mL\/h)/ },
        },
        {
          raw: `Fluido de manutenção, sódio corrigido de 135 mEq/L ou mais: ${MAINTENANCE_FLUID.atOrAbove135}.`,
          kind: 'conduct',
          dose: { drug: 'Salina 0,45%', pattern: /(?<amount>\d+–\d+ mL\/h)/ },
        },
        ...DEXTROSE_TRIGGER.map(
          (raw): CadLine => ({
            raw,
            kind: 'conduct',
            dose: /mL\/h/.test(raw)
              ? { drug: 'dextrose', pattern: /(?<amount>\d+–\d+ mL\/h)/ }
              : undefined,
          }),
        ),
        { raw: OVERLOAD_ALERT, kind: 'pitfall' },
      ],
    }),
    cadDraft({
      id: 'insulina-basal',
      findingTerms: ['insulina basal', 'transição SC'],
      label: 'Insulina basal durante a infusão',
      topic: 'Insulina basal durante a infusão de insulina na CAD',
      question: 'Pode-se dar insulina basal durante a infusão de insulina na CAD, e em que dose?',
      jbds: 'cad',
      lines: BASAL_INSULIN.map(
        (raw): CadLine => ({
          raw,
          kind: 'conduct',
          dose: /U\/kg/.test(raw)
            ? { drug: 'insulina basal', pattern: /(?<amount>\d+(?:,\d+)? a \d+(?:,\d+)? U\/kg)/ }
            : undefined,
        }),
      ),
    }),
    cadDraft({
      id: 'fosfato',
      findingTerms: ['fosfato'],
      label: 'Fosfato na CAD',
      topic: 'Reposição de fosfato na CAD e no EHH',
      question: 'Quando e quanto repor fosfato na cetoacidose diabética?',
      jbds: 'cad',
      lines: PHOSPHATE.map(
        (raw): CadLine => ({
          raw,
          kind: /não (?:é )?indicad|excessivamente/.test(raw) ? 'pitfall' : 'conduct',
          dose: /mmol de fosfato/.test(raw)
            ? { drug: 'fosfato de potássio', pattern: /(?<amount>\d+ a \d+ mmol)/ }
            : undefined,
        }),
      ),
    }),
  ];
}
