import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS,
  isAllowedHost,
  MAX_ALLOWED_DOMAINS,
  readResearchEffort,
  readResearchModel,
  readWebResearchAllowedDomains,
  readWebResearchMaxSearches,
} from './web-research.settings';

function configOf(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('web research settings', () => {
  it('defaults to Sonnet 5.5 at low effort and 5 searches', () => {
    const config = configOf({});

    expect(readResearchModel(config)).toBe('claude-sonnet-5-5');
    expect(readResearchEffort(config)).toBe('low');
    expect(readWebResearchMaxSearches(config)).toBe(5);
  });

  it('reads the configured model, effort and search cap', () => {
    const config = configOf({
      AI_RESEARCH_MODEL: ' claude-opus-5-5 ',
      AI_RESEARCH_EFFORT: 'medium',
      WEB_RESEARCH_MAX_SEARCHES: '8',
    });

    expect(readResearchModel(config)).toBe('claude-opus-5-5');
    expect(readResearchEffort(config)).toBe('medium');
    expect(readWebResearchMaxSearches(config)).toBe(8);
  });

  it.each(['0', '-2', '2.5', 'cinco', ''])(
    'falls back to 5 searches for WEB_RESEARCH_MAX_SEARCHES="%s"',
    (value) => {
      expect(readWebResearchMaxSearches(configOf({ WEB_RESEARCH_MAX_SEARCHES: value }))).toBe(5);
    },
  );

  it('caps the searches at 20', () => {
    expect(readWebResearchMaxSearches(configOf({ WEB_RESEARCH_MAX_SEARCHES: '500' }))).toBe(20);
  });

  describe('allowed domains', () => {
    it('defaults to the 32 trusted sources, all valid hostnames', () => {
      const { domains, rejected } = readWebResearchAllowedDomains(configOf({}));

      expect(domains).toEqual([...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS]);
      expect(domains).toHaveLength(32);
      expect(rejected).toEqual([]);
      const reparsed = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: domains.join(',') }),
      );
      expect(reparsed).toEqual({ domains, rejected: [] });
    });

    it('reads a comma list, trimmed and lowercased', () => {
      const { domains } = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: ' Gov.BR , who.int/ ,heart.org' }),
      );

      expect(domains).toEqual(['gov.br', 'who.int', 'heart.org']);
    });

    it.each([
      'https://gov.br',
      '*.gov.br',
      'gov.br:443',
      'gov.br/saude',
      '10.0.0.1',
      'localhost',
      'br',
      'gоv.br', // "о" cirílico: homógrafo
    ])('drops "%s", which the API rejects or which is not ASCII', (entry) => {
      const { domains, rejected } = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: `who.int,${entry}` }),
      );

      expect(domains).toEqual(['who.int']);
      expect(rejected).toHaveLength(1);
    });

    it('drops duplicates', () => {
      const { domains, rejected } = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: 'who.int,WHO.int' }),
      );

      expect(domains).toEqual(['who.int']);
      expect(rejected).toEqual(['who.int (repetido)']);
    });

    it(`keeps at most ${MAX_ALLOWED_DOMAINS} domains`, () => {
      const many = Array.from({ length: 70 }, (_, index) => `fonte${index}.org`);

      const { domains, rejected } = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: many.join(',') }),
      );

      expect(domains).toHaveLength(64);
      expect(rejected).toHaveLength(6);
    });

    it('never opens the research to the whole web: an all-invalid list falls back to the default', () => {
      const { domains, rejected } = readWebResearchAllowedDomains(
        configOf({ WEB_RESEARCH_ALLOWED_DOMAINS: 'https://, *' }),
      );

      expect(domains).toEqual([...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS]);
      expect(rejected.at(-1)).toContain('usando a padrão');
    });
  });

  describe('isAllowedHost', () => {
    it.each([
      ['gov.br', true],
      ['www.gov.br', true],
      ['bvsms.saude.gov.br', true],
      ['academic.oup.com', true],
      ['oup.com', false],
      ['notgov.br', false],
      ['gov.br.evil.com', false],
    ])('%s → %s', (host, allowed) => {
      expect(isAllowedHost(host, ['gov.br', 'academic.oup.com'])).toBe(allowed);
    });
  });
});
