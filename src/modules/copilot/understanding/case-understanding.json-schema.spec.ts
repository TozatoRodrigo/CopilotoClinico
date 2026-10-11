import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { CaseUnderstanding } from '../../../shared/contracts/clinical';
import {
  collectObjects,
  jsonShape,
  UNSUPPORTED_KEYWORDS,
  zodShape,
} from '../../../../tests/helpers/json-schema-parity';
import { CASE_UNDERSTANDING_JSON_SCHEMA } from './case-understanding.json-schema';
import { CaseUnderstandingSchema, validateUnderstanding } from './case-understanding.schema';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

describe('CASE_UNDERSTANDING_JSON_SCHEMA', () => {
  it('mirrors the zod schema field names, types, enums and nullability', () => {
    expect(jsonShape(CASE_UNDERSTANDING_JSON_SCHEMA.schema)).toEqual(
      zodShape(CaseUnderstandingSchema),
    );
  });

  it('closes every object and lists every property as required (OpenAI strict mode)', () => {
    const objects = collectObjects(CASE_UNDERSTANDING_JSON_SCHEMA.schema);

    expect(objects.length).toBeGreaterThan(1);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties));
    }
  });

  it('uses only keywords supported by both providers', () => {
    const serialized = JSON.stringify(CASE_UNDERSTANDING_JSON_SCHEMA.schema);

    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });

  it('parses into exactly the shared contract type', () => {
    expectTypeOf<z.infer<typeof CaseUnderstandingSchema>>().toEqualTypeOf<CaseUnderstanding>();
  });
});

describe('validateUnderstanding', () => {
  const valid = understandingFixture();

  it('accepts a complete understanding', () => {
    expect(validateUnderstanding(JSON.stringify(valid))).toEqual({
      valid: true,
      understanding: valid,
    });
  });

  it('accepts JSON wrapped in a code block', () => {
    const result = validateUnderstanding(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);

    expect(result.valid).toBe(true);
  });

  it('rejects text that is not JSON', () => {
    expect(validateUnderstanding('não é JSON')).toEqual({
      valid: false,
      errors: ['Output is not valid JSON'],
    });
  });

  describe('limites', () => {
    it.each([
      ['cannotMiss', 6, 'cannotMiss must contain at most 5 items'],
      ['likely', 4, 'likely must contain at most 3 items'],
      ['missingDiscriminators', 5, 'missingDiscriminators must contain at most 4 items'],
      ['searchQueries', 5, 'searchQueries must contain at most 4 items'],
    ] as const)('rejects %s with %i items', (field, count, message) => {
      const first = valid[field][0];
      const result = validateUnderstanding(
        JSON.stringify({ ...valid, [field]: Array.from({ length: count }, () => first) }),
      );

      expect(result).toEqual({ valid: false, errors: [`${field}: ${message}`] });
    });

    it('requires at least one search query', () => {
      const result = validateUnderstanding(JSON.stringify({ ...valid, searchQueries: [] }));

      expect(result).toEqual({
        valid: false,
        errors: ['searchQueries: searchQueries must contain at least 1 query'],
      });
    });
  });

  describe('regras', () => {
    it('requires syndromeNote when the syndrome is "outro"', () => {
      const result = validateUnderstanding(
        JSON.stringify({ ...valid, syndrome: 'outro', syndromeNote: null }),
      );

      expect(result).toEqual({
        valid: false,
        errors: [
          'syndromeNote: syndromeNote is required when syndrome is "outro": describe the syndrome',
        ],
      });
    });

    it('accepts "outro" with a description', () => {
      const result = validateUnderstanding(
        JSON.stringify({ ...valid, syndrome: 'outro', syndromeNote: 'Epistaxe volumosa' }),
      );

      expect(result.valid).toBe(true);
    });

    it('rejects a syndrome outside the closed list', () => {
      const result = validateUnderstanding(JSON.stringify({ ...valid, syndrome: 'avc' }));

      expect(result.valid).toBe(false);
    });

    it('requires the findings that support instability', () => {
      const result = validateUnderstanding(
        JSON.stringify({ ...valid, instability: { present: true, findings: [] } }),
      );

      expect(result).toEqual({
        valid: false,
        errors: [
          'instability.findings: instability.findings must list the findings when instability.present is true',
        ],
      });
    });

    it('rejects probability language in a hypothesis', () => {
      const result = validateUnderstanding(
        JSON.stringify({
          ...valid,
          likely: [{ hypothesis: 'AVC isquêmico', why: 'Alta probabilidade pelo quadro' }],
        }),
      );

      expect(result).toEqual({
        valid: false,
        errors: ['likely.0.why: never use probability language; state the clinical reason instead'],
      });
    });

    it('accepts a percentage that is a measurement', () => {
      const result = validateUnderstanding(
        JSON.stringify({
          ...valid,
          cannotMiss: [
            {
              hypothesis: 'Tromboembolismo pulmonar',
              whyPlausible: 'Dispneia súbita com SpO2 88% em ar ambiente',
              confirmOrRuleOut: 'Angio-TC de tórax',
            },
          ],
        }),
      );

      expect(result.valid).toBe(true);
    });
  });
});
