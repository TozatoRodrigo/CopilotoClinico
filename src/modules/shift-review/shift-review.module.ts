import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { ShiftReviewCronService } from '../../workers/shift-review-cron.service';
import { NoCardSource, SHIFT_REVIEW_CARD_SOURCE } from './card-material';
import { ReviewQuestionGenerator } from './review-question-generator.service';
import { ShiftReviewController } from './shift-review.controller';
import { ShiftReviewService } from './shift-review.service';

/**
 * CC-801 — "Revise seu plantão". Quando os cartões revisados (CC-402)
 * entrarem na análise, `SHIFT_REVIEW_CARD_SOURCE` passa a apontar para o
 * provedor que lê os cartões citados (ver card-material.ts).
 */
@Module({
  imports: [AiGatewayModule],
  controllers: [ShiftReviewController],
  providers: [
    ShiftReviewService,
    ReviewQuestionGenerator,
    ShiftReviewCronService,
    { provide: SHIFT_REVIEW_CARD_SOURCE, useClass: NoCardSource },
  ],
  exports: [ShiftReviewService],
})
export class ShiftReviewModule {}
