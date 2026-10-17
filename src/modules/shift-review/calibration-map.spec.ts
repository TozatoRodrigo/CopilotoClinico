import { describe, expect, it } from 'vitest';
import type { ShiftReviewStudySuggestion } from '../../shared/contracts/shift-review';
import {
  calibrationMapOf,
  emptyQuadrants,
  isCalibrated,
  normalizeTopic,
  quadrantOf,
  studyThemesOf,
  summarizeThemes,
  themeOf,
  type CalibrationAnswer,
} from './calibration-map';
import type { ShiftReviewStoredSource } from './review-material';

function citation(title: string, version: string | null = '2024'): ShiftReviewStoredSource {
  return {
    kind: 'analysis_citation',
    chunkId: `chunk-${title}`,
    title,
    version,
    origin: 'official_unreviewed',
    url: null,
    excerpt: `Trecho de ${title}`,
  };
}

function answer(overrides: Partial<CalibrationAnswer> = {}): CalibrationAnswer {
  return {
    syndrome: 'cefaleia',
    topic: 'Cefaleia em trovoada',
    confidence: 'know',
    correct: true,
    source: citation('Diretriz de cefaleia'),
    ...overrides,
  };
}

function times(count: number, overrides: Partial<CalibrationAnswer> = {}): CalibrationAnswer[] {
  return Array.from({ length: count }, () => answer(overrides));
}

describe('quadrantes do mapa', () => {
  it.each([
    ['know', true, 'knew_right'],
    ['unsure', true, 'guessed_right'],
    ['guessed', true, 'guessed_right'],
    ['know', false, 'knew_wrong'],
    ['unsure', false, 'guessed_wrong'],
    ['guessed', false, 'guessed_wrong'],
  ] as const)('%s + correct=%s is %s', (confidence, correct, quadrant) => {
    expect(quadrantOf(confidence, correct)).toBe(quadrant);
  });

  it('counts as calibrated only when what the physician marked predicted the result', () => {
    expect(isCalibrated('knew_right')).toBe(true);
    expect(isCalibrated('guessed_wrong')).toBe(true);
    expect(isCalibrated('guessed_right')).toBe(false);
    expect(isCalibrated('knew_wrong')).toBe(false);
  });
});

describe('tema da resposta', () => {
  it('uses the PS syndrome when there is one', () => {
    expect(themeOf({ syndrome: 'dor-toracica', topic: 'SCA' })).toEqual({
      key: 'syndrome:dor-toracica',
      syndrome: 'dor-toracica',
    });
  });

  it('falls back to the normalized topic without syndrome or with "outro"', () => {
    expect(themeOf({ syndrome: null, topic: 'Hipercalemia' })).toEqual({
      key: 'topic:hipercalemia',
      syndrome: null,
    });
    expect(themeOf({ syndrome: 'outro', topic: ' Hipercalemia! ' }).key).toBe('topic:hipercalemia');
  });

  it('normalizes accents, case and punctuation of the topic', () => {
    expect(normalizeTopic('  Hemorragia Subaracnóidea (HSA) ')).toBe(
      'hemorragia subaracnoidea hsa',
    );
    expect(normalizeTopic('Hemorragia subaracnoidea — HSA')).toBe('hemorragia subaracnoidea hsa');
  });
});

describe('summarizeThemes', () => {
  it('adds the answers of each theme by quadrant, accuracy and calibration', () => {
    const themes = summarizeThemes(
      [
        answer({ confidence: 'know', correct: true }),
        answer({ confidence: 'know', correct: false }),
        answer({ confidence: 'guessed', correct: true }),
        answer({ confidence: 'unsure', correct: false }),
        answer({ syndrome: 'febre-hipotensao', topic: 'Sepse', confidence: 'know', correct: true }),
      ],
      3,
    );

    const headache = themes.find((theme) => theme.key === 'syndrome:cefaleia');
    expect(headache).toMatchObject({
      syndrome: 'cefaleia',
      answered: 4,
      correct: 2,
      calibrated: 2,
      quadrants: { knew_right: 1, guessed_right: 1, knew_wrong: 1, guessed_wrong: 1 },
      mapped: true,
    });
    expect(themes.find((theme) => theme.key === 'syndrome:febre-hipotensao')).toMatchObject({
      answered: 1,
      mapped: false,
    });
  });

  it('marks as mapped only the themes with the minimum number of answers', () => {
    const themes = summarizeThemes(
      [...times(2), ...times(3, { syndrome: 'dispneia', topic: 'Asma' })],
      3,
    );

    expect(themes.find((theme) => theme.key === 'syndrome:cefaleia')?.mapped).toBe(false);
    expect(themes.find((theme) => theme.key === 'syndrome:dispneia')?.mapped).toBe(true);
  });

  it('lists the topics of a syndrome by frequency, keeping the most recent spelling', () => {
    const [theme] = summarizeThemes(
      [
        answer({ topic: 'Hemorragia subaracnóidea' }),
        answer({ topic: 'Enxaqueca' }),
        answer({ topic: 'hemorragia subaracnoidea' }),
        answer({ topic: 'Cefaleia em trovoada' }),
        answer({ topic: 'Meningite' }),
        answer({ topic: 'Enxaqueca' }),
      ],
      3,
    );

    expect(theme?.topics).toEqual([
      'Hemorragia subaracnóidea',
      'Enxaqueca',
      'Cefaleia em trovoada',
    ]);
  });

  it('puts the sources of the confident misses first', () => {
    const [theme] = summarizeThemes(
      [
        answer({ confidence: 'know', correct: true, source: citation('Acertou sabendo') }),
        answer({ confidence: 'guessed', correct: false, source: citation('Errou chutando') }),
        answer({ confidence: 'know', correct: false, source: citation('Errou com Sei') }),
        answer({ confidence: 'know', correct: false, source: null }),
      ],
      3,
    );

    expect(theme?.citedSources.map((source) => source.title)).toEqual([
      'Errou com Sei',
      'Errou chutando',
      'Acertou sabendo',
    ]);
  });
});

