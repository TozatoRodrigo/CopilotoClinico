import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  AcceptBetaTermsRequest,
  BetaProfile,
  BetaWaitlistRequest,
  CreateBetaInvitesRequest,
} from '../../../shared/contracts/beta';
import {
  acceptTermsSchema,
  betaProfileSchema,
  createInvitesSchema,
  waitlistRequestSchema,
} from './beta.schemas';

describe('schemas do beta (CC-702)', () => {
  it('accept exactly the contract types the web sends', () => {
    expectTypeOf<z.infer<typeof betaProfileSchema>>().toEqualTypeOf<BetaProfile>();
    expectTypeOf<z.infer<typeof waitlistRequestSchema>>().toEqualTypeOf<BetaWaitlistRequest>();
    expectTypeOf<z.infer<typeof acceptTermsSchema>>().toEqualTypeOf<AcceptBetaTermsRequest>();
    expectTypeOf<z.infer<typeof createInvitesSchema>>().toEqualTypeOf<CreateBetaInvitesRequest>();
  });

  it('requires explicit consent to be contacted before joining the waitlist', () => {
    expect(waitlistRequestSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
    expect(
      waitlistRequestSchema.safeParse({ email: 'a@b.com', contactConsent: false }).success,
    ).toBe(false);
    expect(
      waitlistRequestSchema.parse({ email: ' Dra.Ana@Example.com ', contactConsent: true }),
    ).toEqual({ email: 'dra.ana@example.com', contactConsent: true });
  });

  it('accepts a partial profile on the waitlist and refuses values off the list', () => {
    expect(
      waitlistRequestSchema.safeParse({
        email: 'a@b.com',
        contactConsent: true,
        profile: { uf: 'MG' },
      }).success,
    ).toBe(true);
    expect(
      waitlistRequestSchema.safeParse({
        email: 'a@b.com',
        contactConsent: true,
        profile: { facilityType: 'hospital_de_campanha' },
      }).success,
    ).toBe(false);
  });

  it('requires the whole profile in the onboarding', () => {
    expect(betaProfileSchema.safeParse({ training: 'em_residencia', uf: 'MG' }).success).toBe(
      false,
    );
  });

  it('bounds invite batches', () => {
    const base = { batchLabel: 'rede Ripardo', quantity: 10, maxUses: 1, validDays: 30 };
    expect(createInvitesSchema.safeParse(base).success).toBe(true);
    expect(createInvitesSchema.safeParse({ ...base, quantity: 51 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ ...base, maxUses: 0 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ ...base, validDays: 181 }).success).toBe(false);
    expect(createInvitesSchema.safeParse({ ...base, batchLabel: '   ' }).success).toBe(false);
  });
});
