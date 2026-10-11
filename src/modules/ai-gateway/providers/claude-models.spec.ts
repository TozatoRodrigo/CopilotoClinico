import { describe, expect, it } from 'vitest';
import { claudeCapabilities } from './claude-models';

describe('claudeCapabilities', () => {
  it.each([
    // model, adaptiveThinking, structuredOutputs, refusalFallback, dynamicWebFiltering
    ['claude-opus-5-5', true, true, true, true],
    ['claude-sonnet-5-5', true, true, true, true],
    ['claude-opus-5', true, true, true, true],
    ['claude-fable-5-1', true, true, true, true],
    ['claude-haiku-5-5', true, true, false, false],
    ['claude-sonnet-5', true, true, false, true],
    ['claude-opus-4-8', true, true, false, true],
    ['claude-opus-4-7', true, false, false, true],
    ['claude-sonnet-4-6', true, false, false, true],
    ['claude-haiku-4-5-20251001', false, true, false, false],
    ['claude-opus-4-1-20250805', false, true, false, false],
    ['claude-sonnet-4-5', false, false, false, false],
    ['claude-sonnet-4-20250514', false, false, false, false],
    ['claude-3-5-sonnet-latest', false, false, false, false],
    ['gpt-4o', false, false, false, false],
  ] as const)(
    'maps %s to adaptiveThinking=%s structuredOutputs=%s refusalFallback=%s dynamicWebFiltering=%s',
    (model, adaptiveThinking, structuredOutputs, refusalFallback, dynamicWebFiltering) => {
      expect(claudeCapabilities(model)).toEqual({
        adaptiveThinking,
        structuredOutputs,
        refusalFallback,
        dynamicWebFiltering,
      });
    },
  );
});
