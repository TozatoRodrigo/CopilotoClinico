import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  extractDocumentText,
  DocumentExtractionError,
  MAX_DOCUMENT_BYTES,
} from './document-text';

/**
 * F4 — extração de texto de arquivos enviados por médicos. Origem: um médico
 * do piloto não conseguiu incluir a diretriz da ABRAMEDE de dengue "mesmo
 * convertendo para .md ou .txt" — converter um artigo de 47 páginas à mão é
 * trabalho que o servidor faz melhor.
 */
describe('extractDocumentText', () => {
  it('lê texto simples e markdown sem alterar o conteúdo', async () => {
    const md = '---\nsource: X\n---\n\nConteúdo da diretriz.';
    const result = await extractDocumentText(Buffer.from(md, 'utf-8'), 'text/markdown');

    expect(result.text).toBe(md.trim());
    expect(result.pages).toBeNull();
    expect(result.truncated).toBe(false);
  });

  it('recusa arquivo vazio com mensagem acionável', async () => {
    await expect(extractDocumentText(Buffer.alloc(0), 'text/plain')).rejects.toThrow(
      DocumentExtractionError,
    );
  });

  it('recusa arquivo acima do teto, indicando o que fazer', async () => {
    const big = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41);

    await expect(extractDocumentText(big, 'text/plain')).rejects.toThrow(
      /Envie apenas o capítulo ou a seção relevante/,
    );
  });

  it('recusa formato não suportado sem deixar o médico sem saída', async () => {
    await expect(
      extractDocumentText(Buffer.from('x'), 'application/vnd.ms-excel'),
    ).rejects.toThrow(/cole o texto direto/);
  });

  it('traduz falha de parsing de PDF em instrução clínica, não em erro do pdf.js', async () => {
    const notAPdf = Buffer.from('isto não é um PDF', 'utf-8');

    await expect(extractDocumentText(notAPdf, 'application/pdf')).rejects.toThrow(
      /copie o texto manualmente/,
    );
  });

  it('normaliza hifenização e quebras de linha do PDF para o chunking achar fronteira de frase', async () => {
    // O caminho de PDF é exercitado por integração (ver abaixo); aqui
    // garantimos que texto puro não sofre a normalização de PDF.
    const texto = 'Reposição volêmica: 10 mL/kg\nna primeira hora.';
    const result = await extractDocumentText(Buffer.from(texto, 'utf-8'), 'text/plain');

    expect(result.text).toBe(texto);
  });

  // Fixture versionada (gerada com pdfkit — ver histórico) em vez do artigo
  // original, que é material de terceiros. Roda sempre: o CI barra teste
  // pulado, e um caminho de PDF sem cobertura era justamente o risco aqui.
  const FIXTURE = join(process.cwd(), 'tests/fixtures/sample-guideline.pdf');

  it('extrai texto e contagem de páginas de um PDF real', async () => {
    const result = await extractDocumentText(readFileSync(FIXTURE), 'application/pdf');

    expect(result.pages).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(100);
    // A normalização precisa produzir frases — sem isso o chunking por
    // fronteira de frase (chunking.ts) devolve um bloco único.
    expect(result.text).toMatch(/[.!?]\s+[A-ZÀ-Ú]/);
  });
});
