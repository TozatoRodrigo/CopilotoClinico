'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * Âncora do endereço sem o "#" ("bombas" em /tabelas#bombas). No servidor e
 * na hidratação é vazia; depois acompanha a navegação. Serve para abrir a aba
 * ou o antídoto que outra seção do roteiro linkou.
 */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => decodeURIComponent(window.location.hash.replace(/^#/, '')),
    () => '',
  );
}
