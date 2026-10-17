import { describe, it, expect } from 'vitest';
import {
  encounterContextSchema,
  encounterContextUpdateSchema,
  encounterSiteSchema,
  readStoredEncounterContext,
} from './encounter-context.schema';
import { practiceSiteInputSchema } from '../../practice-sites/schemas/practice-site.schemas';
import { createEncounterSchema } from './encounter.schemas';
import { analyzeSchema } from '../../copilot/schemas/copilot.schemas';

const siteId = '22222222-2222-4222-8222-222222222222';

const site = {
  siteId,
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  specialists: ['pediatria'],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 60,
};

const resources = { hasCT: false, isSus: true, hasLab: true, hasICU: false };

describe('encounterSiteSchema (CC-602)', () => {
  it('accepts the site snapshot that goes into the case', () => {
    expect(encounterSiteSchema.parse(site)).toEqual(site);
  });

  it('accepts a site whose profile was deleted (siteId null) and an unknown reference', () => {
    const parsed = encounterSiteSchema.safeParse({
      ...site,
      siteId: null,
      referenceTravelMinutes: null,
      referenceDistanceKm: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('is strict: an extra field could carry free text to the prompt', () => {
    expect(encounterSiteSchema.safeParse({ ...site, notes: 'paciente João' }).success).toBe(false);
  });

  it.each([
    ['facility type outside the list', { facilityType: 'upa_porte_4' }],
    ['unknown specialist', { specialists: ['astrologia'] }],
    ['travel time of zero minutes', { referenceTravelMinutes: 0 }],
    ['travel time beyond 24 h', { referenceTravelMinutes: 1441 }],
    ['fractional distance', { referenceDistanceKm: 12.5 }],
    ['negative distance', { referenceDistanceKm: -1 }],
    ['empty name', { name: ' ' }],
  ])('rejects %s', (_label, override) => {
    expect(encounterSiteSchema.safeParse({ ...site, ...override }).success).toBe(false);
  });

  it('dedupes specialists marked twice', () => {
    expect(
      encounterSiteSchema.parse({ ...site, specialists: ['pediatria', 'pediatria'] }).specialists,
    ).toEqual(['pediatria']);
  });
});

describe('encounterContextSchema', () => {
  it('keeps the four resources defaulting to false, as before', () => {
    expect(encounterContextSchema.parse({})).toEqual({
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
    });
  });

  it('carries the site when the physician chose one', () => {
    expect(encounterContextSchema.parse({ ...resources, site })).toEqual({ ...resources, site });
  });

  it('is the context of POST /encounters and POST /copilot/analyze', () => {
    const encounter = createEncounterSchema.parse({ context: { ...resources, site } });
    const analysis = analyzeSchema.parse({
      caseText: 'Homem, 70 anos, hemiparesia súbita.',
      context: { ...resources, site },
    });
    expect(encounter.context.site).toEqual(site);
    expect(analysis.context.site).toEqual(site);
  });

  it('keeps the four resources required in PATCH /encounters/:id', () => {
    expect(encounterContextUpdateSchema.safeParse({ hasCT: true }).success).toBe(false);
    expect(encounterContextUpdateSchema.safeParse({ ...resources, site }).success).toBe(true);
  });
});

describe('readStoredEncounterContext', () => {
  it('reads the stored JSON with its site', () => {
    expect(readStoredEncounterContext({ ...resources, site })).toEqual({ ...resources, site });
  });

  it('treats anything but true as an unmarked resource', () => {
    expect(readStoredEncounterContext({ hasCT: 'true', hasLab: 1, hasICU: true })).toEqual({
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: true,
    });
  });

  it('drops a malformed site instead of failing the analysis', () => {
    const context = readStoredEncounterContext({ ...resources, site: { name: 'UPA' } });
    expect(context).toEqual(resources);
    expect('site' in context).toBe(false);
  });

  it.each([null, 'texto', ['hasCT'], 42])('returns an empty context for %j', (value) => {
    expect(readStoredEncounterContext(value)).toEqual({
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
    });
  });
});

describe('practiceSiteInputSchema', () => {
  const input = {
    name: 'UPA Centro',
    facilityType: 'upa_porte_2',
    hasCT: false,
    hasLab: true,
    hasICU: false,
    isSus: true,
    specialists: ['ortopedia'],
    referenceTravelMinutes: null,
    referenceDistanceKm: null,
    isDefault: true,
  };

  it('accepts the full site the settings form sends', () => {
    expect(practiceSiteInputSchema.parse(input)).toEqual(input);
  });

  it('trims the name', () => {
    expect(practiceSiteInputSchema.parse({ ...input, name: '  UPA Norte ' }).name).toBe(
      'UPA Norte',
    );
  });

  it('requires every field: the form always sends the whole site', () => {
    const { isDefault: _isDefault, ...withoutDefault } = input;
    expect(practiceSiteInputSchema.safeParse(withoutDefault).success).toBe(false);
  });

  it('rejects a name longer than 80 characters', () => {
    expect(practiceSiteInputSchema.safeParse({ ...input, name: 'U'.repeat(81) }).success).toBe(
      false,
    );
  });
});
