import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import {
  SealedValueError,
  isSealedText,
  loadFieldKeyring,
  openJson,
  openText,
  sealText,
} from '../../shared/crypto/field-cipher';
import {
  ClinicalTextQueryError,
  assertQueryWorksOnSealedFields,
  clinicalTextCipherFrom,
  openSealedField,
  sealWriteArgs,
} from './clinical-text.extension';

const KEY = 'c'.repeat(64);
const OTHER_KEY = 'd'.repeat(64);
const keyring = loadFieldKeyring((name) => (name === 'FIELD_ENCRYPTION_KEY' ? KEY : undefined));

function config(values: Record<string, string>): ConfigService {
  return { get: (name: string) => values[name] } as unknown as ConfigService;
}

const CASE = 'Dor torácica há 2h, PA 90/60';

describe('clinical-text extension — gravação', () => {
  it('seals text and Json fields of a create, leaving the rest untouched', () => {
    const args = {
      data: {
        encounterId: 'enc-1',
        inputRedacted: CASE,
        model: 'claude',
        params: { demoCase: 'iam' },
        rawOutput: { reasoning: CASE, confidence: 0.85 },
        latencyMs: 10,
      },
    };
    const sealed = sealWriteArgs('AiInteraction', 'create', args, keyring) as typeof args;
    const data = sealed.data as Record<string, unknown>;

    expect(isSealedText(data.inputRedacted)).toBe(true);
    expect(openText(keyring, data.inputRedacted as string)).toBe(CASE);
    expect(isSealedText(data.rawOutput)).toBe(true);
    expect(openJson(keyring, data.rawOutput)).toEqual({ reasoning: CASE, confidence: 0.85 });
    // Metadado filtrável fica em claro.
    expect(data.params).toEqual({ demoCase: 'iam' });
    expect(data.model).toBe('claude');
    // Não muta os argumentos de quem chamou.
    expect(args.data.inputRedacted).toBe(CASE);
  });

  it('seals `{ set }` updates of String fields and keeps null / Json null sentinels', () => {
    const sealed = sealWriteArgs(
      'CopilotFeedback',
      'update',
      { where: { id: 'f1' }, data: { triageNote: { set: 'nota' }, comment: null } },
      keyring,
    ) as { data: { triageNote: { set: string }; comment: null } };
    expect(openText(keyring, sealed.data.triageNote.set)).toBe('nota');
    expect(sealed.data.comment).toBeNull();

    const json = sealWriteArgs(
      'Document',
      'update',
      { where: { id: 'd1' }, data: { physicianEdits: Prisma.DbNull } },
      keyring,
    ) as { data: { physicianEdits: unknown } };
    expect(json.data.physicianEdits).toBe(Prisma.DbNull);
  });

  it('seals both branches of an upsert and every row of a createMany', () => {
    const upsert = sealWriteArgs(
      'RecommendationDecision',
      'upsert',
      { where: { id: 'x' }, create: { note: 'a' }, update: { note: 'b' } },
      keyring,
    ) as { create: { note: string }; update: { note: string } };
    expect(openText(keyring, upsert.create.note)).toBe('a');
    expect(openText(keyring, upsert.update.note)).toBe('b');

    const many = sealWriteArgs(
      'CopilotFeedback',
      'createMany',
      { data: [{ comment: 'um' }, { comment: 'dois' }], skipDuplicates: true },
      keyring,
    ) as { data: Array<{ comment: string }> };
    expect(many.data.map((row) => openText(keyring, row.comment))).toEqual(['um', 'dois']);
  });

  it('seals nested writes into sealed models', () => {
    const sealed = sealWriteArgs(
      'Encounter',
      'create',
      {
        data: {
          physicianId: 'p1',
          chiefComplaint: 'Dispneia',
          aiInteractions: {
            create: [{ inputRedacted: CASE, model: 'm', rawOutput: {}, latencyMs: 1 }],
          },
          documents: {
            upsert: {
              where: { id: 'd1' },
              create: { content: { s: 'S' } },
              update: { physicianEdits: { s: 'S2' } },
            },
          },
        },
      },
      keyring,
    ) as {
      data: {
        chiefComplaint: string;
        aiInteractions: { create: Array<{ inputRedacted: string; model: string }> };
        documents: { upsert: { create: { content: string }; update: { physicianEdits: string } } };
      };
    };
    expect(openText(keyring, sealed.data.chiefComplaint)).toBe('Dispneia');
    expect(openText(keyring, sealed.data.aiInteractions.create[0]!.inputRedacted)).toBe(CASE);
    expect(sealed.data.aiInteractions.create[0]!.model).toBe('m');
    expect(openJson(keyring, sealed.data.documents.upsert.create.content)).toEqual({ s: 'S' });
    expect(openJson(keyring, sealed.data.documents.upsert.update.physicianEdits)).toEqual({
      s: 'S2',
    });
  });

  it('keeps the validation-failure marker in clear so it stays filterable; seals model text', () => {
    const failure = sealWriteArgs(
      'AiInteraction',
      'create',
      { data: { uncertaintyReason: 'Output validation failed' } },
      keyring,
    ) as { data: { uncertaintyReason: string } };
    expect(failure.data.uncertaintyReason).toBe('Output validation failed');

    const analysis = sealWriteArgs(
      'AiInteraction',
      'create',
      { data: { uncertaintyReason: 'Diretriz não cobre gestante com 34 semanas' } },
      keyring,
    ) as { data: { uncertaintyReason: string } };
    expect(isSealedText(analysis.data.uncertaintyReason)).toBe(true);
  });

  it('does not seal twice a value that already opens with the keyring', () => {
    const already = sealText(keyring, CASE);
    const sealed = sealWriteArgs(
      'EncounterAttachment',
      'create',
      { data: { text: already } },
      keyring,
    ) as { data: { text: string } };
    expect(sealed.data.text).toBe(already);
  });

  it('seals a plaintext that merely starts with the prefix (it does not open)', () => {
    const tricky = 'enc:v1:isto é texto do médico';
    const sealed = sealWriteArgs(
      'EncounterAttachment',
      'create',
      { data: { text: tricky } },
      keyring,
    ) as { data: { text: string } };
    expect(sealed.data.text).not.toBe(tricky);
    expect(openText(keyring, sealed.data.text)).toBe(tricky);
  });

  it('leaves reads and models without clinical text alone', () => {
    const args = { where: { id: 'x' } };
    expect(sealWriteArgs('AiInteraction', 'findUnique', args, keyring)).toBe(args);
    const login = sealWriteArgs(
      'LoginSecurityState',
      'create',
      { data: { identifierHash: 'h' } },
      keyring,
    ) as { data: { identifierHash: string } };
    expect(login.data.identifierHash).toBe('h');
  });
});

