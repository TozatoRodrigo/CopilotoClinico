import {
  IV_PREPARATION,
  KETAMINE_CALCULATOR,
  KETOFOL_SCREEN,
  DURING,
  PREFER_IF_LABEL,
  RED_FLAGS,
  SCREEN_INFO,
  SEDATION_CHECKLISTS,
  SEDATION_CHOICES,
  type MedicationOption,
  type RegimenCard,
  type SedationNotice,
} from '../../src/shared/clinical-tools/sedation/content';
import {
  deriveSedation,
  type SedationBlock,
} from '../../src/shared/clinical-tools/sedation/derive';
import {
  formatRegimen,
  ketamineImTexts,
  KETOFOL,
  ketofolConcentrationText,
  ketofolEachText,
  ketofolVolumeText,
  medicationDoseLine,
  mixtureAmount,
  regimenTitle,
  REGIMENS,
} from '../../src/shared/clinical-tools/sedation/doses';
import type { SedationState } from '../../src/shared/clinical-tools/sedation/state';

/**
 * Textos de cada tela do porte, tirados dos blocos que o motor manda desenhar
 * (`deriveSedation`), para os testes de paridade com o ANY. A tela usa os
 * mesmos blocos e os mesmos formatadores.
 */

/**
 * Comparação tolerante ao que o porte mudou de propósito sem mudar conteúdo:
 * acento, caixa, espaço, travessão, aspas, setas de marcador, "máx." e o nome
 * da droga (Ketamina/Ketofol → Cetamina/Cetofol, como na Via aérea).
 */
function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[→←]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/\bketamina\b/g, 'cetamina')
    .replace(/\bketofol\b/g, 'cetofol')
    .replace(/\bmax\./g, 'max')
    .replace(/\s+/g, '');
}

const NORMALIZED = new Map<string, string>();

/** `normalize` com memória: os testes de paridade normalizam os mesmos textos milhares de vezes. */
export function normalizeText(text: string): string {
  let normalized = NORMALIZED.get(text);
  if (normalized === undefined) {
    normalized = normalize(text);
    NORMALIZED.set(text, normalized);
  }
  return normalized;
}

/**
 * Trechos do ANY reescritos de propósito, com o texto novo: sugestão em vez de
 * ordem (ADR-017) e red flags marcáveis em vez de "clique para expandir". Vão
 * também para docs/ferramentas/revisao-clinica/sedacao.md.
 */
export const REPHRASED: readonly { any: string; ported: string; why: string }[] = [
  {
    any: 'Mantenha comunicação clara com o paciente durante o procedimento. Explique cada etapa.',
    ported:
      'Considere manter comunicação clara com o paciente durante o procedimento e explicar cada etapa.',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Reduza estímulos (som, pessoas)',
    ported: 'Considere reduzir estímulos (som, pessoas)',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Evitar Midazolam se:',
    ported: 'Considere evitar midazolam se:',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Usar apenas Ketamina IM',
    ported: 'considere apenas cetamina IM',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Otimize antes da sedação (volume, vasopressor)',
    ported: 'Considere otimizar antes da sedação (volume, vasopressor)',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Otimize proteção de via aérea',
    ported: 'Considere otimizar proteção de via aérea',
    why: 'sugestão em vez de ordem',
  },
  {
    any: 'Red Flags — clique para expandir',
    ported: 'Red flags',
    why: 'os red flags são caixas de marcar, não um bloco que se expande',
  },
  {
    any: 'Clique nas condições presentes para ver alertas específicos',
    ported: 'Marque as condições presentes para ver alertas específicos',
    why: 'os red flags são caixas de marcar',
  },
];

/** Texto do ANY normalizado, com os trechos reescritos já trocados pelo texto novo. */
export function anyText(text: string): string {
  return REPHRASED.reduce(
    (normalized, { any, ported }) =>
      normalized.includes(normalizeText(any))
        ? normalized.replaceAll(normalizeText(any), normalizeText(ported))
        : normalized,
    normalizeText(text),
  );
}

export function noticeStrings(notice: SedationNotice): string[] {
  return [notice.title, ...notice.lines];
}

export function regimenCardStrings(card: RegimenCard): string[] {
  return [
    card.title,
    ...card.regimens.map(
      (id, index) => `${index === 0 ? '' : 'ou '}${formatRegimen(REGIMENS[id], { names: true })}`,
    ),
    ...card.notes,
  ];
}

