import { describe, expect, it } from 'vitest';
import { parseDraftCli } from './draft-cli';

const CHUNK_A = '11111111-1111-4111-8111-111111111111';
const CHUNK_B = '22222222-2222-4222-8222-222222222222';

function files(contents: Record<string, string>) {
  return (path: string) => {
    const content = contents[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };
}

describe('parseDraftCli', () => {
  it('lê um tema da linha de comando, em revisão por padrão', () => {
    expect(
      parseDraftCli([
        '--topic',
        'Meningite bacteriana',
        '--syndrome',
        'febre',
        '--chunks',
        `${CHUNK_A}, ${CHUNK_B}`,
      ]),
    ).toEqual({
      kind: 'run',
      requests: [
        {
          topic: 'Meningite bacteriana',
          syndrome: 'febre',
          chunkIds: [CHUNK_A, CHUNK_B],
          submitForReview: true,
        },
      ],
    });
  });

  it('lê a lista priorizada do arquivo e respeita --draft-only', () => {
    const result = parseDraftCli(
      ['--topics-file', 'temas.json', '--draft-only'],
      files({ 'temas.json': JSON.stringify([{ topic: 'Anafilaxia' }, { topic: 'Sepse' }]) }),
    );

    expect(result).toEqual({
      kind: 'run',
      requests: [
        { topic: 'Anafilaxia', submitForReview: false },
        { topic: 'Sepse', submitForReview: false },
      ],
    });
  });

  it('mostra a ajuda', () => {
    expect(parseDraftCli(['--help'])).toEqual({ kind: 'help' });
  });

  it.each([
    [[], 'informe --topic ou --topics-file'],
    [['--topic', 'A', '--topics-file', 'x.json'], 'use --topic ou --topics-file, não os dois'],
    [['--topic', 'Meningite', '--syndrome', 'meningite'], /tema 1: syndrome/],
    [['--topic', 'Meningite', '--chunks', 'abc'], /tema 1: chunkIds\.0/],
    [['--opcao-que-nao-existe'], /Unknown option/],
  ])('recusa %j', (argv, message) => {
    const result = parseDraftCli(argv);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    if (typeof message === 'string') expect(result.message).toBe(message);
    else expect(result.message).toMatch(message);
  });

  it('recusa arquivo que não é lista, JSON inválido e arquivo inexistente', () => {
    const read = files({ 'objeto.json': '{"topic":"x"}', 'quebrado.json': '[' });

    expect(parseDraftCli(['--topics-file', 'objeto.json'], read)).toEqual({
      kind: 'error',
      message: 'objeto.json: esperava uma lista',
    });
    expect(parseDraftCli(['--topics-file', 'quebrado.json'], read).kind).toBe('error');
    expect(parseDraftCli(['--topics-file', 'nao-existe.json'], read)).toEqual({
      kind: 'error',
      message: 'nao-existe.json: ENOENT: nao-existe.json',
    });
  });

  it('recusa lista vazia', () => {
    expect(parseDraftCli(['--topics-file', 'vazio.json'], files({ 'vazio.json': '[]' }))).toEqual({
      kind: 'error',
      message: 'nenhum tema',
    });
  });
});
