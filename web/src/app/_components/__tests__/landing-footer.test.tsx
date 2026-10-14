import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { LandingFooter } from '../landing-footer';

type ObserverCallback = (entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>) => void;

/** IntersectionObserver controlável: o teste decide quando a gravura entra/sai da tela. */
function mockIntersectionObserver() {
  const observers: ObserverCallback[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  return (isIntersecting: boolean) => act(() => observers.forEach((notify) => notify([{ isIntersecting }])));
}

function scene(container: HTMLElement) {
  const svg = container.querySelector('footer > svg');
  if (!svg) throw new Error('gravura não renderizada');
  return svg;
}

describe('LandingFooter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leva às seções da landing e às páginas públicas', () => {
    render(<LandingFooter />);

    const nav = screen.getByRole('navigation', { name: 'Rodapé' });
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')]);
    expect(links).toEqual([
      ['Como funciona', '#como-funciona'],
      ['Segurança', '#confianca'],
      ['Privacidade', '/privacidade'],
      ['Contato', '/privacidade#contato'],
      ['Entrar', '/login'],
      ['Criar conta', '/register'],
    ]);
  });

  it('mostra a marca, a tagline e o copyright do ano corrente', () => {
    render(<LandingFooter />);

    expect(screen.getByRole('link', { name: 'copiloto clínico' })).toHaveAttribute('href', '/');
    expect(screen.getByText(/Da chegada do paciente ao documento assinado/)).toBeInTheDocument();
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Strivium · A conduta é sempre do médico.`),
    ).toBeInTheDocument();
  });

  it('a gravura é decorativa e pausa a animação fora da tela', () => {
    const setVisible = mockIntersectionObserver();
    const { container } = render(<LandingFooter />);
    const svg = scene(container);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('data-offscreen');

    setVisible(false);
    expect(svg).toHaveAttribute('data-offscreen', 'true');

    setVisible(true);
    expect(svg).not.toHaveAttribute('data-offscreen');
  });

  it('sem IntersectionObserver, a gravura segue animando', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<LandingFooter />);

    expect(scene(container)).not.toHaveAttribute('data-offscreen');
  });
});
