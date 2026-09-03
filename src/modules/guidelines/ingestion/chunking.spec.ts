import { describe, it, expect } from 'vitest';
import { chunkText, type ChunkInput } from './chunking';

const baseInput: Omit<ChunkInput, 'text'> = {
  source: 'WHO Hypertension Guidelines',
  sourceVersion: '2023.1',
  specialty: 'cardiology',
  evidenceLevel: 'A',
  cenario: 'crise_hipertensiva',
  redFlags: ['dor toracica', 'deficit neurologico focal'],
};

const MAX_CHUNK_SIZE = 1500;

function sentence(word: string, length: number): string {
  const body = `${word} `.repeat(Math.ceil(length / (word.length + 1))).slice(0, length - 1);
  return `${body.trim()}.`;
}

describe('chunkText', () => {
  it('returns single chunk for text under chunk size', () => {
    const text = 'Short clinical text.';
    const result = chunkText({ ...baseInput, text });

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
    expect(result[0]?.index).toBe(0);
  });

  it('returns empty array for empty text', () => {
    expect(chunkText({ ...baseInput, text: '' })).toEqual([]);
    expect(chunkText({ ...baseInput, text: '   \n\n  ' })).toEqual([]);
  });

  it('includes correct metadata on each chunk', () => {
    const text = [sentence('Alfa', 700), sentence('Beta', 700), sentence('Gama', 700)].join(' ');
    const result = chunkText({ ...baseInput, text });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.source).toBe(baseInput.source);
      expect(chunk.metadata.sourceVersion).toBe(baseInput.sourceVersion);
      expect(chunk.metadata.specialty).toBe(baseInput.specialty);
      expect(chunk.metadata.evidenceLevel).toBe(baseInput.evidenceLevel);
      expect(chunk.metadata.cenario).toBe(baseInput.cenario);
      expect(chunk.metadata.redFlags).toEqual(baseInput.redFlags);
    }
  });

  it('tracks charStart/charEnd that map back to the source text', () => {
    const text = [sentence('Alfa', 700), sentence('Beta', 700), sentence('Gama', 700)].join(' ');
    const result = chunkText({ ...baseInput, text });

    expect(result[0]!.metadata.charStart).toBe(0);
    for (const chunk of result) {
      expect(chunk.metadata.charStart).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.charEnd).toBeLessThanOrEqual(text.length);
      expect(text.slice(chunk.metadata.charStart, chunk.metadata.charEnd).trim()).toBe(chunk.text);
    }
  });

  it('never exceeds the hard chunk-size ceiling', () => {
    const text = Array.from({ length: 12 }, (_, i) => sentence(`Frase${i}`, 400)).join(' ');
    const result = chunkText({ ...baseInput, text });

    for (const chunk of result) {
      expect(chunk.metadata.charEnd - chunk.metadata.charStart).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
    }
  });

  /**
   * KB-005/KB-006 — a razão de existir deste chunking. O fatiamento anterior
   * cortava em 500 caracteres fixos, então uma prescrição podia ser partida
   * ao meio e um chunk podia começar no meio de uma frase, chegando ao prompt
   * como evidência truncada e sem sujeito.
   */
  it('não corta uma prescrição no meio: cada chunk começa em início de frase', () => {
    const dose = 'Reposição volêmica: 10 mL/kg de soro fisiológico a 0,9% na primeira hora.';
    const text = [
      sentence('Contexto', 600),
      dose,
      sentence('Sequencia', 600),
      sentence('Encerramento', 600),
    ].join(' ');

    const result = chunkText({ ...baseInput, text });

    // A frase da dose aparece inteira em algum chunk, nunca partida.
    expect(result.some((chunk) => chunk.text.includes(dose))).toBe(true);

    // Nenhum chunk começa no meio de uma frase (minúscula ou sinal de
    // pontuação como primeiro caractere seria resquício de corte cego).
    for (const chunk of result) {
      expect(chunk.text[0]).toMatch(/[A-ZÀ-ÖØ-Þ0-9]/);
    }
  });

  it('mantém parágrafos curtos agrupados em vez de gerar chunks minúsculos', () => {
    const text = ['Parágrafo um.', 'Parágrafo dois.', 'Parágrafo três.'].join('\n\n');
    const result = chunkText({ ...baseInput, text });

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('Parágrafo um.');
    expect(result[0]!.text).toContain('Parágrafo três.');
  });

  it('parte no meio da frase apenas quando uma única frase excede o teto', () => {
    const text = sentence('Palavra', 3200);
    const result = chunkText({ ...baseInput, text });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.charEnd - chunk.metadata.charStart).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
    }
  });

  it('filters out whitespace-only chunks', () => {
    const text = `${sentence('Alfa', 700)}   \n\n   ${sentence('Beta', 700)}`;
    const result = chunkText({ ...baseInput, text });

    for (const chunk of result) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('S21-CLIN-01: propagates subtipo into chunk metadata when present (required for the diagnostic-coherence guardrail to see it after ingestion)', () => {
    const text = [sentence('Alfa', 700), sentence('Beta', 700)].join(' ');
    const result = chunkText({ ...baseInput, text, subtipo: 'hemorragico' });

    for (const chunk of result) {
      expect(chunk.metadata.subtipo).toBe('hemorragico');
    }
  });

  it('handles optional evidenceLevel being undefined', () => {
    const text = 'Some text here for testing.';
    const result = chunkText({ ...baseInput, text, evidenceLevel: undefined });

    expect(result).toHaveLength(1);
    expect(result[0]?.metadata.evidenceLevel).toBeUndefined();
  });
});
