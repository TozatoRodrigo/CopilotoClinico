import { describe, expect, it } from 'vitest';
import {
  caseContext,
  contextFromSite,
  defaultSite,
  describeSite,
  EMPTY_CONTEXT,
  emptySiteForm,
  NO_SITE,
  prefilledContext,
  selectedSiteValue,
  siteFormFrom,
  specialistsLabel,
  toPracticeSiteInput,
  withoutSite,
} from '@/lib/practice-sites';
import type { EncounterContext, PracticeSite } from '@/lib/types';

const upa: PracticeSite = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: [],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 70,
  isDefault: true,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

const hospital: PracticeSite = {
  ...upa,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Hospital Regional',
  facilityType: 'hospital_com_uti',
  hasCT: true,
  hasICU: true,
  specialists: ['neurologia'],
  isDefault: false,
};

describe('CC-602 — contexto do caso a partir do local de plantão', () => {
  it('prefills a new case with the default site', () => {
    expect(prefilledContext([hospital, upa])).toEqual({
      hasCT: false,
      isSus: true,
      hasLab: true,
      hasICU: false,
      site: {
        siteId: upa.id,
        name: 'UPA Centro',
        facilityType: 'upa_porte_1',
        specialists: [],
        referenceTravelMinutes: 90,
        referenceDistanceKm: 70,
      },
    });
  });

  it('falls back to the first site, then to nothing marked', () => {
    expect(defaultSite([hospital])).toBe(hospital);
    expect(prefilledContext([])).toEqual(EMPTY_CONTEXT);
    expect(prefilledContext(undefined)).toEqual(EMPTY_CONTEXT);
  });

  it('keeps the pilot case context over the default site', () => {
    const demo: EncounterContext = { hasCT: true, isSus: false, hasLab: true, hasICU: true };
    expect(prefilledContext([upa], demo)).toBe(demo);
    expect(caseContext({ ...EMPTY_CONTEXT, hasCT: false }, demo)).toBe(demo);
  });

  it('starts the case report from what the case was created with', () => {
    const stored = contextFromSite(upa);
    expect(caseContext(stored)).toBe(stored);
    expect(caseContext(null)).toEqual(EMPTY_CONTEXT);
  });

  it('copies the site into the case, so editing the profile later does not change it', () => {
    const profile: PracticeSite = { ...hospital, specialists: ['neurologia'] };
    const context = contextFromSite(profile);
    profile.specialists.push('cardiologia');
    expect(context.site?.specialists).toEqual(['neurologia']);
  });

  it('drops the site but keeps the resources when the physician chooses no site', () => {
    expect(withoutSite(contextFromSite(upa))).toEqual({
      hasCT: false,
      isSus: true,
      hasLab: true,
      hasICU: false,
    });
  });

  it('selects the site of the case, its snapshot, or no site', () => {
    expect(selectedSiteValue(contextFromSite(upa))).toBe(upa.id);
    const snapshot = contextFromSite(upa);
    expect(selectedSiteValue({ ...snapshot, site: { ...snapshot.site!, siteId: null } })).toBe(
      'deste-caso',
    );
    expect(selectedSiteValue(EMPTY_CONTEXT)).toBe(NO_SITE);
  });
});

describe('describeSite', () => {
  it('says what the facility lacks and how far the reference is', () => {
    expect(describeSite(upa, upa)).toBe('UPA 24h porte I · sem TC e UTI · referência a 90 min');
  });

  it('reflects the resources marked on the case, not the profile', () => {
    expect(describeSite(upa, { hasCT: true, hasLab: true, hasICU: false })).toBe(
      'UPA 24h porte I · sem UTI · referência a 90 min',
    );
  });

  it('covers a complete facility and a reference known only by distance', () => {
    expect(describeSite({ ...hospital, referenceTravelMinutes: null }, hospital)).toBe(
      'Hospital com UTI · com TC, laboratório e UTI · referência a 70 km',
    );
  });

  it('lists the specialists on call', () => {
    expect(specialistsLabel(['neurologia', 'pediatria'])).toBe('Neurologia, Pediatria');
    expect(specialistsLabel([])).toBe('Nenhum especialista além do plantonista');
  });
});

describe('toPracticeSiteInput', () => {
  it('turns the form into the API body, with numbers or null', () => {
    expect(toPracticeSiteInput({ ...siteFormFrom(upa), name: '  UPA Centro ' })).toEqual({
      ok: true,
      input: {
        name: 'UPA Centro',
        facilityType: 'upa_porte_1',
        hasCT: false,
        hasLab: true,
        hasICU: false,
        isSus: true,
        specialists: [],
        referenceTravelMinutes: 90,
        referenceDistanceKm: 70,
        isDefault: true,
      },
    });
    const blank = toPracticeSiteInput({ ...emptySiteForm(false), name: 'UPA Norte' });
    expect(blank.ok && blank.input.referenceTravelMinutes).toBeNull();
    expect(blank.ok && blank.input.isDefault).toBe(false);
  });

  it('makes the first site the default in the empty form', () => {
    expect(emptySiteForm(true).isDefault).toBe(true);
  });

  it.each([
    [{ name: 'U' }, /nome/i],
    [{ name: 'U'.repeat(81) }, /80/],
    [{ referenceTravelMinutes: '0' }, /minutos/],
    [{ referenceTravelMinutes: '1,5' }, /minutos/],
    [{ referenceTravelMinutes: '2000' }, /minutos/],
    [{ referenceDistanceKm: '-3' }, /km/],
  ])('rejects %j', (override, message) => {
    const result = toPracticeSiteInput({ ...siteFormFrom(upa), ...override });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});
