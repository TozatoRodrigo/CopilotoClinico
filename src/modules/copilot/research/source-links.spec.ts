import { describe, expect, it } from 'vitest';
import type { WebEvidenceItem } from '../../../shared/contracts/clinical';
import {
  acceptSourceLinks,
  applySourceLinkText,
  normalizeDoseText,
  parseSourceAttachResponse,
  type SourceAttachItem,
} from './source-links';
import type { VerificationAction } from './source-verification-prompt';

/**
 * Mesclagem determinística da verificação com fonte: o modelo do vínculo só
 * sugere; o código aceita id desta análise e dose literal do trecho.
 */

const evidence: WebEvidenceItem[] = [
  {
    id: 'web:1',
    url: 'https://www.gov.br/saude/protocolo-avc',
    title: 'Protocolo de AVC',
    domain: 'gov.br',
    citedText:
      'Alteplase 0,9 mg/kg IV (máximo de 90 mg), 10% em bolus.\n…\nPA abaixo de 185/110 mmHg.',
  },
  {
    id: 'web:2',
    url: 'https://www.ahajournals.org/doi/x',
    title: 'AHA/ASA',
    domain: 'ahajournals.org',
    citedText: 'Ceftriaxona 2 g IV a cada 12 horas na meningite bacteriana.',
  },
];

// [A1] e [A2] são as recomendações 1 e 3 da saída da decisão.
const actions: VerificationAction[] = [
  { label: 1, recommendationIndex: 1, action: 'Trombólise com alteplase' },
  { label: 2, recommendationIndex: 3, action: 'Ceftriaxona IV' },
];

function item(overrides: Partial<SourceAttachItem> = {}): SourceAttachItem {
  return { action: 1, citationId: 'web:1', dose: null, conflict: null, ...overrides };
}

describe('acceptSourceLinks', () => {
  it('links each action to its recommendation index in the decision output', () => {
    const links = acceptSourceLinks(
      actions,
      [item(), item({ action: 2, citationId: 'web:2' })],
      evidence,
    );

    expect([...links.entries()]).toEqual([
      [1, { citationId: 'web:1', dose: null, conflict: null }],
      [3, { citationId: 'web:2', dose: null, conflict: null }],
    ]);
  });

  describe('dose', () => {
    it.each([
      ['exactly as the excerpt writes it', '0,9 mg/kg IV'],
      ['with different case', '0,9 MG/KG IV'],
      ['with different accents and spaces', '  máximo   de 90 MG '],
      ['without the accents the excerpt has', 'maximo de 90 mg'],
    ])('accepts a dose written %s', (_label, dose) => {
      const links = acceptSourceLinks(actions, [item({ dose })], evidence);

      expect(links.get(1)?.dose).toBe(dose.trim());
    });

    it.each([
      ['a different number', '1 mg/kg IV'],
      ['a different unit', '0,9 mg IV'],
      ['a decimal point instead of a comma', '0.9 mg/kg'],
      ['the dose of another excerpt', '2 g IV'],
      ['a blank dose', '   '],
    ])('drops %s, keeping the citation', (_label, dose) => {
      const links = acceptSourceLinks(actions, [item({ dose })], evidence);

      expect(links.get(1)).toEqual({ citationId: 'web:1', dose: null, conflict: null });
    });
  });

  describe('id da evidência', () => {
    it.each([
      ['an id that is not in this analysis', 'web:9'],
      ['an id of another kind', 'chunk-avc'],
      ['no id', null],
    ])('ignores %s, with its dose and conflict', (_label, citationId) => {
      const links = acceptSourceLinks(
        actions,
        [item({ citationId, dose: '0,9 mg/kg', conflict: 'Diverge.' })],
        evidence,
      );

      expect(links.size).toBe(0);
    });

    it('ignores a label that was never numbered', () => {
      expect(acceptSourceLinks(actions, [item({ action: 7 })], evidence).size).toBe(0);
    });

    it('keeps the first valid link of an action', () => {
      const links = acceptSourceLinks(
        actions,
        [item({ citationId: 'web:9' }), item({ citationId: 'web:2' }), item()],
        evidence,
      );

      expect(links.get(1)?.citationId).toBe('web:2');
    });
  });

  describe('conflito', () => {
    it('keeps the conflict of a valid link', () => {
      const links = acceptSourceLinks(
        actions,
        [item({ conflict: '  A fonte pede PA abaixo de 185/110 antes da trombólise. ' })],
        evidence,
      );

      expect(links.get(1)?.conflict).toBe('A fonte pede PA abaixo de 185/110 antes da trombólise.');
    });

    it('reads a blank conflict as none', () => {
      expect(acceptSourceLinks(actions, [item({ conflict: ' ' })], evidence).get(1)?.conflict).toBe(
        null,
      );
    });
  });
});

describe('applySourceLinkText', () => {
  const recommendation = {
    action: 'Trombólise com alteplase',
    rationale: 'AVC isquêmico na janela.',
  };

  it('appends the dose from the source to the action', () => {
    expect(
      applySourceLinkText(recommendation, {
        citationId: 'web:1',
        dose: '0,9 mg/kg IV',
        conflict: null,
      }),
    ).toEqual({
      action: 'Trombólise com alteplase — dose na fonte: 0,9 mg/kg IV',
      rationale: 'AVC isquêmico na janela.',
    });
  });

  it('appends the divergence to the rationale', () => {
    expect(
      applySourceLinkText(recommendation, {
        citationId: 'web:1',
        dose: null,
        conflict: 'A fonte exige PA abaixo de 185/110.',
      }),
    ).toEqual({
      action: 'Trombólise com alteplase',
      rationale:
        'AVC isquêmico na janela. Fonte oficial diverge: A fonte exige PA abaixo de 185/110.',
    });
  });

  it('changes nothing for a link without dose or conflict', () => {
    expect(
      applySourceLinkText(recommendation, { citationId: 'web:1', dose: null, conflict: null }),
    ).toEqual(recommendation);
  });
});

describe('parseSourceAttachResponse', () => {
  it('reads the structured output', () => {
    expect(parseSourceAttachResponse(JSON.stringify({ items: [item()] }))).toEqual({
      success: true,
      items: [item()],
    });
  });

  it('reads JSON wrapped in a code block', () => {
    expect(parseSourceAttachResponse('```json\n{"items": []}\n```')).toEqual({
      success: true,
      items: [],
    });
  });

  it('rejects text that is not JSON', () => {
    expect(parseSourceAttachResponse('Não encontrei.')).toEqual({
      success: false,
      reason: 'o vínculo não devolveu JSON',
    });
  });

  it('rejects JSON outside the schema', () => {
    const parsed = parseSourceAttachResponse(JSON.stringify({ items: [{ action: '1' }] }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.reason).toContain('o vínculo saiu do schema');
  });
});

describe('normalizeDoseText', () => {
  it('ignores case, accents and repeated spaces, and nothing else', () => {
    expect(normalizeDoseText('  Máximo de  90 MG ')).toBe('maximo de 90 mg');
    expect(normalizeDoseText('0,9 mg/kg')).not.toBe(normalizeDoseText('0.9 mg/kg'));
  });
});
