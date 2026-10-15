import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ToolComingSoonPage, { generateStaticParams } from '../[ferramenta]/page';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  usePathname: () => '/ferramentas/infusoes',
}));

describe('/ferramentas/[ferramenta] — ferramenta ainda não portada', () => {
  it('pré-renderiza só as "em breve" (as portadas têm rota própria)', () => {
    const ids = generateStaticParams().map(({ ferramenta }) => ferramenta);
    expect(ids).toContain('infusoes');
    expect(ids).not.toContain('choque-septico');
    expect(ids).not.toContain('calculadoras');
  });

  it('mostra "em breve" no endereço dos atalhos (ex.: Infusões a partir do Choque)', async () => {
    render(await ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'infusoes' }) }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Infusões contínuas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver ferramentas disponíveis' })).toHaveAttribute(
      'href',
      '/ferramentas',
    );
  });

  it('responde 404 para ferramenta fora do catálogo', async () => {
    await expect(
      ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'nao-existe' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
