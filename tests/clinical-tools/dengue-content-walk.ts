import {
  ALARM_SIGNS,
  alarmCountLabel,
  CALCULATORS_PAGE,
  CLASSIFICATION_REASON,
  DENGUE_GROUP_INFO,
  DENGUE_GROUPS,
  DENGUE_HOME,
  DENGUE_REFERENCES,
  DIRECT_CLASSIFICATION,
  DISCHARGE_PAGE,
  EFASD_PAGE,
  EXAMS_PAGE,
  GRAVITY_SIGNS,
  GROUP_PAGES,
  GROUPS_HUB,
  HEMATOCRIT_FORM,
  PATIENT_MESSAGE_UI,
  RISK_CONDITIONS,
  TRAIL_GROUP_STEP,
  TRAIL_INPATIENT_NOTE,
  TRAIL_STEP_1,
  TRAIL_STEP_2,
  TRAIL_STEP_3,
  TRAIL_STEP_5,
  TRAIL_STEP_TITLES,
  type DengueBlock,
  type DengueGroup,
  type DengueScreenContent,
} from '../../src/shared/clinical-tools/dengue/content';
import {
  fillVolumeText,
  formatFigureDetail,
  formatMilliliters,
  type DengueHydration,
} from '../../src/shared/clinical-tools/dengue/hydration';

/**
 * Textos de cada tela do porte, tirados do conteúdo do motor, para os testes
 * de paridade com o ANY. Com `hydration`, os volumes saem preenchidos como a
 * tela mostra; sem, como "--".
 */

export function blockStrings(block: DengueBlock, hydration: DengueHydration | null): string[] {
  switch (block.kind) {
    case 'notice':
    case 'note':
      return [
        block.title ?? '',
        block.text ? fillVolumeText(block.text, hydration) : '',
        ...(block.items ?? []),
      ];
    case 'paragraph':
      return [block.text];
    case 'list':
      return [...block.items];
    case 'volumes':
      return [
        fillVolumeText(block.label, hydration),
        ...block.figures.flatMap((figure) => [
          figure.caption ?? '',
          formatMilliliters(hydration ? hydration[figure.volume] : null),
          figure.unit,
          figure.detail ? formatFigureDetail(figure.detail, hydration) : '',
        ]),
        block.note ?? '',
      ];
    case 'table':
      return [
        ...block.head,
        ...block.rows.flatMap((row) =>
          row.map((cell) => (typeof cell === 'string' ? cell : cell.group)),
        ),
      ];
    case 'steps':
      return block.items.flatMap(({ title, text }) => [title, text]);
    case 'reclassify':
    case 'link':
      return [block.label];
    case 'hematocrit':
      return [
        HEMATOCRIT_FORM.label,
        HEMATOCRIT_FORM.formula,
        HEMATOCRIT_FORM.baseline.label,
        HEMATOCRIT_FORM.current.label,
        HEMATOCRIT_FORM.resultUnit,
        HEMATOCRIT_FORM.pending,
      ];
  }
}

function blocksStrings(
  blocks: readonly DengueBlock[] | undefined,
  hydration: DengueHydration | null,
): string[] {
  return (blocks ?? []).flatMap((block) => blockStrings(block, hydration));
}

export function pageStrings(
  page: DengueScreenContent,
  hydration: DengueHydration | null,
): string[] {
  return [
    page.title,
    page.subtitle ?? '',
    ...blocksStrings(page.intro, hydration),
    ...page.sections.flatMap((section) => [
      section.title,
      section.badge?.label ?? '',
      ...blocksStrings(section.blocks, hydration),
    ]),
    ...blocksStrings(page.outro, hydration),
  ];
}

/** Telas com volume do peso, na forma do ANY: 'stepGrupo' leva o grupo da trilha. */
export type VolumeScreen =
  | { screen: 'calculadoras' }
  | { screen: 'trilha-4'; group: DengueGroup }
  | { screen: 'grupo'; group: DengueGroup };

export function volumeScreenStrings(
  target: VolumeScreen,
  hydration: DengueHydration | null,
): string[] {
  switch (target.screen) {
    case 'calculadoras':
      return pageStrings(CALCULATORS_PAGE, hydration);
    case 'trilha-4':
      return blocksStrings(TRAIL_GROUP_STEP[target.group], hydration);
    case 'grupo':
      return pageStrings(GROUP_PAGES[target.group], hydration);
  }
}

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];
const groupNames = DENGUE_GROUPS.map((group) => `Grupo ${group}`);

