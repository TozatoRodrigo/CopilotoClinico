import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_VERIFY_ATTACH_MODEL,
  MAX_VERIFIED_ACTIONS,
  readVerifyAttachModel,
  VERIFY_ATTACH_EFFORT,
} from './source-verification.settings';

function config(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('readVerifyAttachModel', () => {
  it('defaults to claude-sonnet-5-5', () => {
    expect(DEFAULT_VERIFY_ATTACH_MODEL).toBe('claude-sonnet-5-5');
    expect(readVerifyAttachModel(config({}))).toBe('claude-sonnet-5-5');
  });

  it('reads AI_VERIFY_ATTACH_MODEL, trimmed', () => {
    expect(readVerifyAttachModel(config({ AI_VERIFY_ATTACH_MODEL: ' claude-haiku-5-5 ' }))).toBe(
      'claude-haiku-5-5',
    );
  });

  it('uses the default when the variable is blank', () => {
    expect(readVerifyAttachModel(config({ AI_VERIFY_ATTACH_MODEL: '  ' }))).toBe(
      DEFAULT_VERIFY_ATTACH_MODEL,
    );
  });
});

describe('limites fixos da verificação', () => {
  it('links with low effort and verifies at most 8 actions', () => {
    expect(VERIFY_ATTACH_EFFORT).toBe('low');
    expect(MAX_VERIFIED_ACTIONS).toBe(8);
  });
});
