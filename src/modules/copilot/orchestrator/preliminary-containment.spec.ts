import { describe, it, expect } from 'vitest';
import { preliminaryReasonFor, type ContainmentContext } from './preliminary-containment';
import type { CitationOrigin } from '../../../shared/contracts/clinical';

const NO_RISK: ContainmentContext = {
  ambiguousSubtypeChunkIds: new Set(),
  unreviewedSourcesPreliminary: true,
  hasClarifyingQuestions: false,
};

type Category = Parameters<typeof preliminaryReasonFor>[0]['category'];

function recommendation(
  origin: CitationOrigin,
  preliminary = false,
  category: Category = 'therapeutic',
) {
  return { citationChunkId: 'chunk-1', preliminary, origin, category };
}

describe('preliminaryReasonFor', () => {
  describe('fonte não revisada por médico (ADR-012)', () => {
    it.each(['official_unreviewed', 'curated_unsigned'] as const)(
      'marks a %s citation as preliminary even when the model said definitive',
      (origin) => {
        expect(preliminaryReasonFor(recommendation(origin), NO_RISK)).toBe('unreviewed_source');
      },
    );

    it.each(['public', 'institutional'] as const)(
      'keeps a signed %s citation definitive',
      (origin) => {
        expect(preliminaryReasonFor(recommendation(origin), NO_RISK)).toBeNull();
      },
    );

    it('keeps the physician attachment on its historical label (the validator already forces preliminary)', () => {
      expect(preliminaryReasonFor(recommendation('physician_attachment', true), NO_RISK)).toBe(
        'pending_questions',
      );
    });

    it('restores ADR-010 behaviour when the kill-switch is off', () => {
      const context = { ...NO_RISK, unreviewedSourcesPreliminary: false };

      expect(preliminaryReasonFor(recommendation('official_unreviewed'), context)).toBeNull();
      expect(preliminaryReasonFor(recommendation('curated_unsigned', true), context)).toBe(
        'pending_questions',
      );
    });
  });

  describe('ordem dos motivos', () => {
    it('puts subtype ambiguity first, even over pending questions and unreviewed sources', () => {
      const context: ContainmentContext = {
        ambiguousSubtypeChunkIds: new Set(['chunk-1']),
        unreviewedSourcesPreliminary: true,
        hasClarifyingQuestions: true,
      };

      expect(preliminaryReasonFor(recommendation('curated_unsigned', true), context)).toBe(
        'subtype_ambiguity',
      );
    });

    it('prefers pending questions over unreviewed source: answering is what the physician can do now', () => {
      const context = { ...NO_RISK, hasClarifyingQuestions: true };

      expect(preliminaryReasonFor(recommendation('official_unreviewed', true), context)).toBe(
        'pending_questions',
      );
    });

    it('labels an unreviewed source when the model marked preliminary without questions', () => {
      expect(preliminaryReasonFor(recommendation('curated_unsigned', true), NO_RISK)).toBe(
        'unreviewed_source',
      );
    });

    it('never labels stabilization as subtype-dependent: it is safe in any subtype', () => {
      const context = { ...NO_RISK, ambiguousSubtypeChunkIds: new Set(['chunk-1']) };

      expect(
        preliminaryReasonFor(recommendation('public', false, 'stabilization'), context),
      ).toBeNull();
      expect(preliminaryReasonFor(recommendation('public', false, 'therapeutic'), context)).toBe(
        'subtype_ambiguity',
      );
    });

    it('keeps the provenance label on stabilization citing an unreviewed source', () => {
      const context = { ...NO_RISK, ambiguousSubtypeChunkIds: new Set(['chunk-1']) };

      expect(
        preliminaryReasonFor(
          recommendation('official_unreviewed', false, 'stabilization'),
          context,
        ),
      ).toBe('unreviewed_source');
    });

    it('never turns a model-declared preliminary into definitive', () => {
      expect(preliminaryReasonFor(recommendation('public', true), NO_RISK)).toBe(
        'pending_questions',
      );
    });
  });
});
