import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../page';
import CalculadorasPage from '../calculadoras/page';
import FerramentasLayout from '../layout';
import { CalculatorScreen } from '../_components/calculator-screen';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  usePathname: () => '/ferramentas',
  useRouter: () => ({ push: vi.fn() }),
}));

const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: (...args: unknown[]) => toastInfo(...args) },
}));

const FAVORITES_KEY = 'copiloto:ferramentas:favoritos';

describe('/ferramentas — flag (ADR-017)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockClear();
  });

  it('responde 404 com NEXT_PUBLIC_FERRAMENTAS desligada', () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', '');
    expect(() => FerramentasLayout({ children: 'conteúdo' })).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('abre com a flag em on', () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    expect(FerramentasLayout({ children: 'conteúdo' })).toBe('conteúdo');
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('/ferramentas — hub (CC-304)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    toastInfo.mockClear();
  });

  it('mostra o aviso fixo e os onze grupos', () => {
    render(<FerramentasPage />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    const groups = [
      'Calculadoras',
      'Ressuscitação',
      'Via aérea',
      'Choque e sepse',
      'Pediatria',
      'Toxicologia',
      'Metabólico',
      'Ventilação',
      'Sedação e dor',
      'Paliativos',
      'Infecciosas',
    ];
    for (const group of groups) {
      expect(screen.getByRole('region', { name: group })).toBeInTheDocument();
    }
  });

  it('abre a calculadora portada em um toque a partir do hub', () => {
    render(<FerramentasPage />);
    const calculators = screen.getByRole('region', { name: 'Calculadoras' });

    expect(within(calculators).getByRole('link', { name: /CHA2DS2-VASc/ })).toHaveAttribute(
      'href',
      '/ferramentas/calculadoras/chadsvasc',
    );
    expect(
      within(calculators).getByRole('link', { name: /Calculadoras clínicas/ }),
    ).toHaveAttribute('href', '/ferramentas/calculadoras');
  });

  it('abre a Emergência pediátrica a partir do grupo Pediatria (CC-319)', () => {
    render(<FerramentasPage />);
    const pediatrics = screen.getByRole('region', { name: 'Pediatria' });

    expect(within(pediatrics).getByRole('link', { name: /Emergência pediátrica/ })).toHaveAttribute(
      'href',
      '/ferramentas/pediatria',
    );
  });

  it("lista a ferramenta não portada como 'em breve', sem link nem favorito", () => {
    render(<FerramentasPage />);
    const resuscitation = screen.getByRole('region', { name: 'Ressuscitação' });

    expect(
      within(resuscitation).getByText('Parada cardiorrespiratória (ACLS)'),
    ).toBeInTheDocument();
    expect(within(resuscitation).getByText('Em breve')).toBeInTheDocument();
    expect(within(resuscitation).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(resuscitation).queryByRole('button', { name: /Favoritar/ }),
    ).not.toBeInTheDocument();
  });

  it('busca por sinônimo e sem acento', async () => {
    render(<FerramentasPage />);
    const search = screen.getByRole('searchbox', {
      name: 'Buscar ferramenta por nome ou sinônimo',
    });

    await userEvent.type(search, 'pneumonia');
    const results = screen.getByRole('region', { name: 'Resultados da busca' });
    expect(within(results).getByRole('link', { name: /CURB-65/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'ressuscitacao parada');
    expect(screen.getByText('Parada cardiorrespiratória (ACLS)')).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'xyzw');
    expect(screen.getByText('Nada encontrado para “xyzw”.')).toBeInTheDocument();
  });

  it('favorita no aparelho e mostra os favoritos no topo', async () => {
    render(<FerramentasPage />);
    expect(screen.queryByRole('region', { name: 'Favoritos' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Favoritar qSOFA' }));

    const favorites = screen.getByRole('region', { name: 'Favoritos' });
    expect(within(favorites).getByRole('link', { name: /qSOFA/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '[]')).toEqual(['calc:qsofa']);
    expect(
      within(favorites).getByRole('button', { name: 'Tirar qSOFA dos favoritos' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('avisa ao passar de 15 favoritos', async () => {
    const full = Array.from({ length: 15 }, (_, index) => `calc:c${index}`);
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(full));
    render(<FerramentasPage />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Favoritar qSOFA' })[0]!);

    expect(toastInfo).toHaveBeenCalledWith('Limite de 15 favoritos. Tire um para incluir outro.');
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '[]')).toEqual(full);
  });
});

describe('/ferramentas/calculadoras', () => {
  it('lista as 75 calculadoras por categoria, com as portadas abrindo', () => {
    render(<CalculadorasPage />);

    expect(screen.getAllByRole('region')).toHaveLength(16);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getAllByText('Em breve')).toHaveLength(70);
  });
});

describe('/ferramentas/calculadoras/[id]', () => {
  it('abre a calculadora portada com título e resultado ao vivo', () => {
    render(<CalculatorScreen id="qsofa" />);

    expect(screen.getByRole('heading', { level: 1, name: 'qSOFA' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Faltam 3 respostas');
  });

  it("mostra 'em breve' para a calculadora do catálogo ainda não portada", () => {
    render(<CalculatorScreen id="nihss" />);

    expect(screen.getByRole('heading', { level: 1, name: 'NIHSS' })).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver calculadoras disponíveis' })).toHaveAttribute(
      'href',
      '/ferramentas/calculadoras',
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
