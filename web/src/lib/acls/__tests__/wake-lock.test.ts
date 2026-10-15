import { describe, expect, it, vi } from 'vitest';
import { createScreenWakeLock, type WakeLockStatus } from '../wake-lock';

function fakeEnvironment(request: () => Promise<unknown>) {
  let visibility: DocumentVisibilityState = 'visible';
  const listeners = new Set<() => void>();
  const document = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  } as unknown as Document;
  const navigator = { wakeLock: { request: vi.fn(request) } } as unknown as Navigator;
  return {
    env: { document, navigator },
    request: (navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock
      .request,
    setVisibility(next: DocumentVisibilityState) {
      visibility = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

function fakeSentinel() {
  const releaseListeners: (() => void)[] = [];
  return {
    released: false,
    release: vi.fn(async function (this: { released: boolean }) {
      this.released = true;
    }),
    addEventListener: (_: string, listener: () => void) => releaseListeners.push(listener),
    fireRelease: () => releaseListeners.forEach((listener) => listener()),
  };
}

describe('createScreenWakeLock', () => {
  it('mantém a tela acesa e pede de novo quando a aba volta', async () => {
    const sentinels = [fakeSentinel(), fakeSentinel()];
    let call = 0;
    const environment = fakeEnvironment(async () => sentinels[call++]);
    const statuses: WakeLockStatus[] = [];
    const lock = createScreenWakeLock((status) => statuses.push(status), environment.env);

    lock.request();
    await vi.waitFor(() => expect(statuses).toEqual(['active']));

    // O navegador solta a trava quando a aba some…
    environment.setVisibility('hidden');
    sentinels[0]?.fireRelease();
    // …e ela volta quando a aba reaparece.
    environment.setVisibility('visible');
    await vi.waitFor(() => expect(environment.request).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('active'));

    lock.release();
    expect(sentinels[1]?.release).toHaveBeenCalled();
    expect(statuses.at(-1)).toBe('off');
    expect(environment.listeners.size).toBe(0);
  });

  it('sem suporte, avisa e segue sem erro', () => {
    const statuses: WakeLockStatus[] = [];
    const lock = createScreenWakeLock((status) => statuses.push(status), {
      navigator: {} as Navigator,
      document: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Document,
    });
    expect(() => lock.request()).not.toThrow();
    expect(statuses).toEqual(['unsupported']);
  });

  it('recusa do navegador vira "indisponível", sem quebrar', async () => {
    const environment = fakeEnvironment(async () => {
      throw new DOMException('negado', 'NotAllowedError');
    });
    const statuses: WakeLockStatus[] = [];
    createScreenWakeLock((status) => statuses.push(status), environment.env).request();
    await vi.waitFor(() => expect(statuses).toEqual(['unavailable']));
  });
});
