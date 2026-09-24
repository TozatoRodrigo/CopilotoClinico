import { describe, expect, it } from 'vitest';
import { buildOfficialChunks, officialSourceVersion } from './official-chunks';
import type { ConitecListingItem, DocumentClassification } from './official-guideline.types';

const item: ConitecListingItem = {
  kind: 'pcdt',
  documentKey: 'pcdt:asma',
  title: 'Asma',
  documentUrl: 'https://www.gov.br/conitec/asma.pdf',
  normativeAct: 'Portaria Conjunta SAES/SCTIE/MS nº 43 - 24/03/2026 (Publicada em 02/04/2026 )',
  normativeActUrl: null,
  publishedAt: new Date('2026-04-02T00:00:00Z'),
  annexUpdatedAt: new Date('2026-09-04T00:00:00Z'),
  summaryUrl: null,
};

const classification: DocumentClassification = {
  careSetting: 'misto',
  population: 'todos',
  specialty: 'pneumologia',
  cenarios: ['crise_asmatica'],
  source: 'llm',
  rationale: 'Crise e controle.',
};

describe('officialSourceVersion', () => {
  it('usa a portaria sem a data de publicação e acrescenta a alteração do anexo', () => {
    expect(officialSourceVersion(item)).toBe(
      'Portaria Conjunta SAES/SCTIE/MS nº 43 - 24/03/2026 · anexo alterado em 04/09/2026',
    );
  });

  it('diferencia versões pela data de coleta quando nada mudou na lista', () => {
    const version = officialSourceVersion(
      { normativeAct: 'Portaria SAS/MS nº 1 - 01/01/2020', annexUpdatedAt: null },
      new Date('2026-09-24T12:00:00Z'),
    );

    expect(version).toBe('Portaria SAS/MS nº 1 - 01/01/2020 · versão coletada em 24/09/2026');
  });
});

describe('buildOfficialChunks', () => {
  const chunks = buildOfficialChunks({
    item,
    kindLabel: 'PCDT',
    sourceVersion: 'v',
    classification,
    document: {
      sectioning: 'structured',
      cid10: ['J45.0'],
      introduction: '',
      sections: [
        { number: 1, title: 'INTRODUÇÃO', text: 'Epidemiologia.', included: false },
        { number: 7, title: 'TRATAMENTO', text: 'Salbutamol inalatório na crise.', included: true },
      ],
    },
  });

  it('gera chunks só das seções incluídas, com cabeçalho de contexto', () => {
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('[PCDT · Asma · 7. TRATAMENTO]\nSalbutamol inalatório na crise.');
  });

  it('marca a origem oficial e leva o que o retrieval precisa na metadata', () => {
    expect(chunks[0]!.metadata).toMatchObject({
      origin: 'official_unreviewed',
      documentKey: 'pcdt:asma',
      section: '7. TRATAMENTO',
      careSetting: 'misto',
      cenarios: ['crise_asmatica'],
      url: 'https://www.gov.br/conitec/asma.pdf',
      cenario: null,
      subtipo: null,
    });
  });
});