describe('studyThemesOf', () => {
  it('asks to study only mapped themes with a confident miss', () => {
    const themes = summarizeThemes(
      [
        ...times(3, { confidence: 'know', correct: false }),
        ...times(3, { syndrome: 'dispneia', topic: 'Asma', confidence: 'guessed', correct: false }),
        answer({ syndrome: 'febre', topic: 'Febre sem foco', confidence: 'know', correct: false }),
      ],
      3,
    );

    expect(studyThemesOf(themes).map((theme) => theme.key)).toEqual(['syndrome:cefaleia']);
  });
});

describe('calibrationMapOf', () => {
  const suggestion: ShiftReviewStudySuggestion = {
    kind: 'cited_source',
    title: 'Diretriz de cefaleia',
    version: '2024',
    origin: 'official_unreviewed',
    url: null,
    excerpt: 'Trecho',
  };

  it('totals every answer, few-data themes included', () => {
    const themes = summarizeThemes(
      [
        ...times(3, { confidence: 'know', correct: true }),
        answer({ syndrome: 'febre', topic: 'Febre', confidence: 'unsure', correct: false }),
      ],
      3,
    );

    const map = calibrationMapOf(themes, new Map(), 3);

    expect(map).toMatchObject({
      answered: 4,
      correct: 3,
      calibrated: 4,
      minThemeAnswers: 3,
      quadrants: { ...emptyQuadrants(), knew_right: 3, guessed_wrong: 1 },
    });
  });

  it('shows no breakdown for themes with few answers', () => {
    const themes = summarizeThemes(times(2, { confidence: 'know', correct: false }), 3);

    const [theme] = calibrationMapOf(themes, new Map(), 3).themes;

    expect(theme).toEqual({
      key: 'syndrome:cefaleia',
      syndrome: 'cefaleia',
      topics: ['Cefaleia em trovoada'],
      answered: 2,
      status: 'few_answers',
    });
  });

  it('orders the dangerous themes first, then the worst calibration, then few data', () => {
    const themes = summarizeThemes(
      [
        // Bem calibrado: 3 "Sei" certos.
        ...times(3, { syndrome: 'dispneia', topic: 'Asma', confidence: 'know', correct: true }),
        // Mal calibrado, sem erro com "Sei": acerta chutando.
        ...times(3, { syndrome: 'febre', topic: 'Febre', confidence: 'guessed', correct: true }),
        // Poucos dados, mesmo com erro com "Sei".
        ...times(2, { syndrome: 'vertigem', topic: 'VPPB', confidence: 'know', correct: false }),
        // Um erro com "Sei".
        answer({ confidence: 'know', correct: false }),
        ...times(2, { confidence: 'know', correct: true }),
        // Três erros com "Sei".
        ...times(3, { syndrome: 'dor-toracica', topic: 'SCA', confidence: 'know', correct: false }),
      ],
      3,
    );

    const map = calibrationMapOf(themes, new Map(), 3);

    expect(map.themes.map((theme) => [theme.key, theme.status])).toEqual([
      ['syndrome:dor-toracica', 'mapped'],
      ['syndrome:cefaleia', 'mapped'],
      ['syndrome:febre', 'mapped'],
      ['syndrome:dispneia', 'mapped'],
      ['syndrome:vertigem', 'few_answers'],
    ]);
  });

  it('attaches study suggestions only to themes with a confident miss', () => {
    const themes = summarizeThemes(
      [
        ...times(3, { confidence: 'know', correct: false }),
        ...times(3, { syndrome: 'dispneia', topic: 'Asma', confidence: 'know', correct: true }),
      ],
      3,
    );
    const suggestions = new Map([
      ['syndrome:cefaleia', [suggestion]],
      ['syndrome:dispneia', [suggestion]],
    ]);

    const map = calibrationMapOf(themes, suggestions, 3);

    const byKey = new Map(map.themes.map((theme) => [theme.key, theme]));
    const headache = byKey.get('syndrome:cefaleia');
    const dyspnea = byKey.get('syndrome:dispneia');
    expect(headache?.status === 'mapped' && headache.studySuggestions).toEqual([suggestion]);
    expect(dyspnea?.status === 'mapped' && dyspnea.studySuggestions).toEqual([]);
  });
});
