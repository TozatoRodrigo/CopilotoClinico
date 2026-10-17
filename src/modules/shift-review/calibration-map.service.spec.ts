import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../config/prisma.service';
import { OTHER_PHYSICIAN_ID, PHYSICIAN_ID } from '../../../tests/fixtures/shift-review';
import { CalibrationMapService } from './calibration-map.service';
import {
  CALIBRATION_MAP_MAX_ANSWERS,
  CALIBRATION_MAP_MIN_ANSWERS,
  CALIBRATION_THEME_MIN_ANSWERS,
} from './shift-review.settings';
import { CitedSourceSuggestions, type StudySuggestionSource } from './study-suggestions';

type Confidence = 'know' | 'unsure' | 'guessed';

interface AnswerRow {
  id: string;
  physicianId: string;
  syndrome: string | null;
  topic: string;
  confidence: Confidence | null;
  correct: boolean | null;
  answeredAt: Date | null;
  source: Record<string, unknown>;
}

let sequence = 0;

function row(overrides: Partial<AnswerRow> = {}): AnswerRow {
  sequence += 1;
  return {
    id: `50000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    physicianId: PHYSICIAN_ID,
    syndrome: 'cefaleia',
    topic: 'Cefaleia em trovoada',
    confidence: 'know',
    correct: true,
    answeredAt: new Date(Date.UTC(2026, 9, 1, 12, sequence)),
    source: {
      kind: 'analysis_citation',
      chunkId: 'chunk-hsa-1',
      title: 'Diretriz de cefaleia na emergência',
      version: '2024',
      origin: 'official_unreviewed',
      url: 'https://example.org/cefaleia.pdf',
      excerpt: 'Na cefaleia em trovoada, a TC…',
    },
    ...overrides,
  };
}

function rows(count: number, overrides: Partial<AnswerRow> = {}): AnswerRow[] {
  return Array.from({ length: count }, () => row(overrides));
}

/**
 * Banco de mentira que aplica o `where` do serviço (médico e resposta
 * completa), para o teste de isolamento valer pelo que a consulta pede.
 */
function createPrismaFake(table: AnswerRow[]) {
  const findMany = vi.fn(
    async (args: { where: { physicianId: string }; take: number; select: Record<string, true> }) =>
      table
        .filter(
          (answer) =>
            answer.physicianId === args.where.physicianId &&
            answer.answeredAt !== null &&
            answer.confidence !== null &&
            answer.correct !== null,
        )
        .sort((a, b) => (b.answeredAt?.getTime() ?? 0) - (a.answeredAt?.getTime() ?? 0))
        .slice(0, args.take)
        .map((answer) =>
          Object.fromEntries(
            Object.keys(args.select).map((key) => [key, answer[key as keyof AnswerRow]]),
          ),
        ),
  );
  return { shiftReviewQuestion: { findMany } };
}

describe('CalibrationMapService', () => {
  let env: Record<string, string>;
  let table: AnswerRow[];
  let prisma: ReturnType<typeof createPrismaFake>;
  let suggestions: StudySuggestionSource;

  function service() {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new CalibrationMapService(prisma as unknown as PrismaService, config, suggestions);
  }

  beforeEach(() => {
    sequence = 0;
    env = { COPILOT_SHIFT_REVIEW: 'true' };
    table = [];
    prisma = createPrismaFake(table);
    suggestions = new CitedSourceSuggestions();
  });

  it('is disabled with the flag off, without reading answers', async () => {
    delete env.COPILOT_SHIFT_REVIEW;

    expect(await service().getMap(PHYSICIAN_ID)).toEqual({ status: 'disabled' });
    expect(prisma.shiftReviewQuestion.findMany).not.toHaveBeenCalled();
  });

  it('waits for the minimum number of answers before drawing the map', async () => {
    table.push(...rows(CALIBRATION_MAP_MIN_ANSWERS - 1));
    // Pergunta ainda sem resposta não conta.
    table.push(row({ answeredAt: null, confidence: null, correct: null }));

    expect(await service().getMap(PHYSICIAN_ID)).toEqual({
      status: 'insufficient',
      answered: CALIBRATION_MAP_MIN_ANSWERS - 1,
      required: CALIBRATION_MAP_MIN_ANSWERS,
    });
  });

  it('draws the map by theme and quadrant once there are enough answers', async () => {
    table.push(
      ...rows(8, { confidence: 'know', correct: true }),
      ...rows(2, { confidence: 'know', correct: false }),
      ...rows(5, { syndrome: 'dispneia', topic: 'Asma', confidence: 'guessed', correct: true }),
      ...rows(3, { syndrome: 'dispneia', topic: 'Asma', confidence: 'unsure', correct: false }),
      ...rows(2, { syndrome: null, topic: 'Hipercalemia', confidence: 'know', correct: false }),
    );

    const state = await service().getMap(PHYSICIAN_ID);

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.map).toMatchObject({
      answered: 20,
      correct: 13,
      calibrated: 11,
      minThemeAnswers: CALIBRATION_THEME_MIN_ANSWERS,
      quadrants: { knew_right: 8, guessed_right: 5, knew_wrong: 4, guessed_wrong: 3 },
    });
    expect(state.map.themes).toEqual([
      {
        key: 'syndrome:cefaleia',
        syndrome: 'cefaleia',
        topics: ['Cefaleia em trovoada'],
        answered: 10,
        status: 'mapped',
        correct: 8,
        calibrated: 8,
        quadrants: { knew_right: 8, guessed_right: 0, knew_wrong: 2, guessed_wrong: 0 },
        studySuggestions: [
          {
            kind: 'cited_source',
            title: 'Diretriz de cefaleia na emergência',
            version: '2024',
            origin: 'official_unreviewed',
            url: 'https://example.org/cefaleia.pdf',
            excerpt: 'Na cefaleia em trovoada, a TC…',
          },
        ],
      },
      {
        key: 'syndrome:dispneia',
        syndrome: 'dispneia',
        topics: ['Asma'],
        answered: 8,
        status: 'mapped',
        correct: 5,
        calibrated: 3,
        quadrants: { knew_right: 0, guessed_right: 5, knew_wrong: 0, guessed_wrong: 3 },
        studySuggestions: [],
      },
      {
        key: 'topic:hipercalemia',
        syndrome: null,
        topics: ['Hipercalemia'],
        answered: 2,
        status: 'few_answers',
      },
    ]);
  });

  it('reads only the answers of the physician, never of another one', async () => {
    table.push(
      ...rows(CALIBRATION_MAP_MIN_ANSWERS, { confidence: 'know', correct: true }),
      ...rows(30, { physicianId: OTHER_PHYSICIAN_ID, confidence: 'know', correct: false }),
    );

    const mine = await service().getMap(PHYSICIAN_ID);
    const theirs = await service().getMap(OTHER_PHYSICIAN_ID);

    expect(prisma.shiftReviewQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ physicianId: PHYSICIAN_ID }),
      }),
    );
    expect(mine.status === 'ready' && mine.map.quadrants).toEqual({
      knew_right: CALIBRATION_MAP_MIN_ANSWERS,
      guessed_right: 0,
      knew_wrong: 0,
      guessed_wrong: 0,
    });
    expect(theirs.status === 'ready' && theirs.map.answered).toBe(30);
    expect(theirs.status === 'ready' && theirs.map.quadrants.knew_right).toBe(0);
  });

  it('reads the most recent answers, up to the cap, with complete answers only', async () => {
    await service().getMap(PHYSICIAN_ID);

    expect(prisma.shiftReviewQuestion.findMany).toHaveBeenCalledWith({
      where: {
        physicianId: PHYSICIAN_ID,
        answeredAt: { not: null },
        confidence: { not: null },
        correct: { not: null },
      },
      orderBy: [{ answeredAt: 'desc' }, { id: 'asc' }],
      take: CALIBRATION_MAP_MAX_ANSWERS,
      select: { syndrome: true, topic: true, confidence: true, correct: true, source: true },
    });
  });

  it('asks for suggestions only for themes with a confident miss', async () => {
    const suggest = vi.fn().mockResolvedValue(new Map());
    suggestions = { suggest };
    table.push(...rows(CALIBRATION_MAP_MIN_ANSWERS, { confidence: 'guessed', correct: false }));

    await service().getMap(PHYSICIAN_ID);

    expect(suggest).not.toHaveBeenCalled();
  });

  it('keeps the map when the suggestion source fails', async () => {
    suggestions = { suggest: vi.fn().mockRejectedValue(new TypeError('boom')) };
    table.push(...rows(CALIBRATION_MAP_MIN_ANSWERS, { confidence: 'know', correct: false }));

    const state = await service().getMap(PHYSICIAN_ID);

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    const [theme] = state.map.themes;
    expect(theme?.status === 'mapped' && theme.studySuggestions).toEqual([]);
  });

  it('drops a syndrome outside the closed list to the topic', async () => {
    table.push(...rows(CALIBRATION_MAP_MIN_ANSWERS, { syndrome: 'inventada', topic: 'Sepse' }));

    const state = await service().getMap(PHYSICIAN_ID);

    expect(state.status === 'ready' && state.map.themes.map((theme) => theme.key)).toEqual([
      'topic:sepse',
    ]);
  });
});
