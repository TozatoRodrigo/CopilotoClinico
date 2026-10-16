import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShiftReviewService } from '../modules/shift-review/shift-review.service';
import { ShiftReviewCronService } from './shift-review-cron.service';

describe('ShiftReviewCronService', () => {
  let reviews: { isEnabled: ReturnType<typeof vi.fn>; generateWeekly: ReturnType<typeof vi.fn> };
  let cron: ShiftReviewCronService;

  beforeEach(() => {
    reviews = {
      isEnabled: vi.fn().mockReturnValue(true),
      generateWeekly: vi.fn().mockResolvedValue({ generated: 2, failed: 1 }),
    };
    cron = new ShiftReviewCronService(reviews as unknown as ShiftReviewService);
  });

  it('does nothing with the flag off', async () => {
    reviews.isEnabled.mockReturnValue(false);

    await cron.generateWeeklyReviews();

    expect(reviews.generateWeekly).not.toHaveBeenCalled();
  });

  it('generates the weekly reviews with the flag on', async () => {
    await cron.generateWeeklyReviews();

    expect(reviews.generateWeekly).toHaveBeenCalledTimes(1);
  });

  it('never throws out of the scheduler', async () => {
    reviews.generateWeekly.mockRejectedValue(new Error('database down'));

    await expect(cron.generateWeeklyReviews()).resolves.toBeUndefined();
  });
});
