import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { MentoringService } from './mentoring.service';
import { MENTORING_TERMS } from './mentoring-terms';
import type { MentoringNotifier } from './mentoring.notifier';

const requesterId = '11111111-1111-4111-8111-111111111111';
const mentorId = '22222222-2222-4222-8222-222222222222';
const otherMentorId = '33333333-3333-4333-8333-333333333333';
const encounterId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const institutionId = '66666666-6666-4666-8666-666666666666';

const CPF = '529.982.247-25';
const PATIENT_REF = 'PRONT-88231';

const encounter = {
  id: encounterId,
  status: 'in_review',
  vertical: 'general',
  context: { hasCT: false, isSus: true, hasLab: true, hasICU: false },
  patientRef: PATIENT_REF,
  institutionId: null as string | null,
};

const analysis = {
  id: 'int-1',
  inputRedacted: `Paciente ${PATIENT_REF}, CPF ${CPF}, dor torácica há 2 h.`,
  rawOutput: {
    differentials: [{ hypothesis: 'Síndrome coronariana aguda', cannotMiss: true }],
    redFlags: [{ finding: 'Dor em aperto', severity: 'critical' }],
    recommendations: [{ action: 'ECG em 10 minutos', preliminary: false }],
    clarifyingQuestions: [],
    uncertainty: false,
  },
  createdAt: new Date('2026-10-14T10:00:00.000Z'),
};

function requesterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    encounterId,
    status: 'pending',
    question: null,
    termsVersion: MENTORING_TERMS.version,
    createdAt: new Date('2026-10-14T10:05:00.000Z'),
    claimedAt: null,
    answer: null,
    answeredAt: null,
    answerSeenAt: null,
    cancelledAt: null,
    satisfaction: null,
    mentor: null,
    ...overrides,
  };
}

function transitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    encounterId,
    status: 'pending',
    requesterId,
    mentorId: null,
    satisfaction: null,
    createdAt: new Date('2026-10-14T10:05:00.000Z'),
    encounter: { patientRef: PATIENT_REF },
    ...overrides,
  };
}

function mentorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    status: 'pending',
    createdAt: new Date('2026-10-14T10:05:00.000Z'),
    claimedAt: null,
    answeredAt: null,
    mentorId: null,
    question: null,
    caseSnapshot: { vertical: 'general', plan: { mainHypothesis: 'SCA' } },
    answer: null,
    satisfaction: null,
    mentor: null,
    ...overrides,
  };
}