/** Todos os textos de uma tela do porte, sem peso (chave: tela do ANY). */
export function screenStrings(anyScreen: string, trailGroup: DengueGroup | null): string[] {
  switch (anyScreen) {
    case 'home':
      return [
        DENGUE_HOME.adultWarning,
        DENGUE_HOME.trail.title,
        DENGUE_HOME.trail.description,
        ...DENGUE_HOME.entries.flatMap(({ label, description }) => [label, description]),
      ];
    case 'step1':
      return [TRAIL_STEP_TITLES[1], ...blocksStrings(TRAIL_STEP_1, null)];
    case 'step2':
      return [
        TRAIL_STEP_TITLES[2],
        TRAIL_STEP_2.hint,
        TRAIL_STEP_2.rule,
        TRAIL_STEP_2.alarmNotice,
        ...ALARM_SIGNS.map(({ label }) => label),
        ...COUNTS.map(alarmCountLabel),
      ];
    case 'step3':
      return [
        TRAIL_STEP_TITLES[3],
        ...Object.values(TRAIL_STEP_3).flatMap((value) =>
          typeof value === 'string' ? [value] : Object.values(value),
        ),
        ...GRAVITY_SIGNS.map(({ label }) => label),
        ...ALARM_SIGNS.map(({ label }) => label),
        ...RISK_CONDITIONS.map(({ label }) => label),
        ...groupNames,
        ...DENGUE_GROUPS.map((group) => `${TRAIL_STEP_3.openGroup} ${group}`),
        ...DENGUE_GROUPS.flatMap((group) => [
          DENGUE_GROUP_INFO[group].label,
          CLASSIFICATION_REASON[group],
        ]),
      ];
    case 'stepGrupo': {
      const group = trailGroup ?? 'A';
      return [
        `Grupo ${group} — ${DENGUE_GROUP_INFO[group].label}`,
        ...blocksStrings(TRAIL_GROUP_STEP[group], null),
        TRAIL_INPATIENT_NOTE,
      ];
    }
    case 'step5':
      return [TRAIL_STEP_TITLES[5], ...blocksStrings(TRAIL_STEP_5, null)];
    case 'grupos':
      return [
        GROUPS_HUB.title,
        GROUPS_HUB.description,
        ...groupNames,
        ...DENGUE_GROUPS.map((group) => DENGUE_GROUP_INFO[group].hubDescription),
      ];
    case 'classificação': {
      const { alarmSection, tourniquetSection, questions } = DIRECT_CLASSIFICATION;
      return [
        DIRECT_CLASSIFICATION.title,
        DIRECT_CLASSIFICATION.subtitle,
        alarmSection.title,
        alarmSection.badge.label,
        alarmSection.text,
        alarmSection.alarmNotice,
        ...ALARM_SIGNS.map(({ label }) => label),
        ...COUNTS.map(alarmCountLabel),
        tourniquetSection.title,
        tourniquetSection.badge.label,
        ...blocksStrings(tourniquetSection.blocks, null),
        DIRECT_CLASSIFICATION.flowTitle,
        ...questions.flatMap((question) => [
          question.title,
          question.question,
          question.detail ?? '',
          question.yes.label,
          question.no.label,
        ]),
      ];
    }
    case 'grupoA':
    case 'grupoB':
    case 'grupoC':
    case 'grupoD': {
      const group = anyScreen.slice(-1) as DengueGroup;
      return [...pageStrings(GROUP_PAGES[group], null), DENGUE_GROUP_INFO[group].label];
    }
    case 'calculadoras':
      return pageStrings(CALCULATORS_PAGE, null);
    case 'efasd':
      return pageStrings(EFASD_PAGE, null);
    case 'examediff':
      return [
        EXAMS_PAGE.title,
        EXAMS_PAGE.subtitle,
        ...EXAMS_PAGE.sections.flatMap((section) => [
          section.heading ?? '',
          section.title,
          section.badge?.label ?? '',
          ...blocksStrings(section.blocks, null),
        ]),
      ];
    case 'altasegura':
      return [...pageStrings(DISCHARGE_PAGE, null), ...Object.values(PATIENT_MESSAGE_UI)];
    case 'referências':
      return ['Referências', ...DENGUE_REFERENCES];
    default:
      throw new Error(`Tela do ANY sem correspondente: ${anyScreen}`);
  }
}

/**
 * Normaliza para comparar texto do ANY com o do porte: sem acento, sem caixa,
 * sem espaço, sem a marcação de ênfase, e "º", "ª" e "³" como "o", "a" e "3"
 * (o ANY escrevia "3o", "6a", "mm3"; a decomposição NFKD faz essa troca).
 * Assim a correção de acentuação e de grafia não conta como mudança.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[°*]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}
