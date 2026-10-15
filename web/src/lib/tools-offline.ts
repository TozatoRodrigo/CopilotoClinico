'use client';

import { useEffect, useState } from 'react';

/**
 * CC-322 — conversa com o service worker sobre o pré-cache das Ferramentas
 * (public/sw.js). A página pede a sincronização ao abrir e ao voltar a ter
 * sinal; o service worker baixa a versão nova, se houver, e avisa.
 */

export type ToolsOfflineStatus = 'verificando' | 'baixando' | 'pronto' | 'incompleto' | 'ausente';

export interface ToolsOfflineState {
  status: ToolsOfflineStatus;
  /** Versão do conteúdo completo no aparelho (hash do build das Ferramentas). */
  version: string | null;
  /** A versão mudou com a página aberta (o cache foi atualizado ao voltar o sinal). */
  updated: boolean;
}

interface ToolsOfflineMessage {
  type: 'ferramentas-offline';
  status: Exclude<ToolsOfflineStatus, 'verificando'>;
  version?: string;
}

function isToolsOfflineMessage(data: unknown): data is ToolsOfflineMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'ferramentas-offline' &&
    typeof (data as { status?: unknown }).status === 'string'
  );
}

function hasServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function post(message: { type: 'ferramentas-sync' | 'ferramentas-status' }): void {
  if (!hasServiceWorker()) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage(message))
    .catch(() => {});
}

/** Pede ao service worker para baixar (ou atualizar) as Ferramentas. */
export function requestToolsSync(): void {
  post({ type: 'ferramentas-sync' });
}

/** Próximo estado a partir da mensagem do service worker. */
export function nextToolsOfflineState(
  current: ToolsOfflineState,
  message: ToolsOfflineMessage,
): ToolsOfflineState {
  // A versão mostrada é a do cache completo: a que está baixando ainda não vale.
  if (message.status !== 'pronto') return { ...current, status: message.status };
  const version = message.version ?? current.version;
  const updated =
    current.updated ||
    (current.version !== null && version !== null && version !== current.version);
  return { status: 'pronto', version, updated };
}

const INITIAL: ToolsOfflineState = { status: 'verificando', version: null, updated: false };

/** Estado do pré-cache, para o rodapé das Ferramentas. */
export function useToolsOffline(): ToolsOfflineState {
  const [state, setState] = useState<ToolsOfflineState>(INITIAL);

  useEffect(() => {
    if (!hasServiceWorker()) return;
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      if (isToolsOfflineMessage(event.data)) {
        const message = event.data;
        setState((current) => nextToolsOfflineState(current, message));
      }
    };
    container.addEventListener('message', onMessage);
    // Sem `onmessage`, a fila de mensagens só abre no fim do carregamento.
    container.startMessages();
    post({ type: 'ferramentas-status' });
    return () => container.removeEventListener('message', onMessage);
  }, []);

  return state;
}

/**
 * Liga a sincronização: ao abrir o app (qualquer tela, como pede o "aberto uma
 * vez com sinal") e a cada volta do sinal.
 */
export function startToolsOfflineSync(): () => void {
  requestToolsSync();
  window.addEventListener('online', requestToolsSync);
  return () => window.removeEventListener('online', requestToolsSync);
}
