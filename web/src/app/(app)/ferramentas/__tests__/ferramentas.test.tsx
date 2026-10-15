import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CALCULATORS } from '@clinical-tools/registry';
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
  useSearchParams: () => new URLSearchParams(),
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
    render(FerramentasLayout({ children: 'conteúdo' }));
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
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

  it('abre Infusões contínuas a partir do hub e da busca por droga (CC-311)', async () => {
    render(<FerramentasPage />);
    const calculators = screen.getByRole('region', { name: 'Calculadoras' });
    expect(within(calculators).getByRole('link', { name: /Infusões contínuas/ })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes',
    );

    await userEvent.type(screen.getByRole('searchbox'), 'precedex');
    const results = screen.getByRole('region', { name: 'Resultados da busca' });
    expect(within(results).getByRole('link', { name: /Infusões contínuas/ })).toBeInTheDocument();
  });

  it('abre a Emergência pediátrica a partir do grupo Pediatria (CC-319)', () => {
    render(<FerramentasPage />);
    const pediatrics = screen.getByRole('region', { name: 'Pediatria' });

    expect(within(pediatrics).getByRole('link', { name: /Emergência pediátrica/ })).toHaveAttribute(
      'href',
      '/ferramentas/pediatria',
    );
  });

  it('com as ferramentas do ANY integradas, todas abrem do hub e nenhuma fica "em breve"', () => {
    render(<FerramentasPage />);
    // O "em breve" do hub tem teste próprio, com catálogo de teste (em-breve.test.tsx).
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument();
    const airway = screen.getByRole('region', { name: 'Via aérea' });
    expect(
      within(airway).getByRole('link', { name: /Intubação e via aérea difícil/ }),
    ).toHaveAttribute('href', '/ferramentas/via-aerea');
  });

  it('abre o ACLS em um toque a partir do hub (CC-313)', () => {
    render(<FerramentasPage />);
    const resuscitation = screen.getByRole('region', { name: 'Ressuscitação' });

    expect(
      within(resuscitation).getByRole('link', { name: /Parada cardiorrespiratória \(ACLS\)/ }),
    ).toHaveAttribute('href', '/ferramentas/acls');
    expect(within(resuscitation).queryByText('Em breve')).not.toBeInTheDocument();
    expect(
      within(resuscitation).getByRole('button', {
        name: 'Favoritar Parada cardiorrespiratória (ACLS)',
      }),
    ).toBeInTheDocument();
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
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mostra as calculadoras favoritas no topo, sem as ferramentas favoritas do hub', () => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(['calc:qsofa', 'tool:calculadoras']));
    render(<CalculadorasPage />);

    const favorites = screen.getByRole('region', { name: 'Favoritas' });
    expect(within(favorites).getAllByRole('link')).toHaveLength(1);
    expect(within(favorites).getByRole('link', { name: /qSOFA/ })).toHaveAttribute(
      'href',
      '/ferramentas/calculadoras/qsofa',
    );
  });

  it('lista as 75 calculadoras por categoria, com as portadas abrindo', () => {
    render(<CalculadorasPage />);

    expect(screen.getAllByRole('region')).toHaveLength(16);
    expect(screen.getAllByRole('link')).toHaveLength(CALCULATORS.length);
    expect(screen.queryAllByText('Em breve')).toHaveLength(75 - CALCULATORS.length);
  });
});

describe('/ferramentas/calculadoras/[id]', () => {
  it('abre a calculadora portada com título e resultado ao vivo', () => {
    render(<CalculatorScreen id="qsofa" />);

    expect(screen.getByRole('heading', { level: 1, name: 'qSOFA' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Faltam 3 respostas');
  });

  it.each([
    ['grace-score', 'Versão aproximada'],
    ['apache-ii', 'Versão simplificada'],
  ])('%s mostra o aviso de versão acima dos campos (CC-307)', (id, title) => {
    render(<CalculatorScreen id={id} />);

    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('CIWA-Ar abre no roteiro de Toxicologia, que já está no ar (CC-306, CC-323)', () => {
    render(<CalculatorScreen id="ciwa-ar" />);

    expect(screen.getByRole('heading', { level: 1, name: 'CIWA-Ar' })).toBeInTheDocument();
    // CC-331: o roteiro oferece a volta para a calculadora (`?de=`).
    expect(
      screen.getByRole('link', { name: 'Abrir no roteiro: Intoxicações e antídotos' }),
    ).toHaveAttribute('href', '/ferramentas/toxicologia?de=calculadoras/ciwa-ar');
  });

  it('VTI abre o choque indiferenciado na aba VTI (CC-306, CC-331)', () => {
    render(<CalculatorScreen id="vti-classificacao" />);

    expect(
      screen.getByRole('link', { name: 'Abrir no roteiro: Choque indiferenciado' }),
    ).toHaveAttribute(
      'href',
      '/ferramentas/choque-indiferenciado?aba=vti&de=calculadoras/vti-classificacao',
    );
  });

  it('CAM-ICU mostra a faixa como resultado, sem número', async () => {
    render(<CalculatorScreen id="cam-icu" />);
    for (const legend of [/^Feature 1/, /^Feature 2/, /^Feature 3/, /^Feature 4/]) {
      const group = screen.getByRole('group', { name: legend });
      await userEvent.click(within(group).getByRole('radio', { name: /^Presente/ }));
    }

    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('CAM-ICU positivo — delirium presente');
    expect(result).not.toHaveTextContent('pontos');
  });

  it('DPP: data que não existe marca o campo e não calcula; data válida mostra a DPP', async () => {
    render(<CalculatorScreen id="dpp-dum" />);
    const day = screen.getByRole('textbox', { name: 'Dia da DUM' });
    await userEvent.type(day, '31');
    await userEvent.type(screen.getByRole('textbox', { name: 'Mês da DUM' }), '2');
    await userEvent.type(screen.getByRole('textbox', { name: 'Ano da DUM' }), '2026');

    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('A data 31/02/2026 não existe. Confira o dia e o mês.');
    expect(day).toBeInvalid();

    await userEvent.clear(day);
    await userEvent.type(day, '7');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Mês da DUM' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Mês da DUM' }), '1');
    expect(result).toHaveTextContent('14/10/2026');
    expect(result).toHaveTextContent('Data provável do parto (Naegele)');
  });
});
