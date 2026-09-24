import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConitecListing, slugify } from './conitec-listing';
import { CONITEC_LISTINGS } from './official-guideline.types';

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures/conitec', `${name}.html`), 'utf-8');
}

const pcdt = parseConitecListing(fixture('pcdt'), 'pcdt');

function byTitle(title: string) {
  const item = pcdt.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`"${title}" não encontrado na fixture`);
  return item;
}

describe('parseConitecListing — tabelas reais da Conitec (24/09/2026)', () => {
  it.each([
    ['pcdt', 'pcdt', 132],
    ['ddt', 'ddt', 16],
    ['diretriz_brasileira', 'diretrizes-brasileiras', 22],
    ['protocolo_uso', 'protocolos-de-uso', 20],
  ] as const)('reconhece todos os documentos da lista %s', (kind, file, expected) => {
    const items = parseConitecListing(fixture(file), kind);

    expect(items).toHaveLength(expected);
    // O piso de integridade precisa ficar abaixo do que a página realmente tem.
    const floor = CONITEC_LISTINGS.find((source) => source.kind === kind)!.minItems;
    expect(items.length).toBeGreaterThanOrEqual(floor);
  });

  it('extrai portaria, publicação, resumo e URLs absolutas', () => {
    expect(byTitle('Acidente Vascular Cerebral (AVC) Isquêmico Agudo')).toEqual({
      kind: 'pcdt',
      documentKey: 'pcdt:acidente-vascular-cerebral-avc-isquemico-agudo',
      title: 'Acidente Vascular Cerebral (AVC) Isquêmico Agudo',
      documentUrl:
        'https://www.gov.br/conitec/pt-br/midias/protocolos/tromb-lise-no-acidente-vascular-cerebral-isqu-mico-agudo.pdf/@@display-file/file',
      normativeAct: 'Portaria Conjunta SAES/SECTICS/MS nº 29 - 12/12/2023 (Publicada em 15/12/2023',
      normativeActUrl:
        'https://www.gov.br/conitec/pt-br/midias/relatorios/portaria/2023/portaria-conjunta-saes-sectics-no-29.pdf/@@display-file/file',
      publishedAt: new Date('2023-12-15T00:00:00Z'),
      annexUpdatedAt: null,
      summaryUrl:
        'https://www.gov.br/conitec/pt-br/midias/protocolos/resumidos/pcdt-resumido-avc.pdf/@@display-file/file',
    });
  });

  it('captura "Anexo alterado em" — o PCDT muda sem portaria nova', () => {
    const asma = byTitle('Asma');

    expect(asma.annexUpdatedAt).toEqual(new Date('2026-09-04T00:00:00Z'));
    expect(asma.publishedAt).toEqual(new Date('2026-04-02T00:00:00Z'));
  });

  it('tira do título a nota de atualização, para a chave não mudar a cada versão', () => {
    const osteoporose = pcdt.find((item) => item.title.startsWith('Osteoporose'))!;

    expect(osteoporose.title).toBe('Osteoporose');
    expect(osteoporose.documentKey).toBe('pcdt:osteoporose');
    expect(osteoporose.annexUpdatedAt).toEqual(new Date('2026-01-29T00:00:00Z'));
  });

  it('aceita as variações de data de publicação da lista', () => {
    const ddt = parseConitecListing(fixture('ddt'), 'ddt');
    const db = parseConitecListing(fixture('diretrizes-brasileiras'), 'diretriz_brasileira');

    // "... 14/10/2022 ( 24/10/2022)" — só a data entre parênteses.
    expect(
      ddt.find((item) => item.title.startsWith('Carcinoma Hepatocelular'))!.publishedAt,
    ).toEqual(new Date('2022-10-24T00:00:00Z'));
    // "Despacho nº 78 ... (Publicado em 14/04/2022)" — masculino.
    expect(db.every((item) => item.publishedAt !== null)).toBe(true);
    // "(Publicada 22/07/2026)" — sem o "em".
    expect(byTitle('Endometriose').publishedAt).toEqual(new Date('2026-07-22T00:00:00Z'));
  });

  it('descarta link quebrado publicado na própria lista', () => {
    const summaries = pcdt.map((item) => item.summaryUrl).filter(Boolean);

    expect(summaries.every((url) => url!.startsWith('https://'))).toBe(true);
  });

  it('gera chaves únicas', () => {
    const keys = pcdt.map((item) => item.documentKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('devolve lista vazia quando a página não tem tabela', () => {
    expect(parseConitecListing('<html><body>manutenção</body></html>', 'pcdt')).toEqual([]);
  });
});

describe('slugify', () => {
  it('remove acentos e pontuação', () => {
    expect(slugify('Doença Pulmonar Obstrutiva Crônica')).toBe(
      'doenca-pulmonar-obstrutiva-cronica',
    );
    expect(slugify('Artrite Idiopática Juvenil (AIJ)')).toBe('artrite-idiopatica-juvenil-aij');
  });
});
