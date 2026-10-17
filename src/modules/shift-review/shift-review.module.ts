import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { ShiftReviewCronService } from '../../workers/shift-review-cron.service';
import { CalibrationMapService } from './calibration-map.service';
import { NoCardSource, SHIFT_REVIEW_CARD_SOURCE } from './card-material';
import { ReviewQuestionGenerator } from './review-question-generator.service';
import { ShiftReviewController } from './shift-review.controller';
import { ShiftReviewService } from './shift-review.service';
import { CitedSourceSuggestions, SHIFT_REVIEW_STUDY_SUGGESTIONS } from './study-suggestions';

/**
 * CC-801 — "Revise seu plantão" e CC-802 — "Seu mapa". Quando os cartões
 * revisados (CC-402) entrarem, `SHIFT_REVIEW_CARD_SOURCE` passa a apontar para
 * o provedor que lê os cartões citados (ver card-material.ts) e
 * `SHIFT_REVIEW_STUDY_SUGGESTIONS` para o que busca os cartões do tema (ver
 * study-suggestions.ts).
 */
@Module({
  imports: [AiGatewayModule],
  controllers: [ShiftReviewController],
  providers: [
    ShiftReviewService,
    ReviewQuestionGenerator,
    ShiftReviewCronService,
    CalibrationMapService,
    { provide: SHIFT_REVIEW_CARD_SOURCE, useClass: NoCardSource },
    { provide: SHIFT_REVIEW_STUDY_SUGGESTIONS, useClass: CitedSourceSuggestions },
  ],
  exports: [ShiftReviewService],
})
export class ShiftReviewModule {}