export function medicationStrings(option: MedicationOption<string>): string[] {
  const regimen = REGIMENS[option.regimen];
  return [
    regimenTitle(regimen),
    medicationDoseLine(regimen),
    option.timing,
    ...(option.preferIf ? [`${PREFER_IF_LABEL} ${option.preferIf}`] : []),
  ];
}

export function blockStrings(block: SedationBlock, redFlags: readonly string[]): string[] {
  switch (block.kind) {
    case 'notice':
      return noticeStrings(block.notice);
    case 'question':
    case 'outcome':
      return [block.title, block.text];
    case 'regimen':
      return regimenCardStrings(block.card);
    case 'choices':
      return [
        block.section.title ?? '',
        block.section.prompt ?? '',
        ...block.choices.flatMap((id) => [
          SEDATION_CHOICES[id].title,
          SEDATION_CHOICES[id].description,
        ]),
      ];
    case 'recent-sedation':
      return [block.question];
    case 'urgent-im':
    case 'combative':
      return [block.legend, ...block.options.flatMap(medicationStrings)];
    case 'ketamine-calculator': {
      const texts = block.dose ? ketamineImTexts(block.dose) : null;
      return [
        KETAMINE_CALCULATOR.title,
        ...(texts
          ? [
              KETAMINE_CALCULATOR.doseLabel,
              texts.dose,
              KETAMINE_CALCULATOR.volumeLabel,
              texts.volume,
            ]
          : []),
      ];
    }
    case 'checklist': {
      const checklist = SEDATION_CHECKLISTS[block.id];
      return [
        checklist.title,
        ...('intro' in checklist ? [checklist.intro] : []),
        ...('notice' in checklist ? noticeStrings(checklist.notice) : []),
        ...checklist.items.map(({ title }) => title),
      ];
    }
    case 'red-flags':
      return [
        IV_PREPARATION.redFlagsTitle,
        IV_PREPARATION.redFlagsHint,
        ...RED_FLAGS.flatMap((flag) => [
          flag.title,
          // O detalhe só aparece com o red flag marcado, como no ANY.
          ...(redFlags.includes(flag.id)
            ? [flag.emphasis ?? '', ...flag.paragraphs, flag.listTitle ?? '', ...flag.items]
            : []),
        ]),
      ];
    case 'ketofol-mixture':
      return [
        KETOFOL_SCREEN.preparationTitle,
        ...KETOFOL.mixture.flatMap((component) => [component.label, mixtureAmount(component)]),
        KETOFOL_SCREEN.totalLabel,
        `${KETOFOL.totalVolumeMl} mL`,
        `${KETOFOL_SCREEN.concentrationLabel} ${ketofolConcentrationText()}`,
      ];
    case 'ketofol-doses': {
      const { doses } = block;
      return [
        KETOFOL_SCREEN.dosesTitle,
        ...noticeStrings(block.basis),
        ...(doses
          ? [
              KETOFOL_SCREEN.inductionTitle,
              KETOFOL_SCREEN.inductionDoseLabel,
              ketofolEachText(doses.induction),
              KETOFOL_SCREEN.inductionVolumeLabel,
              ketofolVolumeText(doses.induction),
              KETOFOL_SCREEN.maintenanceTitle,
              KETOFOL_SCREEN.maintenanceDoseLabel,
              ketofolEachText(doses.maintenance),
              KETOFOL_SCREEN.maintenanceVolumeLabel,
              ketofolVolumeText(doses.maintenance),
              KETOFOL_SCREEN.maintenanceRepeat,
            ]
          : []),
      ];
    }
    case 'monitoring':
      return [
        DURING.monitoringTitle,
        ...DURING.monitoring.flatMap(({ title, detail }) => [title, detail]),
      ];
    case 'complications':
      return [DURING.complicationsTitle, ...DURING.complications.flatMap(noticeStrings)];
  }
}

/** Todos os textos da tela do porte para o estado e o peso. */
export function screenStrings(state: SedationState, weightRaw: string): string[] {
  const view = deriveSedation(state, weightRaw);
  return [
    SCREEN_INFO[view.screen].title,
    ...view.blocks.flatMap((block) => blockStrings(block, state.redFlags)),
    ...(view.next ? [view.next.label] : []),
  ].filter((text) => text !== '');
}
