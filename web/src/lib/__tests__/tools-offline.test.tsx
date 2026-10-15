import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { staticReferences, toolRoutes } from '../../../scripts/generate-offline-manifest.mjs';
import { ToolsOfflineFooter } from '@/components/domain/clinical-tools/tools-offline-footer';
import { offlineMessage } from '@/components/providers/offline-provider';
import { nextToolsOfflineState, startToolsOfflineSync } from '../tools-offline';

vi.mock('next/navigation', () => ({ usePathname: () => '/ferramentas/acls' }));

describe('aviso sem conexão (CC-322)', () => {
  it('nas Ferramentas diz que elas funcionam e que a análise do caso espera', () => {
    expect(offlineMessage('/ferramentas')).toBe(
      'Sem conexão: ferramentas funcionam, análise do caso fica na fila.',
    );
    expect(offlineMessage('/ferramentas/infusoes')).toBe(
      'Sem conexão: ferramentas funcionam, análise do caso fica na fila.',
    );
  });

  it('fora delas mantém o aviso geral', () => {
    expect(offlineMessage('/dashboard')).toBe(
      'Sem conexão. Você pode continuar — tudo será enviado ao reconectar.',
    );
    expect(offlineMessage('/ferramentas-x')).not.toContain('ferramentas funcionam');
    expect(offlineMessage(null)).not.toContain('ferramentas funcionam');
  });
});

describe('lista de pré-cache gerada no build (CC-322)', () => {
  it('pega só as rotas das Ferramentas, em ordem', () => {
    expect(
      toolRoutes({
        routes: {
          '/dashboard': {},
          '/ferramentas/acls': {},
          '/ferramentas': {},
          '/ferramentasx': {},
        },
      }),
    ).toEqual(['/ferramentas', '/ferramentas/acls']);
    expect(toolRoutes({})).toEqual([]);
  });

  it('acha os arquivos estáticos citados no HTML, no payload RSC e no CSS', () => {
    const html =
      '<script src="/_next/static/chunks/a1.js" async></script>' +
      '<link rel="stylesheet" href="/_next/static/chunks/b2.css?dpl=1"/>' +
      'self.__next_f.push([1,"3:I[1,[\\"static/chunks/c3.js\\"],\\"default\\"]"])' +
      '"static/chunks/d4.js"';
    const css = '@font-face{src:url(/_next/static/media/f.woff2) format("woff2")}';
    expect(staticReferences(html).sort()).toEqual([
      '/_next/static/chunks/a1.js',
      '/_next/static/chunks/b2.css',
      '/_next/static/chunks/d4.js',
    ]);
    expect(staticReferences(css)).toEqual(['/_next/static/media/f.woff2']);
  });
});

describe('estado do pré-cache', () => {
  const initial = { status: 'verificando' as const, version: null, updated: false };

  it('marca "atualizado" quando a versão muda com a página aberta', () => {
    const first = nextToolsOfflineState(initial, {
      type: 'ferramentas-offline',
      status: 'pronto',
      version: 'v1',
    });
    expect(first).toEqual({ status: 'pronto', version: 'v1', updated: false });
    const second = nextToolsOfflineState(first, {
      type: 'ferramentas-offline',
      status: 'pronto',
      version: 'v2',
    });
    expect(second).toEqual({ status: 'pronto', version: 'v2', updated: true });
  });
});

describe('rodapé das Ferramentas e sincronização (CC-322)', () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const postMessage = vi.fn();

  beforeEach(() => {
    listeners.clear();
    postMessage.mockClear();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ active: { postMessage } }),
        addEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
          listeners.delete(listener),
        startMessages: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  function fromWorker(data: unknown) {
    act(() => listeners.forEach((listener) => listener(new MessageEvent('message', { data }))));
  }

  it('mostra a versão guardada no aparelho e oferece recarregar quando chega outra', async () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    render(<ToolsOfflineFooter />);
    await act(async () => {});
    expect(postMessage).toHaveBeenCalledWith({ type: 'ferramentas-status' });

    fromWorker({ type: 'ferramentas-offline', status: 'pronto', version: '8547edb05315' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disponível sem conexão · versão do conteúdo 8547edb05315',
    );

    fromWorker({ type: 'ferramentas-offline', status: 'baixando', version: '9a1b2c3d4e5f' });
    expect(screen.getByRole('status')).toHaveTextContent('Guardando as ferramentas no aparelho');
    fromWorker({ type: 'ferramentas-offline', status: 'pronto', version: '9a1b2c3d4e5f' });
    expect(screen.getByRole('status')).toHaveTextContent('versão do conteúdo 9a1b2c3d4e5f');
    await userEvent.click(screen.getByRole('button', { name: /Conteúdo atualizado/ }));
    expect(reload).toHaveBeenCalled();
  });

  it('pede a sincronização ao abrir e de novo quando o sinal volta', async () => {
    const stop = startToolsOfflineSync();
    await act(async () => {});
    expect(postMessage).toHaveBeenCalledWith({ type: 'ferramentas-sync' });
    postMessage.mockClear();

    window.dispatchEvent(new Event('online'));
    await act(async () => {});
    expect(postMessage).toHaveBeenCalledWith({ type: 'ferramentas-sync' });

    stop();
    postMessage.mockClear();
    window.dispatchEvent(new Event('online'));
    await act(async () => {});
    expect(postMessage).not.toHaveBeenCalled();
  });
});
