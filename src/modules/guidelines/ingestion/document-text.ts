import { extractText, getDocumentProxy } from 'unpdf';

/**
 * F4 — Extração de texto de arquivos enviados por médicos.
 *
 * Origem: um médico do piloto tentou incluir a diretriz da ABRAMEDE de dengue
 * e não conseguiu, "mesmo convertendo para .md ou .txt". A conversão manual de
 * um artigo de 47 páginas é trabalho que o servidor faz melhor — e pedir isso
 * ao médico em plantão é o mesmo que não ter a funcionalidade.
 *
 * O texto extraído é sempre UNTRUSTED: passa por máscara de PII e varredura
 * de injeção antes de chegar a qualquer prompt, como todo conteúdo que não
 * veio da curadoria.
 */
export type SupportedDocumentMime =
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'text/x-markdown';

export const SUPPORTED_DOCUMENT_MIMES: readonly SupportedDocumentMime[] = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
] as const;

/**
 * Teto do arquivo cru. Diretrizes clínicas publicadas raramente passam de
 * poucos MB (a diretriz de dengue da ABRAMEDE tem 790 KB); o limite existe
 * para o custo de parsing e de embedding ser previsível, não para acomodar
 * qualquer PDF.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * Teto do texto extraído. Um PDF de 47 páginas rende ~190 mil caracteres —
 * acima disso o material quase certamente é um livro, não uma diretriz, e
 * deve ser recortado antes de virar base de conhecimento.
 */
export const MAX_EXTRACTED_CHARS = 200_000;

export interface ExtractedDocument {
  text: string;
  /** Número de páginas, quando a origem é PDF. */
  pages: number | null;
  truncated: boolean;
}

export class DocumentExtractionError extends Error {}

/**
 * PDFs de diretriz costumam vir com hifenização de quebra de linha, quebras no
 * meio de frases e cabeçalho/rodapé repetidos por página. Sem esta limpeza, o
 * chunking por frase (ver chunking.ts) não encontra fronteira nenhuma e o
 * texto entra na base como um bloco só.
 */
function normalizePdfText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=\p{Ll})/gu, '') // hifenização de quebra de linha
    .replace(/([^\n.!?:;])\n(?=\p{Ll})/gu, '$1 ') // quebra no meio da frase
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractDocumentText(
  data: Buffer,
  mimeType: string,
): Promise<ExtractedDocument> {
  if (data.byteLength === 0) {
    throw new DocumentExtractionError('O arquivo está vazio.');
  }

  if (data.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DocumentExtractionError(
      `Arquivo acima de ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Envie apenas o capítulo ou a seção relevante.`,
    );
  }

  const raw = await readByMime(data, mimeType);
  const normalized = mimeType === 'application/pdf' ? normalizePdfText(raw.text) : raw.text.trim();

  if (normalized.length === 0) {
    throw new DocumentExtractionError(
      'Não foi possível ler texto deste arquivo. Se for um PDF digitalizado (imagem), copie o texto manualmente.',
    );
  }

  const truncated = normalized.length > MAX_EXTRACTED_CHARS;

  return {
    text: truncated ? normalized.slice(0, MAX_EXTRACTED_CHARS) : normalized,
    pages: raw.pages,
    truncated,
  };
}

async function readByMime(
  data: Buffer,
  mimeType: string,
): Promise<{ text: string; pages: number | null }> {
  if (mimeType === 'application/pdf') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      return { text: Array.isArray(text) ? text.join('\n\n') : text, pages: totalPages };
    } catch {
      // A mensagem do pdf.js não ajuda um médico — traduzimos para uma ação.
      throw new DocumentExtractionError(
        'Não foi possível ler este PDF. Se ele estiver protegido por senha ou for digitalizado, copie o texto manualmente.',
      );
    }
  }

  if ((SUPPORTED_DOCUMENT_MIMES as readonly string[]).includes(mimeType)) {
    return { text: data.toString('utf-8'), pages: null };
  }

  throw new DocumentExtractionError(
    'Formato não suportado. Envie PDF, .md ou .txt — ou cole o texto direto.',
  );
}
