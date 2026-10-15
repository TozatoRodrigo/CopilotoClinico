import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { PLAINTEXT_BY_DESIGN, SEALED_COLUMNS, sealedFieldsOf } from './clinical-text-fields';

const models = Prisma.dmmf.datamodel.models;

function fieldOf(model: string, field: string) {
  return models.find((m) => m.name === model)?.fields.find((f) => f.name === field);
}

/** Tabelas com dado de um atendimento: o próprio Encounter e quem tem encounterId. */
const ENCOUNTER_SCOPED = models.filter(
  (model) =>
    model.name === 'Encounter' || model.fields.some((field) => field.name === 'encounterId'),
);

function isFreeTextCandidate(field: (typeof models)[number]['fields'][number]): boolean {
  if (field.kind !== 'scalar') return false;
  if (field.type === 'Json') return true;
  return field.type === 'String' && field.nativeType?.[0] !== 'Uuid';
}

describe('CC-207 — inventário do texto clínico cifrado', () => {
  it('lists exactly the clinical-text columns (change here = change the PR/ADR-021 inventory)', () => {
    expect(SEALED_COLUMNS.map((column) => `${column.table}.${column.column}`)).toEqual([
      'ai_interactions.input_redacted',
      'ai_interactions.uncertainty_reason',
      'ai_interactions.raw_output',
      'ai_interactions.citations',
      'ai_interactions.answered_questions',
      'case_intakes.case_text_redacted',
      'case_intakes.reading',
      'case_intakes.questions',
      'case_intakes.answers',
      'encounter_attachments.text',
      'audio_captures.transcribed_text',
      'encounters.chief_complaint',
      'documents.content',
      'documents.physician_edits',
      'recommendation_decisions.note',
      'copilot_feedback.comment',
      'copilot_feedback.triage_note',
      'protocol_runs.abandon_reason',
      'protocol_runs.answers',
    ]);
  });

  it('maps every sealed field to a non-list String (text) or Json (json) column of the schema', () => {
    for (const column of SEALED_COLUMNS) {
      const field = fieldOf(column.model, column.field);
      expect(field, `${column.model}.${column.field}`).toBeDefined();
      expect(field!.isList).toBe(false);
      expect(field!.type).toBe(column.kind === 'text' ? 'String' : 'Json');
      // Texto cifrado não cabe em VARCHAR curto.
      if (column.kind === 'text') expect(field!.nativeType?.[0] ?? 'Text').toBe('Text');
    }
  });

  it('classifies every String/Json column of encounter-scoped tables as sealed or plaintext by design', () => {
    const unclassified: string[] = [];
    for (const model of ENCOUNTER_SCOPED) {
      const plaintext = PLAINTEXT_BY_DESIGN[model.name] ?? {};
      if (plaintext['*']) continue;
      for (const field of model.fields.filter(isFreeTextCandidate)) {
        const sealed = sealedFieldsOf(model.name)?.has(field.name) ?? false;
        if (!sealed && !plaintext[field.name]) unclassified.push(`${model.name}.${field.name}`);
      }
    }
    // Coluna nova com texto do caso: cifre (CLINICAL_TEXT_FIELDS) ou diga por
    // que fica em claro (PLAINTEXT_BY_DESIGN).
    expect(unclassified).toEqual([]);
  });

  it('keeps the plaintext list consistent with the schema and disjoint from the sealed list', () => {
    for (const [model, fields] of Object.entries(PLAINTEXT_BY_DESIGN)) {
      for (const field of Object.keys(fields)) {
        if (field === '*') continue;
        expect(fieldOf(model, field), `${model}.${field}`).toBeDefined();
        expect(sealedFieldsOf(model)?.has(field) ?? false).toBe(false);
      }
    }
  });
});
