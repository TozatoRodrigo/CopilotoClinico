import { beforeEach, describe, expect, it } from 'vitest';
import { aclsReducer, INITIAL_ACLS_STATE } from '@clinical-tools/acls/session';
import {
  ACLS_SESSION_KEY,
  ACLS_SESSION_MAX_AGE_MS,
  loadAclsSession,
  saveAclsSession,
} from '../session-storage';

const T0 = Date.UTC(2026, 9, 15, 17, 0, 0);
const running = aclsReducer(aclsReducer(INITIAL_ACLS_STATE, { type: 'start', at: T0 }), {
  type: 'select-rhythm',
  at: T0 + 5000,
  rhythm: 'shockable',
});

describe('parada guardada no aparelho', () => {
  beforeEach(() => window.localStorage.clear());

  it('volta igual depois de recarregar a aba', () => {
    saveAclsSession(running);
    expect(loadAclsSession(T0 + 60_000)).toEqual(running);
  });

  it('parada descartada sai do aparelho', () => {
    saveAclsSession(running);
    saveAclsSession(INITIAL_ACLS_STATE);
    expect(window.localStorage.getItem(ACLS_SESSION_KEY)).toBeNull();
  });

  it('parada esquecida há mais de 12 h não volta', () => {
    saveAclsSession(running);
    expect(loadAclsSession(T0 + ACLS_SESSION_MAX_AGE_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(ACLS_SESSION_KEY)).toBeNull();
  });

  it('conteúdo estranho é ignorado sem quebrar', () => {
    window.localStorage.setItem(ACLS_SESSION_KEY, '{"status":"running"');
    expect(loadAclsSession(T0)).toBeNull();
    window.localStorage.setItem(ACLS_SESSION_KEY, JSON.stringify({ status: 'running' }));
    expect(loadAclsSession(T0)).toBeNull();
  });
});
