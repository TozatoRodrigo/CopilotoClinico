import type { PsSyndrome } from '../../shared/contracts/clinical';
import {
  SHIFT_REVIEW_QUADRANTS,
  type ShiftReviewCalibrationMap,
  type ShiftReviewConfidence,
  type ShiftReviewMapTheme,
  type ShiftReviewQuadrant,
  type ShiftReviewQuadrantTally,
  type ShiftReviewStudySuggestion,
} from '../../shared/contracts/shift-review';
import type { ShiftReviewStoredSource } from './review-material';
import type { StudyTheme } from './study-suggestions';

/**
 * CC-802 — mapa de calibração: agrega as respostas do médico por tema e
 * quadrante (acerto × o quanto sabia). Funções puras; a leitura do banco e as
 * sugestões ficam em calibration-map.service.ts.
 */

/** Uma resposta como o mapa a lê de `shift_review_questions`. */
export interface CalibrationAnswer {
  /** Síndrome já validada contra `PS_SYNDROMES`. */
  syndrome: PsSyndrome | null;
  topic: string;
  confidence: ShiftReviewConfidence;
  correct: boolean;
  /** Fonte da pergunta; `null` se o JSON gravado não for legível. */
  source: ShiftReviewStoredSource | null;
}

/** Temas listados por tema do mapa: bastam para o médico reconhecer o assunto. */
const MAX_THEME_TOPICS = 3;

/** "Tenho dúvida" e "Chutei" contam como não saber: o médico não afirmou saber. */
export function quadrantOf(
  confidence: ShiftReviewConfidence,
  correct: boolean,
): ShiftReviewQuadrant {
  const knew = confidence === 'know';
  if (correct) return knew ? 'knew_right' : 'guessed_right';
  return knew ? 'knew_wrong' : 'guessed_wrong';
}

/** A certeza previu o resultado: sabia e acertou, ou não sabia e errou. */
export function isCalibrated(quadrant: ShiftReviewQuadrant): boolean {
  return quadrant === 'knew_right' || quadrant === 'guessed_wrong';
}

export function emptyQuadrants(): ShiftReviewQuadrantTally {
  return Object.fromEntries(
    SHIFT_REVIEW_QUADRANTS.map((quadrant) => [quadrant, 0]),
  ) as ShiftReviewQuadrantTally;
}

/**
 * O tema é escrito pelo modelo ("Sepse", "sepse ", "Sepse!"): sem acento,
 * caixa e pontuação, as variações caem no mesmo tema.
 */
export function normalizeTopic(topic: string): string {
  return topic
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * O tema do mapa é a síndrome de PS (lista fechada, estável entre semanas).
 * Sem síndrome, ou com "outro" (que juntaria assuntos sem relação), o tema é
 * o texto da pergunta normalizado.
 */
export function themeOf(answer: Pick<CalibrationAnswer, 'syndrome' | 'topic'>): {
  key: string;
  syndrome: PsSyndrome | null;
} {
  if (answer.syndrome && answer.syndrome !== 'outro') {
    return { key: `syndrome:${answer.syndrome}`, syndrome: answer.syndrome };
  }
  return { key: `topic:${normalizeTopic(answer.topic)}`, syndrome: null };
}

/** Um tema já somado, antes das sugestões de estudo. */
export interface ThemeSummary {
  key: string;
  syndrome: PsSyndrome | null;
  topics: string[];
  answered: number;
  correct: number;
  calibrated: number;
  quadrants: ShiftReviewQuadrantTally;
  /** Tem respostas para mostrar os quadrantes. */
  mapped: boolean;
  /** Fontes das perguntas, as de "Sei" errado primeiro, depois as outras erradas. */
  citedSources: ShiftReviewStoredSource[];
}

interface ThemeAccumulator {
  key: string;
  syndrome: PsSyndrome | null;
  answers: CalibrationAnswer[];
}

const SOURCE_PRIORITY: Record<ShiftReviewQuadrant, number> = {
  knew_wrong: 0,
  guessed_wrong: 1,
  guessed_right: 2,
  knew_right: 3,
};

/** Temas pela frequência; empate fica com a grafia mais recente (as respostas vêm da mais nova). */
function topicsOf(answers: readonly CalibrationAnswer[]): string[] {
  const byNormalized = new Map<string, { label: string; count: number; firstSeen: number }>();
  answers.forEach((answer, index) => {
    const label = answer.topic.trim();
    const normalized = normalizeTopic(label);
    if (!normalized) return;
    const entry = byNormalized.get(normalized);
    if (entry) entry.count += 1;
    else byNormalized.set(normalized, { label, count: 1, firstSeen: index });
  });
  return [...byNormalized.values()]
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, MAX_THEME_TOPICS)
    .map((entry) => entry.label);
}

