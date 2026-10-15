import { beforeEach, describe, expect, it } from 'vitest';
import { aclsReducer, INITIAL_ACLS_STATE, type AclsAction } from '@clinical-tools/acls/session';
import {
  ACLS_HISTORY_KEY,
  clearAclsHistory,
  deleteAclsRecord,
  readAclsHistory,
  saveAclsRecord,
} from '../history-storage';

const T0 = new Date(2026, 9, 15, 14, 30, 0).getTime();
const actions: AclsAction[] = [
  { type: 'start', at: T0 },
  { type: 'select-rhythm', at: T0 + 5_000, rhythm: 'nonshockable' },
  { type: 'complete-cycle', at: T0 + 125_000 },
  { type: 'check-rhythm', at: T0 + 130_000, result: 'rosc' },
];
const finished = actions.reduce(aclsReducer, INITIAL_ACLS_STATE);

describe('histórico de paradas no aparelho (CC-314)', () => {
  beforeEach(() => window.localStorage.clear());

  it('guarda a parada encerrada com número sequencial', () => {
    const first = saveAclsRecord(finished);
    const second = saveAclsRecord(finished);
    expect(first?.number).toBe(1);
    expect(second?.number).toBe(2);
    expect(readAclsHistory().map(({ number }) => number)).toEqual([1, 2]);
    expect(first?.report).toContain('Atendimento #1');
  });

  it('não guarda parada em curso', () => {
    expect(saveAclsRecord(actions.slice(0, 2).reduce(aclsReducer, INITIAL_ACLS_STATE))).toBeNull();
    expect(readAclsHistory()).toEqual([]);
  });

  it('apaga um registro ou todos', () => {
    const first = saveAclsRecord(finished);
    saveAclsRecord(finished);
    expect(deleteAclsRecord(first?.id ?? '').map(({ number }) => number)).toEqual([2]);
    clearAclsHistory();
    expect(window.localStorage.getItem(ACLS_HISTORY_KEY)).toBeNull();
  });

  it('ignora conteúdo estranho sem quebrar', () => {
    window.localStorage.setItem(ACLS_HISTORY_KEY, 'não é json');
    expect(readAclsHistory()).toEqual([]);
    expect(saveAclsRecord(finished)?.number).toBe(1);
  });
});
