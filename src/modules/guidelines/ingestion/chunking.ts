export interface ChunkInput {
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  cenario?: string;
  redFlags?: string[];
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
    charStart: number;
    charEnd: number;
  };
}

const CHUNK_SIZE = 500;
const OVERLAP = 50;

export function chunkText(input: ChunkInput): ChunkResult[] {
  const { text, source, sourceVersion, specialty, evidenceLevel, cenario, redFlags } = input;

  if (text.length === 0) {
    return [];
  }

  if (text.length <= CHUNK_SIZE) {
    return [
      {
        text,
        index: 0,
        metadata: {
          source,
          sourceVersion,
          specialty,
          evidenceLevel,
          cenario,
          redFlags,
          charStart: 0,
          charEnd: text.length,
        },
      },
    ];
  }

  const chunks: ChunkResult[] = [];
  let position = 0;
  let index = 0;

  while (position < text.length) {
    const end = Math.min(position + CHUNK_SIZE, text.length);
    const chunkText = text.slice(position, end);

    if (chunkText.trim().length > 0) {
      chunks.push({
        text: chunkText.trim(),
        index,
        metadata: {
          source,
          sourceVersion,
          specialty,
          evidenceLevel,
          cenario,
          redFlags,
          charStart: position,
          charEnd: end,
        },
      });
      index++;
    }

    position += CHUNK_SIZE - OVERLAP;
    if (position >= text.length) break;
    if (end >= text.length) break;
  }

  return chunks;
}
