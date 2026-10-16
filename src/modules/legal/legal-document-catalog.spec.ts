import { describe, expect, it } from 'vitest';
import { GATED_LEGAL_DOCUMENT_TYPES, LEGAL_DOCUMENT_TYPES } from '../../shared/contracts/legal';
import { LEGAL_DOCUMENT_CATALOG, findLegalDocumentDraft } from './legal-document-catalog';
import { legalDocumentHash } from './legal-document-hash';

describe('LEGAL_DOCUMENT_CATALOG (CC-905)', () => {
  it('has one draft per (type, version), within the column limits', () => {
    const keys = LEGAL_DOCUMENT_CATALOG.map((draft) => `${draft.type}@${draft.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const draft of LEGAL_DOCUMENT_CATALOG) {
      expect(LEGAL_DOCUMENT_TYPES).toContain(draft.type);
      expect(draft.version.length).toBeLessThanOrEqual(64);
      expect(draft.title.length).toBeLessThanOrEqual(200);
      expect(draft.changeSummary.length).toBeGreaterThan(0);
      expect(draft.sections.length).toBeGreaterThan(0);
    }
  });

  it('has a draft for every type the gate requires', () => {
    for (const type of GATED_LEGAL_DOCUMENT_TYPES) {
      expect(LEGAL_DOCUMENT_CATALOG.some((draft) => draft.type === type)).toBe(true);
    }
  });

  it('says "provisorio" in the version exactly when the text is provisional', () => {
    for (const draft of LEGAL_DOCUMENT_CATALOG) {
      expect(draft.version.includes('provisorio')).toBe(draft.provisional);
    }
  });

  it('covers tools, cards, mentoring and beta in the v2 terms and privacy policy', () => {
    for (const type of GATED_LEGAL_DOCUMENT_TYPES) {
      const draft = findLegalDocumentDraft(type, '2026-10-15-v2-provisorio');
      const headings = draft?.sections.map((section) => section.heading).join(' | ') ?? '';
      expect(headings).toMatch(/Ferramentas de beira-leito/);
      expect(headings).toMatch(/Cartões clínicos revisados/);
      expect(headings).toMatch(/Mentoria/);
      expect(headings).toMatch(/Beta/);
    }
  });

  /**
   * Mudou o texto de uma versão? Não atualize o hash aqui: crie uma VERSÃO
   * NOVA no catálogo. Quem aceitou a antiga aceitou aquele texto, e o publish
   * recusa texto diferente com a mesma versão.
   */
  it('keeps the text of each version frozen', () => {
    const hashes = Object.fromEntries(
      LEGAL_DOCUMENT_CATALOG.map((draft) => [
        `${draft.type}@${draft.version}`,
        legalDocumentHash(draft),
      ]),
    );
    expect(hashes).toEqual({
      'terms_of_use@2026-10-15-v2-provisorio':
        '26f17051848b4aca9a0418d24fd37e8da9e96383ea00c2a7b8aa9ba1c2dc5382',
      'privacy_policy@2026-10-15-v2-provisorio':
        '509ebb3482353790ec7939d1908c0ddcf2ed41c308c0ce5d73582d08187ddecc',
    });
  });

  it('finds a draft by type and version', () => {
    expect(findLegalDocumentDraft('privacy_policy', '2026-10-15-v2-provisorio')?.title).toBe(
      'Política de Privacidade do Copiloto Clínico',
    );
    expect(findLegalDocumentDraft('privacy_policy', 'nao-existe')).toBeUndefined();
  });
});