function summarizeTheme(group: ThemeAccumulator, minThemeAnswers: number): ThemeSummary {
  const quadrants = emptyQuadrants();
  let correct = 0;
  let calibrated = 0;
  const ranked: { source: ShiftReviewStoredSource; priority: number; index: number }[] = [];
  group.answers.forEach((answer, index) => {
    const quadrant = quadrantOf(answer.confidence, answer.correct);
    quadrants[quadrant] += 1;
    if (answer.correct) correct += 1;
    if (isCalibrated(quadrant)) calibrated += 1;
    if (answer.source)
      ranked.push({ source: answer.source, priority: SOURCE_PRIORITY[quadrant], index });
  });
  ranked.sort((a, b) => a.priority - b.priority || a.index - b.index);
  return {
    key: group.key,
    syndrome: group.syndrome,
    topics: topicsOf(group.answers),
    answered: group.answers.length,
    correct,
    calibrated,
    quadrants,
    mapped: group.answers.length >= minThemeAnswers,
    citedSources: ranked.map(({ source }) => source),
  };
}

/** Respostas (da mais recente para a mais antiga) somadas por tema. */
export function summarizeThemes(
  answers: readonly CalibrationAnswer[],
  minThemeAnswers: number,
): ThemeSummary[] {
  const groups = new Map<string, ThemeAccumulator>();
  for (const answer of answers) {
    const { key, syndrome } = themeOf(answer);
    const group = groups.get(key) ?? { key, syndrome, answers: [] };
    group.answers.push(answer);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => summarizeTheme(group, minThemeAnswers));
}

/** Os temas que pedem estudo: com dados suficientes e erro marcando "Sei". */
export function studyThemesOf(themes: readonly ThemeSummary[]): StudyTheme[] {
  return themes
    .filter((theme) => theme.mapped && theme.quadrants.knew_wrong > 0)
    .map(({ key, syndrome, topics, citedSources }) => ({ key, syndrome, topics, citedSources }));
}

/**
 * Ordem do mapa: primeiro o perigoso (mais erros marcando "Sei"), depois a
 * pior calibração; os temas com poucos dados no fim, pelo volume.
 */
function compareThemes(a: ThemeSummary, b: ThemeSummary): number {
  if (a.mapped !== b.mapped) return a.mapped ? -1 : 1;
  if (a.mapped) {
    const byDanger = b.quadrants.knew_wrong - a.quadrants.knew_wrong;
    if (byDanger !== 0) return byDanger;
    const byCalibration = a.calibrated / a.answered - b.calibrated / b.answered;
    if (byCalibration !== 0) return byCalibration;
  }
  return b.answered - a.answered || a.key.localeCompare(b.key);
}

function themeView(
  theme: ThemeSummary,
  suggestions: ReadonlyMap<string, ShiftReviewStudySuggestion[]>,
): ShiftReviewMapTheme {
  const base = {
    key: theme.key,
    syndrome: theme.syndrome,
    topics: theme.topics,
    answered: theme.answered,
  };
  if (!theme.mapped) return { ...base, status: 'few_answers' };
  return {
    ...base,
    status: 'mapped',
    correct: theme.correct,
    calibrated: theme.calibrated,
    quadrants: theme.quadrants,
    studySuggestions: theme.quadrants.knew_wrong > 0 ? (suggestions.get(theme.key) ?? []) : [],
  };
}

/** O mapa: totais de todas as respostas e os temas na ordem de leitura. */
export function calibrationMapOf(
  themes: readonly ThemeSummary[],
  suggestions: ReadonlyMap<string, ShiftReviewStudySuggestion[]>,
  minThemeAnswers: number,
): ShiftReviewCalibrationMap {
  const quadrants = emptyQuadrants();
  let answered = 0;
  let correct = 0;
  let calibrated = 0;
  for (const theme of themes) {
    answered += theme.answered;
    correct += theme.correct;
    calibrated += theme.calibrated;
    for (const quadrant of SHIFT_REVIEW_QUADRANTS) quadrants[quadrant] += theme.quadrants[quadrant];
  }
  return {
    answered,
    correct,
    calibrated,
    quadrants,
    minThemeAnswers,
    themes: [...themes].sort(compareThemes).map((theme) => themeView(theme, suggestions)),
  };
}
