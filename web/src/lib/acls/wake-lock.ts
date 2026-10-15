/**
 * Tela acesa durante a parada (CC-313), pela Screen Wake Lock API. O
 * navegador solta a trava quando a aba some (troca de app, tela bloqueada),
 * então ela é pedida de novo quando a aba volta. Sem suporte ou com recusa,
 * segue em silêncio: a tela só mostra um aviso para ajustar o bloqueio
 * automático do aparelho.
 */

export type WakeLockStatus = 'off' | 'active' | 'unsupported' | 'unavailable';

interface SentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<SentinelLike>;
}

export interface ScreenWakeLock {
  request(): void;
  release(): void;
}

export function createScreenWakeLock(
  onStatus: (status: WakeLockStatus) => void,
  env: { navigator?: Navigator; document?: Document } = {},
): ScreenWakeLock {
  const nav = env.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const doc = env.document ?? (typeof document === 'undefined' ? undefined : document);
  const api = (nav as (Navigator & { wakeLock?: WakeLockApi }) | undefined)?.wakeLock;

  let wanted = false;
  let sentinel: SentinelLike | null = null;

  async function acquire(): Promise<void> {
    if (!api) {
      onStatus('unsupported');
      return;
    }
    if (sentinel || doc?.visibilityState === 'hidden') return;
    try {
      const lock = await api.request('screen');
      if (!wanted) {
        void lock.release().catch(() => undefined);
        return;
      }
      sentinel = lock;
      onStatus('active');
      lock.addEventListener('release', () => {
        sentinel = null;
        if (wanted) onStatus('off');
      });
    } catch {
      // Recusado (economia de bateria, iframe, aba oculta): não é erro da parada.
      onStatus('unavailable');
    }
  }

  function onVisibility(): void {
    if (wanted && doc?.visibilityState === 'visible') void acquire();
  }

  return {
    request() {
      if (!wanted) doc?.addEventListener('visibilitychange', onVisibility);
      wanted = true;
      void acquire();
    },
    release() {
      wanted = false;
      doc?.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel;
      sentinel = null;
      if (lock) void lock.release().catch(() => undefined);
      onStatus('off');
    },
  };
}
