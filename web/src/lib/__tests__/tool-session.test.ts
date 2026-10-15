import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  readToolSession,
  TOOL_SESSION_TTL_MS,
  useToolSession,
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