describe('clinical-text extension — consultas sobre campo cifrado', () => {
  it('rejects filters by content of a sealed field, nested in AND/OR/NOT', () => {
    expect(() =>
      assertQueryWorksOnSealedFields('AiInteraction', {
        where: { uncertaintyReason: { not: 'Diretriz não cobre gestante' } },
      }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('AiInteraction', {
        where: { OR: [{ encounterId: 'e' }, { inputRedacted: { contains: 'dor' } }] },
      }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('CaseIntake', {
        where: { NOT: { answers: { equals: [] } } },
      }),
    ).toThrow(ClinicalTextQueryError);
  });

  it('rejects filters through relations (list and to-one)', () => {
    expect(() =>
      assertQueryWorksOnSealedFields('Encounter', {
        where: { aiInteractions: { some: { rawOutput: { path: ['x'], equals: 1 } } } },
      }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('CopilotFeedback', {
        where: { interaction: { inputRedacted: { startsWith: 'Dor' } } },
      }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('AiInteraction', {
        where: { encounter: { is: { chiefComplaint: 'Dispneia' } } },
      }),
    ).toThrow(ClinicalTextQueryError);
  });

  it('rejects ordering, distinct and groupBy by a sealed field', () => {
    expect(() =>
      assertQueryWorksOnSealedFields('Encounter', { orderBy: [{ chiefComplaint: 'asc' }] }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('CopilotFeedback', { distinct: ['comment'] }),
    ).toThrow(ClinicalTextQueryError);
    expect(() =>
      assertQueryWorksOnSealedFields('RecommendationDecision', { by: ['note'] }),
    ).toThrow(ClinicalTextQueryError);
  });

  it('allows null checks and every filter the services use today', () => {
    const allowed: Array<[string, unknown]> = [
      ['AiInteraction', { where: { inputRedacted: null } }],
      ['AiInteraction', { where: { uncertaintyReason: { not: null } } }],
      ['Document', { where: { physicianEdits: { equals: Prisma.DbNull } } }],
      ['Document', { where: { physicianId: 'p', confirmedBy: { not: null } } }],
      ['AiInteraction', { where: { params: { path: ['demoCase'], equals: 'iam' } } }],
      ['AiInteraction', { where: { id: 'i', encounter: { id: 'e', physicianId: 'p' } } }],
      [
        'Encounter',
        { where: { physicianId: 'p', patientRef: { contains: 'x', mode: 'insensitive' } } },
      ],
      ['CaseIntake', { where: { id: 'c', analysisInteractionId: null } }],
      // "Última análise" separa as falhas de validação pelo marcador em claro.
      [
        'AiInteraction',
        {
          where: {
            OR: [
              { uncertaintyReason: null },
              { uncertaintyReason: { not: 'Output validation failed' } },
            ],
          },
        },
      ],
      ['AiInteraction', { where: { uncertaintyReason: 'Output validation failed' } }],
      ['Encounter', { orderBy: { createdAt: 'desc' } }],
    ];
    for (const [model, args] of allowed) {
      expect(() => assertQueryWorksOnSealedFields(model, args), JSON.stringify(args)).not.toThrow();
    }
  });

  it('never puts the filtered value in the error message', () => {
    try {
      assertQueryWorksOnSealedFields('AiInteraction', {
        where: { inputRedacted: { contains: 'Maria da Silva' } },
      });
    } catch (err) {
      expect((err as Error).message).toContain('AiInteraction.inputRedacted');
      expect((err as Error).message).not.toContain('Maria');
    }
  });
});

describe('clinical-text extension — leitura', () => {
  const cipher = clinicalTextCipherFrom(config({ FIELD_ENCRYPTION_KEY: KEY }));
  const textColumn = { model: 'AiInteraction', field: 'inputRedacted', kind: 'text' } as const;
  const jsonColumn = { model: 'AiInteraction', field: 'rawOutput', kind: 'json' } as const;

  it('opens sealed values and returns plaintext as is (dual read)', () => {
    expect(openSealedField(cipher, textColumn, sealText(keyring, CASE))).toBe(CASE);
    expect(openSealedField(cipher, textColumn, CASE)).toBe(CASE);
    expect(openSealedField(cipher, textColumn, null)).toBeNull();
    expect(openSealedField(cipher, jsonColumn, { a: 1 })).toEqual({ a: 1 });
  });

  it('reads plaintext without any key configured', () => {
    const noKey = clinicalTextCipherFrom(config({}));
    expect(openSealedField(noKey, textColumn, CASE)).toBe(CASE);
    expect(() => openSealedField(noKey, textColumn, sealText(keyring, CASE))).toThrow(
      'FIELD_ENCRYPTION_KEY is required',
    );
  });

  it('names the field — and not the content — when a value does not open', () => {
    const otherKeyring = loadFieldKeyring(() => OTHER_KEY);
    const sealedElsewhere = sealText(otherKeyring, CASE);
    expect(() => openSealedField(cipher, textColumn, sealedElsewhere)).toThrow(SealedValueError);
    expect(() => openSealedField(cipher, textColumn, sealedElsewhere)).toThrow(
      /^AiInteraction\.inputRedacted: Sealed value uses unknown key/,
    );
  });
});

describe('clinical-text extension — flag', () => {
  it('writes sealed only with CLINICAL_TEXT_ENCRYPTION on (default off)', () => {
    expect(clinicalTextCipherFrom(config({})).encryptWrites()).toBe(false);
    expect(
      clinicalTextCipherFrom(config({ CLINICAL_TEXT_ENCRYPTION: 'off' })).encryptWrites(),
    ).toBe(false);
    expect(clinicalTextCipherFrom(config({ CLINICAL_TEXT_ENCRYPTION: 'on' })).encryptWrites()).toBe(
      true,
    );
    // typo nunca liga em silêncio
    expect(
      clinicalTextCipherFrom(config({ CLINICAL_TEXT_ENCRYPTION: 'onn' })).encryptWrites(),
    ).toBe(false);
  });

  it('reads the flag on every write (switches without restart)', () => {
    const values: Record<string, string> = {};
    const cipher = clinicalTextCipherFrom(config(values));
    expect(cipher.encryptWrites()).toBe(false);
    values.CLINICAL_TEXT_ENCRYPTION = 'on';
    expect(cipher.encryptWrites()).toBe(true);
  });
});
