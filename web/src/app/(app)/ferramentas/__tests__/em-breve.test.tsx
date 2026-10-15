import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import FerramentasPage from '../page';
import ToolComingSoonPage, { generateStaticParams } from '../[ferramenta]/page';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  usePathname: () => '/ferramentas/infusoes',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Com as 15 ferramentas do ANY integradas, nenhuma está "em breve". O
// catálogo de teste devolve Infusões e Via aérea a "em breve", como ficariam
// se a revisão clínica (CC-310) segurasse uma delas: o hub, os atalhos de
// outras ferramentas e o endereço direto não podem quebrar.
vi.mock('@clinical-tools/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clinical-tools/catalog')>();
  const pending = new Set(['infusoes', 'via-aerea']);
  return {
    ...actual,
    TOOLS: actual.TOOLS.map((tool) =>
      pending.has(tool.id) ? { ...tool, status: 'em-breve' as const } : tool,
    ),
  };
});

describe('/ferramentas/[ferramenta] — ferramenta ainda não portada', () => {
  it('pré-renderiza só as "em breve" (as portadas têm rota própria)', () => {
    const ids = generateStaticParams().map(({ ferramenta }) => ferramenta);
    expect(ids.sort()).toEqual(['infusoes', 'via-aerea']);
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
    expect(notFound).not.toHaveBeenCalled();
  });

  it('responde 404 para ferramenta que já abre ou fora do catálogo', async () => {
    await expect(
      ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'tep' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'nao-existe' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('/ferramentas — hub com ferramenta "em breve"', () => {
  it('lista a ferramenta não portada como "em breve", sem link nem favorito', () => {
    render(<FerramentasPage />);
    const airway = screen.getByRole('region', { name: 'Via aérea' });

    expect(within(airway).getByText('Intubação e via aérea difícil')).toBeInTheDocument();
    expect(within(airway).getByText('Em breve')).toBeInTheDocument();
    expect(within(airway).queryByRole('link')).not.toBeInTheDocument();
    expect(within(airway).queryByRole('button', { name: /Favoritar/ })).not.toBeInTheDocument();
  });
});
