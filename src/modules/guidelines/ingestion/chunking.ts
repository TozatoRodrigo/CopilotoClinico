export interface ChunkInput {
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  cenario?: string;
  redFlags?: string[];
  // S21-CLIN-01 — ver GuidelineFrontMatter.subtipo em ingestion/front-matter.ts.
  subtipo?: string;
}

export interface ChunkResult {
  text: string;
  index: number;
  metadata: {
    source: string;
    sourceVersion: string;
    specialty: string;
    evidenceLevel?: string;
    cenario?: string;
    redFlags?: string[];
    subtipo?: string;
    charStart: number;
    charEnd: number;
  };
}

/**
 * KB-005/KB-006 — Chunking consciente da estrutura do texto.
 *
 * Antes: fatiamento em 500 caracteres fixos com 50 de sobreposição, sem
 * respeitar frase nem parágrafo. Numa base clínica isso quebra exatamente o
 * que mais importa — uma prescrição como "10 mL/kg de soro fisiológico a 0,9%
 * na primeira hora" podia ser partida em dois chunks, e um chunk recuperado
 * podia começar no meio de uma frase, chegando ao prompt como evidência
 * truncada e sem sujeito.
 *
 * Agora: os cortes acontecem em fronteira de FRASE, e parágrafos pequenos são
 * agrupados até `TARGET_CHUNK_SIZE`. Uma frase só é partida no meio quando ela
 * sozinha excede `MAX_CHUNK_SIZE` (último recurso, preserva a garantia de que
 * nenhum chunk estoura o limite).
 */
const TARGET_CHUNK_SIZE = 1200;

/**
 * Teto absoluto. Um chunk nunca passa disto; só é atingido quando uma única
 * frase é maior que o alvo.
 */
const MAX_CHUNK_SIZE = 1500;

/**
 * Sobreposição por FRASE, não por contagem de caracteres: o novo chunk começa
 * repetindo a última frase do anterior quando ela cabe neste limite. Mantém a
 * continuidade que a sobreposição antiga dava, sem herdar o corte cego.
 */
const MAX_OVERLAP_SIZE = 300;

interface Span {
  start: number;
  end: number;
}

/**
 * Fronteira de frase: ponto/exclamação/interrogação seguidos de espaço e de
 * uma letra maiúscula. Exigir a maiúscula é o que evita partir "0,9%" ou
 * "1,5 mL" (dígito depois) e a maioria das abreviações clínicas, que são
 * seguidas de minúscula. Quebra de parágrafo também é fronteira.
 */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/g;
const PARAGRAPH_BOUNDARY = /\n\s*\n/g;

function splitWithOffsets(text: string, pattern: RegExp, offset = 0): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  pattern.lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const end = match.index;
    if (end > cursor) spans.push({ start: offset + cursor, end: offset + end });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) spans.push({ start: offset + cursor, end: offset + text.length });
  return spans;
}

/**
 * Unidades atômicas de corte: frases dentro de parágrafos. Uma frase maior que
 * `MAX_CHUNK_SIZE` é partida em pedaços do tamanho do teto — único caso em que
 * um corte cai no meio de uma frase.
 */
function buildUnits(text: string): Span[] {
  const units: Span[] = [];

  for (const paragraph of splitWithOffsets(text, PARAGRAPH_BOUNDARY)) {
    const body = text.slice(paragraph.start, paragraph.end);

    for (const sentence of splitWithOffsets(body, SENTENCE_BOUNDARY, paragraph.start)) {
      let { start } = sentence;
      while (sentence.end - start > MAX_CHUNK_SIZE) {
        units.push({ start, end: start + MAX_CHUNK_SIZE });
        start += MAX_CHUNK_SIZE;
      }
      if (sentence.end > start) units.push({ start, end: sentence.end });
    }
  }

  return units;
}

export function chunkText(input: ChunkInput): ChunkResult[] {
  const { text, source, sourceVersion, specialty, evidenceLevel, cenario, redFlags, subtipo } =
    input;

  if (text.trim().length === 0) {
    return [];
  }

  const units = buildUnits(text);
  if (units.length === 0) return [];

  const spans: Span[] = [];
  let current: Span = { ...units[0]! };

  for (let i = 1; i < units.length; i++) {
    const unit = units[i]!;

    // Cabe no alvo: estende o chunk atual até o fim desta frase.
    if (unit.end - current.start <= TARGET_CHUNK_SIZE) {
      current.end = unit.end;
      continue;
    }

    spans.push(current);

    // Sobreposição: começa o próximo chunk repetindo a última frase do
    // anterior, quando ela é curta o bastante para não dominar o novo chunk.
    const previousUnitStart = units[i - 1]!.start;
    const overlapFits =
      current.end - previousUnitStart <= MAX_OVERLAP_SIZE &&
      unit.end - previousUnitStart <= MAX_CHUNK_SIZE;

    current = { start: overlapFits ? previousUnitStart : unit.start, end: unit.end };
  }

  spans.push(current);

  return spans.map((span, index) => ({
    text: text.slice(span.start, span.end).trim(),
    index,
    metadata: {
      source,
      sourceVersion,
      specialty,
      evidenceLevel,
      cenario,
      redFlags,
      subtipo,
      charStart: span.start,
      charEnd: span.end,
    },
  }));
}
