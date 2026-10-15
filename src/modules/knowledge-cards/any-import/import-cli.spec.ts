import { describe, expect, it } from 'vitest';
import { parseImportCli, parseReviewerCrm } from './import-cli';

describe('parseImportCli (CC-405)', () => {
  it('sem argumentos importa todas as ferramentas', () => {
    expect(parseImportCli([])).toEqual({
      kind: 'run',
      toolId: null,
      dryRun: false,
      print: false,
      reviewerCrm: null,
    });
  });

  it('--tool, --dry-run, --print e --reviewer-crm', () => {
    expect(
      parseImportCli([
        '--tool',
        'pediatria',
        '--dry-run',
        '--print',
        '--reviewer-crm',
        'sp-123456',
      ]),
    ).toEqual({
      kind: 'run',
      toolId: 'pediatria',
      dryRun: true,
      print: true,
      reviewerCrm: { uf: 'SP', number: '123456' },
    });
  });

  it('recusa ferramenta desconhecida, CRM ilegível e --print sem --dry-run', () => {
    expect(parseImportCli(['--tool', 'tep'])).toMatchObject({ kind: 'error' });
    expect(parseImportCli(['--reviewer-crm', 'abc'])).toMatchObject({ kind: 'error' });
    expect(parseImportCli(['--print'])).toMatchObject({ kind: 'error' });
    expect(parseImportCli(['--desconhecido'])).toMatchObject({ kind: 'error' });
    expect(parseImportCli(['--help'])).toEqual({ kind: 'help' });
  });

  it('CRM em qualquer ordem', () => {
    expect(parseReviewerCrm('123456/SP')).toEqual({ uf: 'SP', number: '123456' });
    expect(parseReviewerCrm('MG 98765')).toEqual({ uf: 'MG', number: '98765' });
  });
});
