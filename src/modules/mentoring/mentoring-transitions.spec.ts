import { describe, expect, it } from 'vitest';
import {
  isOpenStatus,
  planMentoringTransition,
  type MentoringRequestState,
} from './mentoring-transitions';

const requester = 'requester';
const mentorA = 'mentor-a';
const mentorB = 'mentor-b';

function state(overrides: Partial<MentoringRequestState> = {}): MentoringRequestState {
  return {
    status: 'pending',
    requesterId: requester,
    mentorId: null,
    satisfaction: null,
    ...overrides,
  };
}

describe('planMentoringTransition', () => {
  describe('claim', () => {
    it('takes a pending request for the mentor', () => {
      expect(planMentoringTransition(state(), 'claim', mentorA)).toEqual({
        ok: true,
        status: 'claimed',
        mentorId: mentorA,
      });
    });

    it('is idempotent for the mentor who already claimed it', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'claim', mentorA)).toEqual({
        ok: true,
        status: 'claimed',
        mentorId: mentorA,
      });
    });

    it('refuses a request another mentor already claimed', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'claim', mentorB)).toEqual({
        ok: false,
        refusal: 'claimed_by_other',
      });
    });

    it('refuses a mentor claiming their own request', () => {
      expect(planMentoringTransition(state(), 'claim', requester)).toEqual({
        ok: false,
        refusal: 'own_request',
      });
    });

    it.each(['answered', 'cancelled'] as const)('refuses a %s request', (status) => {
      expect(
        planMentoringTransition(state({ status, mentorId: mentorA }), 'claim', mentorB),
      ).toEqual({
        ok: false,
        refusal: 'invalid_state',
      });
    });
  });

  describe('release', () => {
    it('returns a claimed request to the queue', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'release', mentorA)).toEqual({
        ok: true,
        status: 'pending',
        mentorId: null,
      });
    });

    it('only the mentor who claimed can release it', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'release', mentorB)).toEqual({
        ok: false,
        refusal: 'claimed_by_other',
      });
    });

    it('refuses releasing a request nobody claimed', () => {
      expect(planMentoringTransition(state(), 'release', mentorA)).toEqual({
        ok: false,
        refusal: 'invalid_state',
      });
    });
  });

  describe('answer', () => {
    it('answers straight from pending, taking the request in the same step', () => {
      expect(planMentoringTransition(state(), 'answer', mentorA)).toEqual({
        ok: true,
        status: 'answered',
        mentorId: mentorA,
      });
    });

    it('answers a request the mentor claimed', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'answer', mentorA)).toEqual({
        ok: true,
        status: 'answered',
        mentorId: mentorA,
      });
    });

    it('only the claiming mentor answers a claimed request', () => {
      const claimed = state({ status: 'claimed', mentorId: mentorA });
      expect(planMentoringTransition(claimed, 'answer', mentorB)).toEqual({
        ok: false,
        refusal: 'claimed_by_other',
      });
    });

    it('refuses answering twice or answering a cancelled request', () => {
      const answered = state({ status: 'answered', mentorId: mentorA });
      const cancelled = state({ status: 'cancelled' });
      expect(planMentoringTransition(answered, 'answer', mentorA)).toMatchObject({ ok: false });
      expect(planMentoringTransition(cancelled, 'answer', mentorA)).toEqual({
        ok: false,
        refusal: 'invalid_state',
      });
    });

    it('never lets the requester answer their own request', () => {
      expect(planMentoringTransition(state(), 'answer', requester)).toEqual({
        ok: false,
        refusal: 'own_request',
      });
    });
  });

  describe('cancel', () => {
    it.each(['pending', 'claimed'] as const)('lets the requester cancel a %s request', (status) => {
      const current = state({ status, mentorId: status === 'claimed' ? mentorA : null });
      expect(planMentoringTransition(current, 'cancel', requester)).toEqual({
        ok: true,
        status: 'cancelled',
        mentorId: current.mentorId,
      });
    });

    it('only the requester cancels', () => {
      expect(planMentoringTransition(state(), 'cancel', mentorA)).toEqual({
        ok: false,
        refusal: 'not_requester',
      });
    });

    it('refuses cancelling an answered request', () => {
      const answered = state({ status: 'answered', mentorId: mentorA });
      expect(planMentoringTransition(answered, 'cancel', requester)).toEqual({
        ok: false,
        refusal: 'invalid_state',
      });
    });
  });

  describe('rate', () => {
    const answered = state({ status: 'answered', mentorId: mentorA });

    it('lets the requester rate an answered request once', () => {
      expect(planMentoringTransition(answered, 'rate', requester)).toEqual({
        ok: true,
        status: 'answered',
        mentorId: mentorA,
      });
      expect(planMentoringTransition({ ...answered, satisfaction: 4 }, 'rate', requester)).toEqual({
        ok: false,
        refusal: 'already_rated',
      });
    });

    it('refuses rating before the answer', () => {
      expect(planMentoringTransition(state(), 'rate', requester)).toEqual({
        ok: false,
        refusal: 'invalid_state',
      });
    });

    it('the mentor cannot rate their own answer', () => {
      expect(planMentoringTransition(answered, 'rate', mentorA)).toEqual({
        ok: false,
        refusal: 'not_requester',
      });
    });
  });
});

describe('isOpenStatus', () => {
  it('treats pending and claimed as open', () => {
    expect(isOpenStatus('pending')).toBe(true);
    expect(isOpenStatus('claimed')).toBe(true);
    expect(isOpenStatus('answered')).toBe(false);
    expect(isOpenStatus('cancelled')).toBe(false);
  });
});
