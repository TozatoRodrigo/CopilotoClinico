import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_PROFILE, parseModelRef, readProviderProfiles } from './provider-profiles';

const GROQ = {
  AI_PROVIDER_PROFILES: 'groq',
  AI_PROVIDER_GROQ_KIND: 'openai',
  AI_PROVIDER_GROQ_API_KEY: 'groq-key',
  AI_PROVIDER_GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
};

function profiles(env: Record<string, string>) {
  return readProviderProfiles(new ConfigService(env));
}

describe('parseModelRef', () => {
  const names = new Set(['groq', 'together']);

  it('routes a known profile prefix to that profile, keeping slashes in the model id', () => {
    expect(parseModelRef('groq:openai/gpt-oss-120b', names)).toEqual({
      profile: 'groq',
      model: 'openai/gpt-oss-120b',
    });
  });

  it('accepts the profile prefix in any case', () => {
    expect(parseModelRef('GROQ:openai/gpt-oss-20b', names).profile).toBe('groq');
  });

  it('keeps a model id with ":" on the default provider when the prefix is not a profile', () => {
    expect(parseModelRef('llama3:8b', names)).toEqual({
      profile: DEFAULT_PROFILE,
      model: 'llama3:8b',
    });
  });

  it('sends a plain model id to the default provider', () => {
    expect(parseModelRef('claude-opus-5-5', names)).toEqual({
      profile: DEFAULT_PROFILE,
      model: 'claude-opus-5-5',
    });
  });
});

describe('readProviderProfiles', () => {
  it('returns no profile when AI_PROVIDER_PROFILES is unset or empty', () => {
    expect(profiles({})).toEqual([]);
    expect(profiles({ AI_PROVIDER_PROFILES: ' ' })).toEqual([]);
  });

  it('reads kind, key, base URL and host options of each profile', () => {
    expect(
      profiles({
        ...GROQ,
        AI_PROVIDER_GROQ_STRUCTURED_OUTPUT: 'json_schema',
        AI_PROVIDER_GROQ_MAX_TOKENS_PARAM: 'max_tokens',
        AI_PROVIDER_GROQ_EXTRA_BODY: '{"reasoning_format":"hidden"}',
      }),
    ).toEqual([
      {
        name: 'groq',
        kind: 'openai',
        apiKey: 'groq-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        structuredOutput: 'json_schema',
        maxTokensParam: 'max_tokens',
        extraBody: { reasoning_format: 'hidden' },
      },
    ]);
  });

  it('lists each profile once, whatever the spacing and case', () => {
    expect(profiles({ ...GROQ, AI_PROVIDER_PROFILES: ' Groq , groq' })).toHaveLength(1);
  });

  it('rejects a profile without kind or key', () => {
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_KIND: '' })).toThrow(
      /AI_PROVIDER_GROQ_KIND is required/,
    );
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_API_KEY: '' })).toThrow(
      /AI_PROVIDER_GROQ_API_KEY is required/,
    );
  });

  it('rejects an unknown kind or host option', () => {
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_KIND: 'gemini' })).toThrow(
      /AI_PROVIDER_GROQ_KIND="gemini" is invalid/,
    );
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_STRUCTURED_OUTPUT: 'strict' })).toThrow(
      /AI_PROVIDER_GROQ_STRUCTURED_OUTPUT="strict" is invalid/,
    );
  });

  it('rejects an extra body that is not a JSON object', () => {
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_EXTRA_BODY: '[1]' })).toThrow(
      /AI_PROVIDER_GROQ_EXTRA_BODY must be a JSON object/,
    );
    expect(() => profiles({ ...GROQ, AI_PROVIDER_GROQ_EXTRA_BODY: '{oops' })).toThrow(
      /AI_PROVIDER_GROQ_EXTRA_BODY must be a JSON object/,
    );
  });

  it('rejects the reserved name "default" and names that are not identifiers', () => {
    expect(() => profiles({ AI_PROVIDER_PROFILES: 'default' })).toThrow(/invalid profile name/);
    expect(() => profiles({ AI_PROVIDER_PROFILES: 'my-host' })).toThrow(/invalid profile name/);
  });
});
