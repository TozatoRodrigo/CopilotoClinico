import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  HACOR_SESSION_TTL_MS,
  readToolSession,
  readToolSessionEntry,
  ROTEIRO_SESSION_TTL_MS,
  TOOL_SESSION_TTL_MS,
  toolSessionTtl,
  useToolSession,
  useToolSessionReducer,
  useToolWeight,
  writeToolSession,
} from '../tool-session';

const KEY = 'copiloto:ferramentas:sessao:teste';
const asNumber = (value: unknown) => (typeof value === 'number' ? value : null);

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('readToolSession / writeToolSession', () => {
  it('lê o que foi escrito dentro da validade', () => {
    writeToolSession('teste', 42, 1_000);
    expect(readToolSession('teste', asNumber, 1_000 + TOOL_SESSION_TTL_MS)).toBe(42);
  });

  it('descarta o estado vencido ou com data no futuro', () => {
    writeToolSession('teste', 42, 1_000);
    expect(readToolSession('teste', asNumber, 1_000 + TOOL_SESSION_TTL_MS + 1)).toBeNull();
    expect(readToolSession('teste', asNumber, 999)).toBeNull();
  });

  it('descarta lixo e formato inesperado', () => {
    window.sessionStorage.setItem(KEY, '{');
    expect(readToolSession('teste', asNumber)).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ value: 1 }));
    expect(readToolSession('teste', asNumber)).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), value: 'x' }));
    expect(readToolSession('teste', asNumber)).toBeNull();
  });
});

describe('validade por chave', () => {
  it('roteiros de reavaliação horária valem 6 h, o HACOR 4 h e o resto 30 min', () => {
    expect(toolSessionTtl('choque-septico')).toBe(ROTEIRO_SESSION_TTL_MS);
    expect(toolSessionTtl('choque-indiferenciado')).toBe(ROTEIRO_SESSION_TTL_MS);
    expect(toolSessionTtl('cad-ehh')).toBe(ROTEIRO_SESSION_TTL_MS);
    expect(toolSessionTtl('vm-hacor')).toBe(HACOR_SESSION_TTL_MS);
    expect(toolSessionTtl('peso-adulto')).toBe(TOOL_SESSION_TTL_MS);
    expect(toolSessionTtl('via-aerea')).toBe(TOOL_SESSION_TTL_MS);
  });

  it('o roteiro do choque volta depois de 1 h; o peso, não', () => {
    writeToolSession('choque-septico', 3, 1_000);
    writeToolSession('peso-adulto', '70', 1_000);
    const anHourLater = 1_000 + 60 * 60 * 1000;
    expect(readToolSessionEntry('choque-septico', asNumber, anHourLater)).toEqual({
      value: 3,
      savedAt: 1_000,
    });
    expect(
      readToolSession('peso-adulto', (v) => (typeof v === 'string' ? v : null), anHourLater),
    ).toBeNull();
  });
});

describe('useToolSession', () => {
  it('começa do salvo e salva cada mudança', () => {
    writeToolSession('teste', 7);
    const { result } = renderHook(() => useToolSession('teste', asNumber, () => 0));
    expect(result.current[0]).toBe(7);
    act(() => result.current[1]((current) => current + 1));
    expect(readToolSession('teste', asNumber)).toBe(8);
  });
});

describe('useToolWeight', () => {
  it('é o mesmo peso para todas as ferramentas da aba', () => {
    const first = renderHook(() => useToolWeight());
    act(() => first.result.current[1]('72,5'));
    first.unmount();
    expect(renderHook(() => useToolWeight()).result.current[0]).toBe('72,5');
  });
});

describe('useToolSessionReducer', () => {
  const add = (state: number, action: number) => state + action;

  it('retoma o roteiro salvo, avisa quando ele foi gravado e salva cada ação', () => {
    writeToolSession('choque-septico', 5, Date.now() - 1_000);
    const { result } = renderHook(() => useToolSessionReducer('choque-septico', add, asNumber, 0));
    expect(result.current.state).toBe(5);
    expect(result.current.restoredAt).not.toBeNull();

    act(() => result.current.dispatch(2));
    expect(readToolSession('choque-septico', asNumber)).toBe(7);

    act(() => result.current.dismissRestored());
    expect(result.current.restoredAt).toBeNull();
  });

  it('começa do zero, sem aviso, quando não há nada salvo', () => {
    const { result } = renderHook(() => useToolSessionReducer('choque-septico', add, asNumber, 0));
    expect(result.current).toMatchObject({ state: 0, restoredAt: null });
  });
});
