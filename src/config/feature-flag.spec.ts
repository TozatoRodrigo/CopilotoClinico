import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag, readChoiceFlag } from './feature-flag';

function configWith(value: unknown): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

describe('readBooleanFlag', () => {
  it('returns the default when the variable is missing or empty', () => {
    expect(readBooleanFlag(configWith(undefined), 'FLAG', true)).toBe(true);
    expect(readBooleanFlag(configWith(''), 'FLAG', true)).toBe(true);
    expect(readBooleanFlag(configWith(undefined), 'FLAG', false)).toBe(false);
  });

  it('turns off only on an explicit false value', () => {
    for (const value of ['false', 'FALSE', ' 0 ', 'off', 'no', false]) {
      expect(readBooleanFlag(configWith(value), 'FLAG', true), String(value)).toBe(false);
    }
  });

  it('turns on with an explicit true value', () => {
    for (const value of ['true', '1', 'On', 'yes', true]) {
      expect(readBooleanFlag(configWith(value), 'FLAG', false), String(value)).toBe(true);
    }
  });

  it('keeps the default on a typo instead of silently flipping the flag', () => {
    expect(readBooleanFlag(configWith('fasle'), 'FLAG', true)).toBe(true);
    expect(readBooleanFlag(configWith('ture'), 'FLAG', false)).toBe(false);
  });
});

describe('readChoiceFlag', () => {
  const MODES = ['legacy', 'stages'] as const;

  it('returns the default when the variable is missing or empty', () => {
    expect(readChoiceFlag(configWith(undefined), 'MODE', MODES, 'legacy')).toBe('legacy');
    expect(readChoiceFlag(configWith(''), 'MODE', MODES, 'legacy')).toBe('legacy');
  });

  it('accepts a listed value regardless of case and surrounding spaces', () => {
    expect(readChoiceFlag(configWith('stages'), 'MODE', MODES, 'legacy')).toBe('stages');
    expect(readChoiceFlag(configWith(' Stages '), 'MODE', MODES, 'legacy')).toBe('stages');
  });

  it('keeps the default on a typo instead of switching paths', () => {
    expect(readChoiceFlag(configWith('stage'), 'MODE', MODES, 'legacy')).toBe('legacy');
  });
});
