import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_SIZE_BYTES } from '../../src/modules/audio/schemas/audio.schemas';
import { DatasetError, lastPacketEnd, loadSamples, ProbeUnavailableError } from './dataset';

const fixedDuration = async () => 42;

describe('loadSamples', () => {
  let dir: string;
  const put = (name: string, content: string | Buffer = 'x') =>
    writeFileSync(join(dir, name), content);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cc205-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('pairs each audio with its reference, sorted by id', async () => {
    put('ditado-02.m4a');
    put('ditado-02.txt', 'Adrenalina 1 mg.\n');
    put('ditado-01.webm');
    put('ditado-01.txt', '\uFEFF  PA 120 por 80  ');
    put('.DS_Store');

    const samples = await loadSamples(dir, fixedDuration);

    expect(samples).toEqual([
      {
        id: 'ditado-01',
        audioPath: join(dir, 'ditado-01.webm'),
        mimeType: 'audio/webm',
        sizeBytes: 1,
        durationSec: 42,
        reference: 'PA 120 por 80',
      },
      {
        id: 'ditado-02',
        audioPath: join(dir, 'ditado-02.m4a'),
        mimeType: 'audio/mp4',
        sizeBytes: 1,
        durationSec: 42,
        reference: 'Adrenalina 1 mg.',
      },
    ]);
  });

  it('reports every problem at once, before any paid call', async () => {
    put('sem-referencia.wav');
    put('sem-audio.txt', 'texto');
    put('vazio.wav');
    put('vazio.txt', '   ');
    put('dois.wav');
    put('dois.webm');
    put('dois.txt', 'texto');
    put('notas.docx');
    put('João Silva.wav');
    put('João Silva.txt', 'texto');
    put('grande.wav');
    truncateSync(join(dir, 'grande.wav'), MAX_SIZE_BYTES + 1);
    put('grande.txt', 'texto');

    const error = await loadSamples(dir, fixedDuration).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatasetError);
    const problems = (error as DatasetError).problems.join('\n');
    expect(problems).toContain('sem-referencia.wav sem a referência sem-referencia.txt');
    expect(problems).toContain('sem-audio.txt sem áudio');
    expect(problems).toContain('vazio.txt vazio');
    expect(problems).toContain('dois: mais de um áudio');
    expect(problems).toContain('notas.docx: formato não aceito');
    expect(problems).toContain('João Silva: use só letras sem acento');
    expect(problems).toContain(`grande.wav: ${MAX_SIZE_BYTES + 1} bytes`);
  });

  it('fails clearly on a missing or empty folder', async () => {
    await expect(loadSamples(join(dir, 'nao-existe'), fixedDuration)).rejects.toThrow(/não existe/);
    await expect(loadSamples(dir, fixedDuration)).rejects.toThrow(/nenhum par/);
  });

  it('turns an unreadable duration into a problem, but stops at once without ffprobe', async () => {
    put('a.wav');
    put('a.txt', 'texto');

    await expect(
      loadSamples(dir, () => Promise.reject(new Error('arquivo corrompido'))),
    ).rejects.toThrow(/a\.wav: duração ilegível \(arquivo corrompido\)/);
    await expect(
      loadSamples(dir, () => Promise.reject(new ProbeUnavailableError('ffprobe não encontrado'))),
    ).rejects.toBeInstanceOf(ProbeUnavailableError);
  });
});

describe('lastPacketEnd', () => {
  it('takes the end of the last packet (WebM from the browser has no duration header)', () => {
    expect(lastPacketEnd('0.000000,0.020000\n7.274000,0.020000\n7.294000,0.007000,\n')).toBeCloseTo(
      7.301,
    );
  });

  it('throws without packets', () => {
    expect(() => lastPacketEnd('')).toThrow(/nenhum pacote/);
  });
});
