import { Injectable } from '@nestjs/common';

/**
 * ADR-010 — Acesso HTTP às páginas e PDFs da Conitec. Isolado atrás de uma
 * interface para o serviço de sincronização ser testável sem rede.
 */
export interface OfficialSourceFetcher {
  fetchText(url: string): Promise<string>;
  /** `null` quando a URL não devolve PDF (ex.: link para página HTML). */
  fetchPdf(url: string): Promise<Buffer | null>;
}

export const OFFICIAL_SOURCE_FETCHER = Symbol('OFFICIAL_SOURCE_FETCHER');

const USER_AGENT = 'CopilotoClinico-OfficialGuidelinesSync/1.0 (+https://www.gov.br/conitec)';
const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;
/** PCDT grande (HIV, oncologia) passa de 10 MB; acima disto é anomalia. */
export const MAX_PDF_BYTES = 60 * 1024 * 1024;

export class OfficialSourceFetchError extends Error {}

@Injectable()
export class HttpOfficialSourceFetcher implements OfficialSourceFetcher {
  async fetchText(url: string): Promise<string> {
    const response = await this.request(url);
    return response.text();
  }

  async fetchPdf(url: string): Promise<Buffer | null> {
    const response = await this.request(url);
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = Buffer.from(await response.arrayBuffer());

    // O Plone às vezes serve PDF como octet-stream; a assinatura é a prova.
    const isPdf =
      contentType.includes('pdf') || bytes.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!isPdf) return null;

    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new OfficialSourceFetchError(
        `PDF com ${Math.round(bytes.byteLength / 1024 / 1024)} MB excede o teto de ${MAX_PDF_BYTES / 1024 / 1024} MB`,
      );
    }
    return bytes;
  }

  private async request(url: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': USER_AGENT },
          redirect: 'follow',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // 4xx não melhora com nova tentativa.
        if (response.status >= 400 && response.status < 500) {
          throw new OfficialSourceFetchError(`HTTP ${response.status} em ${url}`);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
        return response;
      } catch (err) {
        if (err instanceof OfficialSourceFetchError) throw err;
        lastError = err;
        if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new OfficialSourceFetchError(
      `Falha ao baixar ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
}
