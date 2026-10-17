'use client';

import { useEffect, useState } from 'react';

/**
 * CC-404, critério 3 — "guarda o tempo gasto". A revisão acontece entre um
 * paciente e outro: o médico bloqueia o celular ou troca de app no meio do
 * cartão. Só conta o tempo com a tela visível — o que interessa é quanto a
 * revisão custa, não quanto tempo o cartão ficou aberto.
 */

/** Mesmo teto da API (`MAX_REVIEW_DURATION_MS`): acima disso não é tempo de revisão. */
export const MAX_REVIEW_DURATION_MS = 60 * 60 * 1000;

export interface VisibleTimer {
  pause(): void;
  resume(): void;
  /** Milissegundos visíveis, inteiros e limitados ao teto da API. */
  elapsedMs(): number;
}

export function createVisibleTimer(now: () => number, startVisible: boolean): VisibleTimer {
  let accumulated = 0;
  let visibleSince: number | null = startVisible ? now() : null;
  return {
    pause() {
      if (visibleSince === null) return;
      accumulated += now() - visibleSince;
      visibleSince = null;
    },
    resume() {
      if (visibleSince === null) visibleSince = now();
    },
    elapsedMs() {
      const running = visibleSince === null ? 0 : now() - visibleSince;
      return Math.min(Math.round(accumulated + running), MAX_REVIEW_DURATION_MS);
    },
  };
}

/** Relógio monotônico da revisão; os testes trocam `now` para controlar o tempo. */
export const reviewClock = { now: (): number => performance.now() };

/** Cronômetro de um cartão: começa ao montar, pausa com a aba escondida. */
export function useReviewTimer(): VisibleTimer {
  const [timer] = useState(() =>
    createVisibleTimer(
      () => reviewClock.now(),
      typeof document === 'undefined' || document.visibilityState === 'visible',
    ),
  );

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') timer.resume();
      else timer.pause();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [timer]);

  return timer;
}

/** "1:05", "12:40" — o tempo no cartão, para o revisor se situar. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
