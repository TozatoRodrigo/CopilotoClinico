import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { MAX_SIZE_BYTES, type AudioMimeType } from '../../src/modules/audio/schemas/audio.schemas';

/**
 * CC-205 — a pasta de ditados: `<id>.<áudio>` com a transcrição de
 * referência em `<id>.txt` ao lado. Formatos e tamanho máximo são os que a
 * API aceita (audio.schemas.ts): o teste não mede áudio que produção recusaria.
 */

export const AUDIO_MIME_BY_EXTENSION: Readonly<Record<string, AudioMimeType>> = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
};
const REFERENCE_EXTENSION = '.txt';
/** O id vai para o relatório e para o console: nada de nome de paciente, só "ditado-07". */
const ID_PATTERN = /^[\w-]+$/;

export interface AudioSample {
  id: string;
  audioPath: string;
  mimeType: AudioMimeType;
  sizeBytes: number;
  durationSec: number;
  /** Transcrição de referência: o que o médico leu, escrito como foi falado. */
  reference: string;
}

export type DurationProbe = (path: string) => Promise<number>;

/** Sem ffprobe nada se mede: para na hora, em vez de repetir o erro em cada arquivo. */
export class ProbeUnavailableError extends Error {}

export class DatasetError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Pasta de áudios com problema:\n- ${problems.join('\n- ')}`);
  }
}

interface Pair {
  audio: string[];
  reference: string | null;
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DatasetError([`a pasta ${dir} não existe (formato em docs/evals/transcricao.md)`]);
    }
    throw error;
  }
}

/** Lê e valida a pasta inteira antes de qualquer chamada paga; junta todos os problemas. */
export async function loadSamples(
  dir: string,
  probeDuration: DurationProbe,
): Promise<AudioSample[]> {
  const problems: string[] = [];
  const pairs = new Map<string, Pair>();
  const pairOf = (id: string): Pair => {
    const pair = pairs.get(id) ?? { audio: [], reference: null };
    pairs.set(id, pair);
    return pair;
  };

  for (const name of await listFiles(dir)) {
    const extension = extname(name).toLowerCase();
    const id = name.slice(0, name.length - extension.length);
    if (extension === REFERENCE_EXTENSION) pairOf(id).reference = name;
    else if (extension in AUDIO_MIME_BY_EXTENSION) pairOf(id).audio.push(name);
    else {
      const accepted = [...Object.keys(AUDIO_MIME_BY_EXTENSION), REFERENCE_EXTENSION].join(' ');
      problems.push(`${name}: formato não aceito (aceitos: ${accepted})`);
    }
  }

  const samples: AudioSample[] = [];
  for (const [id, pair] of [...pairs].sort(([left], [right]) => left.localeCompare(right))) {
    if (!ID_PATTERN.test(id)) {
      problems.push(`${id}: use só letras sem acento, números, "-" e "_" no nome`);
      continue;
    }
    const [audio, ...duplicates] = pair.audio;
    if (duplicates.length > 0) {
      problems.push(`${id}: mais de um áudio (${pair.audio.join(', ')})`);
      continue;
    }
    if (!audio) {
      problems.push(`${id}.txt sem áudio`);
      continue;
    }
    if (!pair.reference) {
      problems.push(`${audio} sem a referência ${id}.txt`);
      continue;
    }

    const audioPath = join(dir, audio);
    const reference = (await readFile(join(dir, pair.reference), 'utf8'))
      .replace(/^\uFEFF/, '')
      .trim();
    const { size } = await stat(audioPath);
    if (reference === '') problems.push(`${id}.txt vazio`);
    if (size === 0 || size > MAX_SIZE_BYTES) {
      problems.push(`${audio}: ${size} bytes (a API aceita de 1 byte a ${MAX_SIZE_BYTES})`);
    }
    if (reference === '' || size === 0 || size > MAX_SIZE_BYTES) continue;

    try {
      const durationSec = await probeDuration(audioPath);
      samples.push({
        id,
        audioPath,
        mimeType: AUDIO_MIME_BY_EXTENSION[extname(audio).toLowerCase()] as AudioMimeType,
        sizeBytes: size,
        durationSec,
        reference,
      });
    } catch (error) {
      if (error instanceof ProbeUnavailableError) throw error;
      problems.push(`${audio}: duração ilegível (${(error as Error).message})`);
    }
  }

  if (problems.length > 0) throw new DatasetError(problems);
  if (samples.length === 0) {
    throw new DatasetError([`nenhum par <id>.<áudio> + <id>.txt em ${dir}`]);
  }
  return samples;
}

/** Fim do último pacote de áudio, de `ffprobe -show_entries packet=pts_time,duration_time`. */
export function lastPacketEnd(csv: string): number {
  let end = 0;
  for (const line of csv.split('\n')) {
    const [pts, duration] = line.split(',').map((field) => Number.parseFloat(field));
    if (pts !== undefined && Number.isFinite(pts)) {
      end = Math.max(
        end,
        pts + (duration !== undefined && Number.isFinite(duration) ? duration : 0),
      );
    }
  }
  if (end <= 0) throw new Error('nenhum pacote de áudio');
  return end;
}

const execFileAsync = promisify(execFile);

/**
 * Duração em segundos pelo ffprobe (vem com o ffmpeg), ou pelo binário em
 * `FFPROBE_PATH`. Sem shell: o nome do arquivo nunca vira comando.
 */
export async function ffprobeDuration(path: string): Promise<number> {
  const binary = process.env.FFPROBE_PATH?.trim() || 'ffprobe';
  const probe = async (args: string[]): Promise<string> =>
    (await execFileAsync(binary, ['-v', 'error', ...args, path])).stdout;
  try {
    const fromHeader = Number.parseFloat(
      await probe([
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
      ]),
    );
    if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
    // O WebM do gravador do navegador (MediaRecorder) sai sem duração no
    // cabeçalho: soma pelos pacotes.
    return lastPacketEnd(
      await probe([
        '-select_streams',
        'a:0',
        '-show_entries',
        'packet=pts_time,duration_time',
        '-of',
        'csv=p=0',
      ]),
    );
  } catch (error) {
    // Não executou (ausente, sem permissão, arquitetura errada): nenhum arquivo vai medir.
    if ((error as NodeJS.ErrnoException).syscall?.startsWith('spawn')) {
      throw new ProbeUnavailableError(
        `não consegui executar ${binary} (${(error as Error).message}); instale o ffmpeg ` +
          '(brew install ffmpeg) ou aponte FFPROBE_PATH para um ffprobe que rode nesta máquina',
      );
    }
    throw error;
  }
}
