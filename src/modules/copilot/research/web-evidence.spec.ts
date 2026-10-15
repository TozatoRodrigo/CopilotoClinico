import { describe, expect, it } from 'vitest';
import { buildWebEvidence, isWebEvidenceId } from './web-evidence';

const DOMAINS = ['gov.br', 'ahajournals.org'];
const AHA = 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211';
const MS = 'https://www.gov.br/saude/pt-br/assuntos/protocolos/avc';

describe('buildWebEvidence', () => {
  it('turns each cited page into a citable item, in the order of citation', () => {
    const { items, outsideAllowlist } = buildWebEvidence(
      [
        { url: MS, title: 'Linha de Cuidado do AVC', citedText: 'TC de crânio imediata.' },
        { url: AHA, title: 'AHA/ASA 2019', citedText: 'Alteplase 0.9 mg/kg within 4.5 h.' },
      ],
      DOMAINS,
    );

    expect(items).toEqual([
      {
        id: 'web:1',
        url: MS,
        title: 'Linha de Cuidado do AVC',
        domain: 'gov.br',
        citedText: 'TC de crânio imediata.',
      },
      {
        id: 'web:2',
        url: AHA,
        title: 'AHA/ASA 2019',
        domain: 'ahajournals.org',
        citedText: 'Alteplase 0.9 mg/kg within 4.5 h.',
      },
    ]);
    expect(outsideAllowlist).toEqual([]);
  });

  it('groups the passages of the same page and drops repeated ones', () => {
    const { items } = buildWebEvidence(
      [
        { url: AHA, title: null, citedText: 'Alteplase within 4.5 h.' },
        { url: `${AHA}#sec-3`, title: 'AHA/ASA 2019', citedText: 'BP < 185/110 before alteplase.' },
        { url: AHA, title: 'AHA/ASA 2019', citedText: ' Alteplase within 4.5 h. ' },
      ],
      DOMAINS,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'web:1',
      title: 'AHA/ASA 2019',
      citedText: 'Alteplase within 4.5 h.\n…\nBP < 185/110 before alteplase.',
    });
  });

  it('drops citations outside the allowlist or that are not web pages', () => {
    const { items, outsideAllowlist } = buildWebEvidence(
      [
        { url: 'https://blog-de-saude.com/avc', title: 'Blog', citedText: 'Dica.' },
        { url: 'ftp://gov.br/arquivo', title: null, citedText: 'Arquivo.' },
        { url: 'não é URL', title: null, citedText: 'Nada.' },
        { url: MS, title: 'MS', citedText: 'TC imediata.' },
      ],
      DOMAINS,
    );

    expect(items.map((item) => item.url)).toEqual([MS]);
    expect(outsideAllowlist).toEqual([
      'https://blog-de-saude.com/avc',
      'ftp://gov.br/arquivo',
      'não é URL',
    ]);
  });

  it('ignores citations without text', () => {
    const { items } = buildWebEvidence([{ url: MS, title: 'MS', citedText: '   ' }], DOMAINS);

    expect(items).toEqual([]);
  });

  it('keeps at most 12 pages', () => {
    const citations = Array.from({ length: 15 }, (_, index) => ({
      url: `https://www.gov.br/pagina-${index}`,
      title: null,
      citedText: `Trecho ${index}.`,
    }));

    const { items } = buildWebEvidence(citations, DOMAINS);

    expect(items).toHaveLength(12);
    expect(items.at(-1)?.id).toBe('web:12');
  });
});

describe('isWebEvidenceId', () => {
  it.each([
    ['web:3', true],
    ['chunk-1', false],
    ['anexo:abc', false],
  ])('%s → %s', (id, expected) => {
    expect(isWebEvidenceId(id)).toBe(expected);
  });
});
