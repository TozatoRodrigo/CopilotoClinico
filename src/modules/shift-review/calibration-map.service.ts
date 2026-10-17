import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import type {
  ShiftReviewMapState,
  ShiftReviewStudySuggestion,
} from '../../shared/contracts/shift-review';
import {
  calibrationMapOf,
  studyThemesOf,
  summarizeThemes,
  type CalibrationAnswer,
  type ThemeSummary,
} from './calibration-map';
import {
  CALIBRATION_MAP_MAX_ANSWERS,
  CALIBRATION_MAP_MIN_ANSWERS,
  CALIBRATION_THEME_MIN_ANSWERS,
  readShiftReviewEnabled,
} from './shift-review.settings';
import { parseStoredSource, parseSyndrome } from './shift-review.views';
import { SHIFT_REVIEW_STUDY_SUGGESTIONS, type StudySuggestionSource } from './study-suggestions';

/**
 * CC-802 — "Seu mapa": onde o médico acerta sabendo, acerta chutando e erra
 * marcando "Sei", por tema, a partir das respostas do "Revise seu plantão".
 *
 * Só as respostas do próprio médico (o id vem do token): não há agregado entre
 * médicos. Lê as respostas mais recentes, até `CALIBRATION_MAP_MAX_ANSWERS`.
 * Logs só com contagens: nada de tema, pergunta ou fonte.
 */
@Injectable()
export class CalibrationMapService {
  private readonly logger = new Logger(CalibrationMapService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SHIFT_REVIEW_STUDY_SUGGESTIONS) private readonly suggestions: StudySuggestionSource,
  ) {}

  async getMap(physicianId: string): Promise<ShiftReviewMapState> {
    if (!readShiftReviewEnabled(this.config)) return { status: 'disabled' };

    const answers = await this.loadAnswers(physicianId);
    if (answers.length < CALIBRATION_MAP_MIN_ANSWERS) {
      return {
        status: 'insufficient',
        answered: answers.length,
        required: CALIBRATION_MAP_MIN_ANSWERS,
      };
    }

    const themes = summarizeThemes(answers, CALIBRATION_THEME_MIN_ANSWERS);
    const suggestions = await this.suggestionsFor(themes);
    const map = calibrationMapOf(themes, suggestions, CALIBRATION_THEME_MIN_ANSWERS);
    const mapped = map.themes.filter((theme) => theme.status === 'mapped');
    this.logger.log(
      `SHIFT_REVIEW_MAP answered=${map.answered} calibrated=${map.calibrated} ` +
        `themes=${map.themes.length} mapped=${mapped.length} ` +
        `toStudy=${mapped.filter((theme) => theme.quadrants.knew_wrong > 0).length}`,
    );
    return { status: 'ready', map };
  }

  /** Respostas completas do médico, da mais recente para a mais antiga. */
  private async loadAnswers(physicianId: string): Promise<CalibrationAnswer[]> {
    const rows = await this.prisma.shiftReviewQuestion.findMany({
      where: {
        physicianId,
        answeredAt: { not: null },
        confidence: { not: null },
        correct: { not: null },
      },
      orderBy: [{ answeredAt: 'desc' }, { id: 'asc' }],
      take: CALIBRATION_MAP_MAX_ANSWERS,
      select: { syndrome: true, topic: true, confidence: true, correct: true, source: true },
    });
    return rows.flatMap(({ syndrome, topic, confidence, correct, source }) =>
      confidence !== null && correct !== null
        ? [
            {
              syndrome: parseSyndrome(syndrome),
              topic,
              confidence,
              correct,
              source: parseStoredSource(source),
            },
          ]
        : [],
    );
  }

  /**
   * Sugestões para os temas com erro marcando "Sei". Falha do provedor não
   * derruba o mapa: os temas saem sem sugestão e o erro vai para o log.
   */
  private async suggestionsFor(
    themes: readonly ThemeSummary[],
  ): Promise<ReadonlyMap<string, ShiftReviewStudySuggestion[]>> {
    const toStudy = studyThemesOf(themes);
    if (toStudy.length === 0) return new Map();
    try {
      return await this.suggestions.suggest(toStudy);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.error(
        `SHIFT_REVIEW_MAP_SUGGESTIONS_ERROR themes=${toStudy.length} error=${name}`,
      );
      if (process.env.SENTRY_DSN) {
        Sentry.captureMessage('SHIFT_REVIEW_MAP_SUGGESTIONS_ERROR', {
          level: 'error',
          tags: { component: 'shift-review-map' },
          extra: { themes: toStudy.length, errorName: name },
        });
      }
      return new Map();
    }
  }
}