describe('MentoringService', () => {
  let service: MentoringService;
  let prisma: {
    encounter: { findFirst: ReturnType<typeof vi.fn> };
    aiInteraction: { findMany: ReturnType<typeof vi.fn> };
    mentoringRequest: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    physician: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    physicianInstitution: { findMany: ReturnType<typeof vi.fn> };
  };
  let audit: { log: ReturnType<typeof vi.fn> };
  let notifier: {
    notifyNewRequest: ReturnType<typeof vi.fn>;
    notifyAnswer: ReturnType<typeof vi.fn>;
  };
  let flags: Record<string, string>;

  beforeEach(() => {
    prisma = {
      encounter: { findFirst: vi.fn().mockResolvedValue(encounter) },
      aiInteraction: { findMany: vi.fn().mockResolvedValue([analysis]) },
      mentoringRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(requesterRow()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      physician: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: mentorId, email: 'mentor@equipe.com', name: 'Dr. Ripardo' }]),
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: requesterId, email: 'r@x.com', name: 'Dra. R' }),
      },
      physicianInstitution: { findMany: vi.fn().mockResolvedValue([]) },
    };
    audit = { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
    notifier = {
      notifyNewRequest: vi.fn().mockResolvedValue(undefined),
      notifyAnswer: vi.fn().mockResolvedValue(undefined),
    };
    flags = { COPILOT_MENTORING: 'on' };
    service = new MentoringService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { get: (key: string) => flags[key] } as unknown as ConfigService,
      notifier as unknown as MentoringNotifier,
    );
  });

  const validInput = {
    termsVersion: MENTORING_TERMS.version,
    acknowledgedNotUrgent: true as const,
    question: `Vale anticoagular? Contato do filho (11) 98765-4321, paciente ${PATIENT_REF}.`,
  };

  describe('getConfig', () => {
    it('only says "disabled" when the flag is off — no terms, no mentor role', async () => {
      flags.COPILOT_MENTORING = 'off';
      await expect(service.getConfig(requesterId)).resolves.toEqual({ enabled: false });
      expect(prisma.physician.findUnique).not.toHaveBeenCalled();
    });

    it('returns the current terms and the mentor flag when on', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isMentor: true });
      await expect(service.getConfig(mentorId)).resolves.toEqual({
        enabled: true,
        isMentor: true,
        terms: MENTORING_TERMS,
      });
    });
  });

  describe('create', () => {
    it('stores the masked case, the AI plan and the accepted terms version', async () => {
      await service.create(requesterId, encounterId, validInput);

      const { data } = prisma.mentoringRequest.create.mock.calls[0]![0];
      expect(data).toMatchObject({
        encounterId,
        requesterId,
        institutionId: null,
        interactionId: 'int-1',
        termsVersion: MENTORING_TERMS.version,
        termsAcceptedAt: expect.any(Date),
        question:
          'Vale anticoagular? Contato do filho [REDACTED_PHONE], paciente [PATIENT_REF_REDACTED].',
      });
      expect(data.caseSnapshot.plan.recommendations).toEqual([
        { action: 'ECG em 10 minutos', preliminary: false },
      ]);
      const sent = JSON.stringify(data);
      expect(sent).not.toContain(CPF);
      expect(sent).not.toContain(PATIENT_REF);
      expect(sent).not.toContain('98765-4321');
    });

    it('records the request in the audit trail with hashes, never the text', async () => {
      await service.create(requesterId, encounterId, validInput);

      expect(audit.log).toHaveBeenCalledWith({
        actorId: requesterId,
        action: 'MENTORING_REQUESTED',
        entity: 'MentoringRequest',
        entityId: requestId,
        payload: {
          encounterId,
          interactionId: 'int-1',
          institutionId: null,
          to: 'pending',
          termsVersion: MENTORING_TERMS.version,
          termsProvisional: true,
          snapshotSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          questionSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('anticoagular');
    });

    it('notifies the eligible mentors with a link only — no clinical text', async () => {
      await service.create(requesterId, encounterId, validInput);

      expect(prisma.physician.findMany).toHaveBeenCalledWith({
        where: { isMentor: true, id: { not: requesterId } },
        select: { id: true, email: true, name: true },
      });
      expect(notifier.notifyNewRequest).toHaveBeenCalledWith({
        requestId,
        recipients: [{ physicianId: mentorId, email: 'mentor@equipe.com', name: 'Dr. Ripardo' }],
        path: `/mentoria/${requestId}`,
      });
      const notice = JSON.stringify(notifier.notifyNewRequest.mock.calls);
      expect(notice).not.toContain('torácica');
      expect(notice).not.toContain('anticoagular');
    });

    it('only notifies mentors of the case institution (ADR-009)', async () => {
      prisma.encounter.findFirst.mockResolvedValue({ ...encounter, institutionId });

      await service.create(requesterId, encounterId, validInput);

      expect(prisma.physician.findMany).toHaveBeenCalledWith({
        where: {
          isMentor: true,
          id: { not: requesterId },
          institutions: { some: { institutionId } },
        },
        select: { id: true, email: true, name: true },
      });
      expect(prisma.mentoringRequest.create.mock.calls[0]![0].data.institutionId).toBe(
        institutionId,
      );
    });

    it('keeps the request when no mentor is eligible, and skips the notice', async () => {
      prisma.physician.findMany.mockResolvedValue([]);
      await expect(service.create(requesterId, encounterId, validInput)).resolves.toMatchObject({
        id: requestId,
        status: 'pending',
      });
      expect(notifier.notifyNewRequest).not.toHaveBeenCalled();
    });

    it('a failing notifier never undoes the request', async () => {
      notifier.notifyNewRequest.mockRejectedValue(new Error('smtp down'));
      await expect(service.create(requesterId, encounterId, validInput)).resolves.toMatchObject({
        id: requestId,
      });
    });

    it('refuses an outdated terms version before touching the case', async () => {
      await expect(
        service.create(requesterId, encounterId, { ...validInput, termsVersion: 'old' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.encounter.findFirst).not.toHaveBeenCalled();
    });

    it("returns 404 for another physician's case", async () => {
      prisma.encounter.findFirst.mockResolvedValue(null);
      await expect(service.create(otherMentorId, encounterId, validInput)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.encounter.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: encounterId, physicianId: otherMentorId } }),
      );
    });

    it('requires an AI plan (validation failures do not count)', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([
        { ...analysis, rawOutput: { raw: 'x', validationErrors: ['y'] } },
      ]);
      await expect(service.create(requesterId, encounterId, validInput)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.mentoringRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a second open request for the same case', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue({ id: 'open-1' });
      await expect(service.create(requesterId, encounterId, validInput)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('turns the partial unique index race into a 409', async () => {
      prisma.mentoringRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.create(requesterId, encounterId, validInput)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a cancelled case', async () => {
      prisma.encounter.findFirst.mockResolvedValue({ ...encounter, status: 'cancelled' });
      await expect(service.create(requesterId, encounterId, validInput)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('what the requester sees', () => {
    it('lists only their own requests on their own case', async () => {
      prisma.mentoringRequest.findMany.mockResolvedValue([
        requesterRow({
          status: 'answered',
          answer: 'Faria ECG seriado.',
          answeredAt: new Date('2026-10-14T12:05:00.000Z'),
          mentor: { name: 'Dr. Ripardo' },
        }),
      ]);

      const views = await service.listForEncounter(requesterId, encounterId);

      expect(prisma.mentoringRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { encounterId, requesterId } }),
      );
      expect(views).toEqual([
        {
          id: requestId,
          encounterId,
          status: 'answered',
          question: null,
          termsVersion: MENTORING_TERMS.version,
          createdAt: '2026-10-14T10:05:00.000Z',
          claimedAt: null,
          mentorName: 'Dr. Ripardo',
          answer: 'Faria ECG seriado.',
          answeredAt: '2026-10-14T12:05:00.000Z',
          answerSeenAt: null,
          cancelledAt: null,
          satisfaction: null,
        },
      ]);
    });

    it("never shows the answer on someone else's case (404)", async () => {
      prisma.encounter.findFirst.mockResolvedValue(null);
      await expect(service.listForEncounter(mentorId, encounterId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mentoringRequest.findMany).not.toHaveBeenCalled();
    });

    it('lists unread answers as in-app notifications, with the chief complaint as title', async () => {
      prisma.mentoringRequest.findMany.mockResolvedValue([
        {
          id: requestId,
          encounterId,
          answeredAt: new Date('2026-10-14T12:05:00.000Z'),
          mentor: { name: 'Dr. Ripardo' },
          encounter: { chiefComplaint: 'Dor torácica' },
        },
      ]);

      await expect(service.notifications(requesterId)).resolves.toEqual({
        unreadAnswers: [
          {
            requestId,
            encounterId,
            caseTitle: 'Dor torácica',
            mentorName: 'Dr. Ripardo',
            answeredAt: '2026-10-14T12:05:00.000Z',
          },
        ],
      });
      expect(prisma.mentoringRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requesterId, status: 'answered', answerSeenAt: null },
        }),
      );
    });

    it('marks the answer as seen only for the requester', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(requesterRow({ status: 'answered' }));
      await service.markAnswerSeen(requesterId, requestId);
      expect(prisma.mentoringRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, requesterId, status: 'answered', answerSeenAt: null },
        data: { answerSeenAt: expect.any(Date) },
      });
    });
  });

  describe('cancel and rate', () => {
    it('cancels an open request, scoped to the requester, and audits the transition', async () => {
      prisma.mentoringRequest.findFirst
        .mockResolvedValueOnce(transitionRow())
        .mockResolvedValueOnce(requesterRow({ status: 'cancelled' }));

      await expect(service.cancel(requesterId, requestId)).resolves.toMatchObject({
        status: 'cancelled',
      });

      expect(prisma.mentoringRequest.findFirst.mock.calls[0]![0].where).toEqual({
        AND: [{ requesterId }, { id: requestId }],
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: requesterId,
        action: 'MENTORING_CANCELLED',
        entity: 'MentoringRequest',
        entityId: requestId,
        payload: { encounterId, from: 'pending', to: 'cancelled' },
      });
    });

    it("cannot cancel someone else's request (404, not 403)", async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(null);
      await expect(service.cancel(mentorId, requestId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mentoringRequest.updateMany).not.toHaveBeenCalled();
    });

    it('rates an answered request once, with the score in the audit trail', async () => {
      prisma.mentoringRequest.findFirst
        .mockResolvedValueOnce(transitionRow({ status: 'answered', mentorId }))
        .mockResolvedValueOnce(requesterRow({ status: 'answered', satisfaction: 5 }));

      await service.rate(requesterId, requestId, { satisfaction: 5 });

      expect(prisma.mentoringRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, status: 'answered', mentorId, satisfaction: null },
        data: {
          status: 'answered',
          mentorId,
          satisfaction: 5,
          ratedAt: expect.any(Date),
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MENTORING_RATED',
          payload: { encounterId, from: 'answered', to: 'answered', satisfaction: 5 },
        }),
      );
    });

    it('refuses rating a request that has not been answered', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(transitionRow());
      await expect(
        service.rate(requesterId, requestId, { satisfaction: 4 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('mentor side', () => {
    it('scopes the mentor to requests without institution or of their institutions, never their own', async () => {
      prisma.physicianInstitution.findMany.mockResolvedValue([{ institutionId }]);
      prisma.mentoringRequest.findMany.mockResolvedValue([mentorRow()]);
      prisma.mentoringRequest.count.mockResolvedValue(1);

      const queue = await service.queue(mentorId, { scope: 'open' });

      const scope = {
        requesterId: { not: mentorId },
        OR: [{ institutionId: null }, { institutionId: { in: [institutionId] } }],
      };
      expect(prisma.mentoringRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [scope, { status: { in: ['pending', 'claimed'] } }] },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(queue).toEqual({
        items: [
          {
            id: requestId,
            status: 'pending',
            createdAt: '2026-10-14T10:05:00.000Z',
            claimedAt: null,
            answeredAt: null,
            assignedToMe: false,
            mentorName: null,
            vertical: 'general',
            mainHypothesis: 'SCA',
            question: null,
          },
        ],
        pendingCount: 1,
      });
    });

    it('hides a request from another institution (404)', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(null);
      await expect(service.detailForMentor(mentorId, requestId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers: masks the text, records the mentor terms and notifies the requester in the app path', async () => {
      prisma.mentoringRequest.findFirst
        .mockResolvedValueOnce(transitionRow())
        .mockResolvedValueOnce(mentorRow({ status: 'answered', mentorId }));

      await service.answer(mentorId, requestId, {
        answer: `Pediria troponina seriada. Ligue ${'(11) 98765-4321'} se piorar.`,
        termsVersion: MENTORING_TERMS.version,
      });

      expect(prisma.mentoringRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, status: 'pending', mentorId: null, satisfaction: null },
        data: {
          status: 'answered',
          mentorId,
          answer: 'Pediria troponina seriada. Ligue [REDACTED_PHONE] se piorar.',
          answeredAt: expect.any(Date),
          claimedAt: expect.any(Date),
          mentorTermsVersion: MENTORING_TERMS.version,
          mentorTermsAcceptedAt: expect.any(Date),
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: mentorId,
          action: 'MENTORING_ANSWERED',
          payload: expect.objectContaining({
            from: 'pending',
            to: 'answered',
            mentorTermsVersion: MENTORING_TERMS.version,
            answerSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            responseMinutes: expect.any(Number),
          }),
        }),
      );
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('troponina');
      expect(notifier.notifyAnswer).toHaveBeenCalledWith({
        requestId,
        encounterId,
        recipient: { physicianId: requesterId, email: 'r@x.com', name: 'Dra. R' },
        path: `/encounters/${encounterId}`,
      });
    });

    it('refuses an answer to a request another mentor claimed', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(
        transitionRow({ status: 'claimed', mentorId: otherMentorId }),
      );
      await expect(
        service.answer(mentorId, requestId, {
          answer: 'x',
          termsVersion: MENTORING_TERMS.version,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.mentoringRequest.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an answer to their own request even if it slipped through the scope', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(transitionRow({ requesterId: mentorId }));
      await expect(
        service.answer(mentorId, requestId, { answer: 'x', termsVersion: MENTORING_TERMS.version }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an answer without the current mentor terms', async () => {
      await expect(
        service.answer(mentorId, requestId, { answer: 'x', termsVersion: 'old' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.mentoringRequest.findFirst).not.toHaveBeenCalled();
    });

    it('loses the race cleanly: the conditional update hits nothing → 409', async () => {
      prisma.mentoringRequest.findFirst.mockResolvedValue(transitionRow());
      prisma.mentoringRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.claim(mentorId, requestId)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('claims and releases with an audit entry per transition', async () => {
      prisma.mentoringRequest.findFirst
        .mockResolvedValueOnce(transitionRow())
        .mockResolvedValueOnce(mentorRow({ status: 'claimed', mentorId }))
        .mockResolvedValueOnce(transitionRow({ status: 'claimed', mentorId }))
        .mockResolvedValueOnce(mentorRow());

      await expect(service.claim(mentorId, requestId)).resolves.toMatchObject({
        status: 'claimed',
        assignedToMe: true,
      });
      await service.release(mentorId, requestId);

      expect(audit.log.mock.calls.map(([entry]) => entry.action)).toEqual([
        'MENTORING_CLAIMED',
        'MENTORING_RELEASED',
      ]);
      expect(prisma.mentoringRequest.updateMany.mock.calls[1]![0].data).toEqual({
        status: 'pending',
        mentorId: null,
        claimedAt: null,
      });
    });
  });
});
