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

describe('chunkText', () => {
  it('returns single chunk for text under chunk size', () => {
    const text = 'Short clinical text.';
    const result = chunkText({ ...baseInput, text });

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
    expect(result[0]?.index).toBe(0);
  });

  it('returns multiple chunks for long text with overlap', () => {
    const text = 'A'.repeat(1200);
    const result = chunkText({ ...baseInput, text });

    expect(result.length).toBeGreaterThan(1);

    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      if (!prev || !curr) continue;
      const overlapStart = prev.metadata.charEnd - 50;
      expect(curr.metadata.charStart).toBe(overlapStart);
    }
  });

  it('returns empty array for empty text', () => {
    const result = chunkText({ ...baseInput, text: '' });

    expect(result).toEqual([]);
  });

  it('includes correct metadata on each chunk', () => {
    const text = 'B'.repeat(600);
    const result = chunkText({ ...baseInput, text });

    for (const chunk of result) {
      expect(chunk.metadata.source).toBe(baseInput.source);
      expect(chunk.metadata.sourceVersion).toBe(baseInput.sourceVersion);
      expect(chunk.metadata.specialty).toBe(baseInput.specialty);
      expect(chunk.metadata.evidenceLevel).toBe(baseInput.evidenceLevel);
      expect(chunk.metadata.cenario).toBe(baseInput.cenario);
      expect(chunk.metadata.redFlags).toEqual(baseInput.redFlags);
    }
  });

  it('tracks correct charStart and charEnd positions', () => {
    const text = 'C'.repeat(1100);
    const result = chunkText({ ...baseInput, text });

    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.metadata.charStart).toBe(0);
    expect(first!.metadata.charEnd).toBe(500);

    for (const chunk of result) {
      expect(chunk.metadata.charEnd - chunk.metadata.charStart).toBeLessThanOrEqual(500);
      expect(chunk.metadata.charStart).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.charEnd).toBeLessThanOrEqual(text.length);
    }
  });

  it('filters out whitespace-only chunks', () => {
    const text = 'A'.repeat(499) + '   ' + 'B'.repeat(10);
    const result = chunkText({ ...baseInput, text });

    for (const chunk of result) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('handles optional evidenceLevel being undefined', () => {
    const text = 'Some text here for testing.';
    const result = chunkText({ ...baseInput, text, evidenceLevel: undefined });

    expect(result).toHaveLength(1);
    expect(result[0]?.metadata.evidenceLevel).toBeUndefined();
  });
});
