import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { Prisma, type LegalDocument } from '@prisma/client';
import type { PrismaService } from '../../src/config/prisma.service';

/**
 * CC-905 — `legal_documents` e `legal_acceptances` em memória, com as
 * consultas que o LegalDocumentsService faz (e só elas). Serve para testar o
 * gate de ponta a ponta sem banco: publicar, aceitar, publicar de novo.
 */

interface StoredAcceptance {
  id: string;
  physicianId: string;
  documentId: string;
  acceptedAt: Date;
}

interface FakePhysician {
  id: string;
  erased?: boolean;
}

type DocumentCreateData = Omit<LegalDocument, 'id' | 'publishedAt' | 'sections'> & {
  sections: Prisma.InputJsonValue;
};

interface AcceptanceWhere {
  physicianId?: string;
  documentId?: { in: string[] };
  document?: { type: { in: string[] } };
}

export function createFakeLegalPrisma(physicians: FakePhysician[] = []) {
  const documents: LegalDocument[] = [];
  const acceptances: StoredAcceptance[] = [];
  // Relógio próprio: cada publicação é um segundo depois da anterior.
  let clock = Date.parse('2026-10-15T12:00:00.000Z');
  const nextInstant = () => new Date((clock += 1000));

  const isErased = (physicianId: string) =>
    physicians.some((physician) => physician.id === physicianId && physician.erased);
  const latestFirst = (a: LegalDocument, b: LegalDocument) =>
    b.publishedAt.getTime() - a.publishedAt.getTime();
  const documentById = (id: string) => documents.find((document) => document.id === id);
  const matchesAcceptance = (acceptance: StoredAcceptance, where: AcceptanceWhere) => {
    if (where.physicianId && acceptance.physicianId !== where.physicianId) return false;
    if (where.documentId && !where.documentId.in.includes(acceptance.documentId)) return false;
    if (where.document) {
      const type = documentById(acceptance.documentId)?.type ?? '';
      if (!where.document.type.in.includes(type)) return false;
    }
    return true;
  };

  const prisma = {
    legalDocument: {
      findFirst: vi.fn(async ({ where }: { where: { type: string } }) => {
        return (
          documents.filter((document) => document.type === where.type).sort(latestFirst)[0] ?? null
        );
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { type_version: { type: string; version: string } } }) =>
          documents.find(
            (document) =>
              document.type === where.type_version.type &&
              document.version === where.type_version.version,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: DocumentCreateData }) => {
        if (documents.some((d) => d.type === data.type && d.version === data.version)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const document: LegalDocument = {
          ...data,
          sections: data.sections as Prisma.JsonValue,
          id: randomUUID(),
          publishedAt: nextInstant(),
        };
        documents.push(document);
        return document;
      }),
      findMany: vi.fn(async () =>
        [...documents].sort(latestFirst).map((document) => ({
          ...document,
          _count: {
            acceptances: acceptances.filter(
              (acceptance) =>
                acceptance.documentId === document.id && !isErased(acceptance.physicianId),
            ).length,
          },
        })),
      ),
    },
    legalAcceptance: {
      count: vi.fn(
        async ({ where }: { where: AcceptanceWhere }) =>
          acceptances.filter((acceptance) => matchesAcceptance(acceptance, where)).length,
      ),
      findMany: vi.fn(async ({ where }: { where: AcceptanceWhere }) =>
        acceptances
          .filter((acceptance) => matchesAcceptance(acceptance, where))
          .map((acceptance) => {
            const document = documentById(acceptance.documentId);
            return {
              documentId: acceptance.documentId,
              document: {
                type: document?.type ?? '',
                version: document?.version ?? '',
                publishedAt: document?.publishedAt ?? new Date(0),
              },
            };
          }),
      ),
      createMany: vi.fn(
        async ({ data }: { data: Array<{ physicianId: string; documentId: string }> }) => {
          let count = 0;
          for (const row of data) {
            const exists = acceptances.some(
              (acceptance) =>
                acceptance.physicianId === row.physicianId &&
                acceptance.documentId === row.documentId,
            );
            if (exists) continue;
            acceptances.push({ id: randomUUID(), acceptedAt: new Date(), ...row });
            count += 1;
          }
          return { count };
        },
      ),
      groupBy: vi.fn(async ({ where }: { where: AcceptanceWhere }) => {
        const counts = new Map<string, number>();
        for (const acceptance of acceptances) {
          if (!matchesAcceptance(acceptance, where) || isErased(acceptance.physicianId)) continue;
          counts.set(acceptance.physicianId, (counts.get(acceptance.physicianId) ?? 0) + 1);
        }
        return [...counts].map(([physicianId, documentId]) => ({
          physicianId,
          _count: { documentId },
        }));
      }),
    },
    physician: {
      count: vi.fn(async () => physicians.filter((physician) => !physician.erased).length),
    },
  };

  return {
    prisma,
    asPrismaService: () => prisma as unknown as PrismaService,
    documents,
    acceptances,
  };
}
