import { describe, expect, it } from 'vitest';
import { legalDocumentHash } from './legal-document-hash';

const document = {
  title: 'Termos',
  sections: [{ heading: '1. Uso', paragraphs: ['Primeiro.', 'Segundo.'] }],
};

describe('legalDocumentHash (CC-905)', () => {
  it('is a sha256 hex digest', () => {
    expect(legalDocumentHash(document)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on the key order of the stored JSON', () => {
    const fromDatabase = {
      sections: [{ paragraphs: ['Primeiro.', 'Segundo.'], heading: '1. Uso' }],
      title: 'Termos',
    };
    expect(legalDocumentHash(fromDatabase)).toBe(legalDocumentHash(document));
  });

  it('changes with any change in the text', () => {
    const base = legalDocumentHash(document);
    expect(legalDocumentHash({ ...document, title: 'Termos de Uso' })).not.toBe(base);
    expect(
      legalDocumentHash({
        ...document,
        sections: [{ heading: '1. Uso', paragraphs: ['Primeiro.', 'Segundo!'] }],
      }),
    ).not.toBe(base);
    expect(
      legalDocumentHash({
        ...document,
        sections: [{ heading: '1. Uso', paragraphs: ['Segundo.', 'Primeiro.'] }],
      }),
    ).not.toBe(base);
  });

  it('ignores type and version: the same text keeps the same hash', () => {
    const withMetadata = { ...document, type: 'terms_of_use', version: 'v9' };
    expect(legalDocumentHash(withMetadata)).toBe(legalDocumentHash(document));
  });
});
