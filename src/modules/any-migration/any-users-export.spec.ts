import { describe, expect, it } from 'vitest';
import {
  AnyExportFormatError,
  parseAnyUsersExport,
  parseCsv,
  parseExportTimestamp,
} from './any-users-export';

const HEADER = 'email,provedor,cadastro,ultimo_acesso';

describe('CC-335 — export de usuários do ANY', () => {
  it('lê o formato do Supabase (datas do Postgres, BOM, CRLF)', () => {
    const csv =
      `﻿${HEADER}\r\n` +
      ' Dra.Ana@Example.com ,google,2026-03-01 10:15:30.123456+00,2026-10-10 08:00:00+00\r\n' +
      'joao@hospital.org,azure,2026-04-02T09:00:00Z,\r\n';

    const { records, problems, hasFavoritesColumn } = parseAnyUsersExport(csv);

    expect(problems).toEqual([]);
    expect(hasFavoritesColumn).toBe(false);
    expect(records).toEqual([
      {
        line: 2,
        email: 'dra.ana@example.com',
        provider: 'google',
        signedUpAt: new Date('2026-03-01T10:15:30.123Z'),
        lastAccessAt: new Date('2026-10-10T08:00:00.000Z'),
        favorites: [],
        unknownFavorites: 0,
      },
      {
        line: 3,
        email: 'joao@hospital.org',
        provider: 'microsoft',
        signedUpAt: new Date('2026-04-02T09:00:00.000Z'),
        lastAccessAt: null,
        favorites: [],
        unknownFavorites: 0,
      },
    ]);
  });

  it('aponta a linha e o motivo do problema, sem o conteúdo', () => {
    const csv = [
      HEADER,
      'sem-arroba,google,2026-03-01,',
      'ana@example.com,github,2026-03-01,',
      'bia@example.com,google,2026-02-30,',
      'caio@example.com,google,2026-03-01,ontem',
      'duda@example.com,google',
      '=cmd@example.com,google,2026-03-01,',
      'eva@example.com,,2026-03-01,',
    ].join('\n');

    const { records, problems } = parseAnyUsersExport(csv);

    expect(problems).toEqual([
      { line: 2, reason: 'email_invalido' },
      { line: 3, reason: 'provedor_desconhecido' },
      { line: 4, reason: 'cadastro_invalido' },
      { line: 5, reason: 'ultimo_acesso_invalido' },
      { line: 6, reason: 'colunas_a_mais_ou_a_menos' },
      { line: 7, reason: 'email_invalido' },
    ]);
    expect(records.map(({ email, provider }) => ({ email, provider }))).toEqual([
      { email: 'eva@example.com', provider: 'desconhecido' },
    ]);
  });

  it('traduz a coluna de favoritos, quando existe', () => {
    const csv = [
      `${HEADER},favoritos`,
      'ana@example.com,google,2026-03-01,,"gcs|fórmula-winters,acls;xpto"',
    ].join('\n');

    const [record] = parseAnyUsersExport(csv).records;

    expect(record?.favorites).toEqual(['calc:gcs', 'calc:formula-winters', 'tool:acls']);
    expect(record?.unknownFavorites).toBe(1);
  });

  it('recusa o arquivo sem as colunas do formato', () => {
    expect(() =>
      parseAnyUsersExport('email,provider,created_at\nx@y.com,google,2026-01-01'),
    ).toThrow(AnyExportFormatError);
    expect(() => parseAnyUsersExport('')).toThrow(AnyExportFormatError);
  });

  it('CSV: aspas, vírgula e quebra de linha dentro do campo', () => {
    expect(parseCsv('a,"b, ""c""\nd",e\n\nf,g\n')).toEqual([
      { line: 1, fields: ['a', 'b, "c"\nd', 'e'] },
      { line: 4, fields: ['f', 'g'] },
    ]);
    expect(() => parseCsv('a,"b\n')).toThrow(AnyExportFormatError);
  });

  it('datas: Postgres, ISO e só o dia; recusa o que não existe', () => {
    expect(parseExportTimestamp('2026-08-23 14:22:01.5-03')).toEqual(
      new Date('2026-08-23T17:22:01.500Z'),
    );
    expect(parseExportTimestamp('2026-08-23T14:22+05:30')).toEqual(
      new Date('2026-08-23T08:52:00.000Z'),
    );
    expect(parseExportTimestamp('2026-08-23')).toEqual(new Date('2026-08-23T00:00:00.000Z'));
    for (const bad of ['2026-13-01', '2026-02-29 10:00', '23/08/2026', '2026-08-23 25:00']) {
      expect(parseExportTimestamp(bad)).toBeNull();
    }
  });
});
