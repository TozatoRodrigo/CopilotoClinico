import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  ERASURE_EXCEPTIONS,
  ERASURE_POLICY,
  PHYSICIAN_KEPT_COLUMNS,
  anonymizedPhysician,
} from './erasure-policy';

/**
 * CC-012 — inventário: toda coluna do schema que aponta para o médico está na
 * eliminação ou nas exceções justificadas. Lê o schema pelo DMMF do Prisma
 * Client gerado, então vale para o schema que o CI acabou de gerar.
 */

/** Pelo nome: guardam o id do médico mesmo sem FK (ex.: ai_calls). */
const SUBJECT_COLUMNS = new Set(['physician_id', 'user_id']);
const SUBJECT_FIELDS = new Set(['physicianId', 'userId']);

function physicianReferencesInSchema(): string[] {
  const references = new Set<string>();

  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName ?? model.name;
    const columnOf = (fieldName: string): string =>
      model.fields.find((field) => field.name === fieldName)?.dbName ?? fieldName;

    for (const field of model.fields) {
      if (field.kind === 'scalar') {
        const column = field.dbName ?? field.name;
        if (SUBJECT_COLUMNS.has(column) || SUBJECT_FIELDS.has(field.name)) {
          references.add(`${table}.${column}`);
        }
      }
      // FK para physicians com outro nome de coluna (ex.: requester_id).
      if (field.kind === 'object' && field.type === 'Physician') {
        for (const fromField of field.relationFromFields ?? []) {
          references.add(`${table}.${columnOf(fromField)}`);
        }
      }
    }
  }

  return [...references].sort();
}

const policyReferences = Object.keys(ERASURE_POLICY);
const exceptionReferences = Object.keys(ERASURE_EXCEPTIONS);

describe('CC-012 — inventário da eliminação LGPD', () => {
  it('toda coluna que aponta para o médico está na eliminação ou nas exceções', () => {
    const decided = new Set([...policyReferences, ...exceptionReferences]);
    const undecided = physicianReferencesInSchema().filter((ref) => !decided.has(ref));

    expect(
      undecided,
      'Coluna nova que aponta para o médico: decida em src/modules/lgpd/erasure-policy.ts ' +
        '(ERASURE_POLICY, apagar ou anonimizar, e implemente em LgpdService.requestErasure; ' +
        'ou ERASURE_EXCEPTIONS, com o porquê) e semeie a tabela no teste de integração ' +
        'tests/integration/cc-012-lgpd-erasure-complete.integration-spec.ts.',
    ).toEqual([]);
  });

  it('a política e as exceções só citam colunas que existem no schema', () => {
    const inSchema = new Set(physicianReferencesInSchema());

    expect(
      [...policyReferences, ...exceptionReferences].filter((ref) => !inSchema.has(ref)),
    ).toEqual([]);
  });

  it('nenhuma coluna é eliminada e exceção ao mesmo tempo', () => {
    expect(policyReferences.filter((ref) => exceptionReferences.includes(ref))).toEqual([]);
  });

  it('toda decisão tem o porquê escrito', () => {
    const reasons = [
      ...Object.values(ERASURE_POLICY).map((decision) => decision.reason),
      ...Object.values<string>(ERASURE_EXCEPTIONS),
      ...Object.values(PHYSICIAN_KEPT_COLUMNS),
    ];

    for (const reason of reasons) {
      expect(reason.trim().length).toBeGreaterThan(20);
    }
  });

  it('toda coluna do cadastro é anonimizada ou mantida com justificativa, nunca as duas', () => {
    const physician = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Physician');
    const columns = (physician?.fields ?? [])
      .filter((field) => field.kind !== 'object')
      .map((field) => field.name)
      .sort();
    const anonymized = Object.keys(anonymizedPhysician('id'));
    const kept = Object.keys(PHYSICIAN_KEPT_COLUMNS);

    expect([...anonymized, ...kept].sort()).toEqual(columns);
    expect(anonymized.filter((column) => kept.includes(column))).toEqual([]);
  });

  it('o cadastro anonimizado não guarda e-mail, nome, CRM nem segredo do MFA', () => {
    const physicianId = '550e8400-e29b-41d4-a716-446655440000';

    expect(anonymizedPhysician(physicianId)).toMatchObject({
      name: 'ERASED',
      email: `erased-${physicianId}@erased.com`,
      crmUf: 'XX',
      crmNumber: 'ERASED',
      crmVerified: false,
      mfaEnabled: false,
      mfaSecret: null,
    });
  });
});
