import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import ToolComingSoonPage from '../../[ferramenta]/page';
import TepPage from '../page';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  usePathname: () => '/ferramentas/tep',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

const user = userEvent.setup();
// O jsdom não implementa a rolagem; a Referência rola até a seção pedida.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

async function choose(name: string | RegExp) {
  await user.click(screen.getByRole('button', { name }));
}

/** Do passo 1 até a primeira pergunta da classificação, pelo caminho estável. */
async function toClassification() {
  await choose('Paciente hemodinamicamente estável');
  await user.click(screen.getByRole('radio', { name: 'Alta (> 6)' }));
  await choose('TEP confirmado → classificar');
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  notFound.mockClear();
});

describe('/ferramentas/tep — hub e busca (CC-318)', () => {
  it('sai de "em breve" e abre a partir do grupo Choque e sepse', () => {
    render(<FerramentasPage />);
    const group = screen.getByRole('region', { name: 'Choque e sepse' });
    expect(within(group).getByRole('link', { name: /Tromboembolismo pulmonar/ })).toHaveAttribute(
      'href',
      '/ferramentas/tep',
    );
  });

  it.each(['wells', 'hestia', 'embolia', 'alteplase'])(
    'a busca acha o TEP por "%s"',
    async (term) => {
      render(<FerramentasPage />);
      await user.type(screen.getByRole('searchbox'), term);
      const results = screen.getByRole('region', { name: 'Resultados da busca' });
      expect(
        within(results).getByRole('link', { name: /Tromboembolismo pulmonar/ }),
      ).toHaveAttribute('href', '/ferramentas/tep');
    },
  );
});

describe('/ferramentas/tep — roteiro', () => {
  it('mostra o aviso fixo, as três abas e começa pela estabilidade', () => {
    render(<TepPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tromboembolismo pulmonar' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('note')[0]).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Roteiro',
      'Calculadoras',
      'Referência',
    ]);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Estabilidade hemodinâmica' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('estável: Q1–Q4 levam à categoria D2R, com heparina e texto para o prontuário', async () => {
    render(<TepPage />);
    await toClassification();
    expect(screen.getByRole('heading', { level: 2, name: 'Classificação AHA/ACC' })).toHaveFocus();

    await choose(/^Sim — dispneia/);
    await choose('sPESI ≥ 1 (risco elevado)');
    await choose(/^Ambos/);
    await choose(/^Hipoperfusão ou disfunção orgânica/);
    await choose(/^Com hipoxemia/);

    const category = screen.getByRole('region', { name: 'Categoria D2R' });
    expect(category).toHaveTextContent('Pré-falência cardiopulmonar');
    expect(category).toHaveTextContent('Vasopressores (norepinefrina 1ª escolha)');
    expect(screen.getByText('HNF (preferível)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Protocolo de heparina \(HNF\)/ })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=heparina',
    );
    expect(screen.getByText('Red flags de deterioração')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar para o prontuário' })).toBeEnabled();
  });

  it('baixo risco passa pelo Hestia; o Hestia calculado decide o "Prosseguir"', async () => {
    render(<TepPage />);
    await toClassification();
    await choose(/^Sim — dispneia/);
    await choose('sPESI = 0 (baixo risco)');
    expect(screen.getByRole('heading', { name: /Hestia — elegibilidade/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Calcular Hestia' }));
    for (const group of screen
      .getAllByRole('group')
      .filter((node) => node.tagName === 'FIELDSET')) {
      await user.click(within(group).getByRole('radio', { name: 'Não' }));
    }
    expect(screen.getByRole('status')).toHaveTextContent('Hestia negativo');
    await choose(/Prosseguir — localização do trombo/);

    await choose('Subsegmentar isolado');
    await choose(/^Sem hipoxemia/);
    expect(screen.getByRole('region', { name: 'Categoria B1' })).toBeInTheDocument();
    expect(screen.getByText('TEP subsegmentar isolado')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Protocolo de heparina/ })).not.toBeInTheDocument();
  });

  it('o Wells calculado no passo 2 escolhe o nível sozinho', async () => {
    render(<TepPage />);
    await choose('Paciente hemodinamicamente estável');
    await user.click(screen.getByRole('button', { name: 'Calcular Wells' }));
    const fieldsets = screen.getAllByRole('group').filter((node) => node.tagName === 'FIELDSET');
    const wellsItems = fieldsets.filter((node) =>
      within(node).queryByRole('radio', { name: /^Sim/ }),
    );
    for (const [index, group] of wellsItems.entries()) {
      // Sinais de TVP (3) e hemoptise (1): 4 pontos, intermediária.
      const yes = index === 0 || index === 5;
      await user.click(within(group).getByRole('radio', { name: yes ? /^Sim/ : 'Não' }));
    }
    expect(screen.getByRole('radio', { name: 'Intermediária (2–6)' })).toBeChecked();
    expect(screen.getByText('Wells 2–6 — probabilidade intermediária.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Resultado do D-dímero:' })).toBeInTheDocument();
  });

  it('instável: eco, trombólise com dose reduzida e categoria E1R', async () => {
    render(<TepPage />);
    await choose('Instabilidade hemodinâmica (PAS < 90, choque, PCR)');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Protocolo de instabilidade hemodinâmica' }),
    ).toHaveFocus();
    expect(screen.getByRole('link', { name: /Calculadora de heparina/ })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=heparina',
    );
    expect(screen.getByRole('link', { name: /Calculadora de noradrenalina/ })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=noradrenalina',
    );

    await choose('Não');
    await choose('Sim — risco alto');
    expect(screen.getByText('Alteplase 50 mg IV em 2 h')).toBeInTheDocument();
    await choose('Reavaliar');
    await choose('Não');
    await choose('Não — risco padrão');
    expect(screen.getByText('Alteplase 100 mg IV em 2 h')).toBeInTheDocument();

    await choose('Hipotensão persistente → categoria E1');
    expect(screen.getByRole('region', { name: 'Categoria E1R' })).toHaveTextContent(
      'Terapia avançada recomendada',
    );
  });

  it('volta ao mesmo ponto depois de sair da tela (sessão da aba)', async () => {
    const first = render(<TepPage />);
    await toClassification();
    await choose(/^Sim — dispneia/);
    first.unmount();

    render(<TepPage />);
    expect(
      screen.getByRole('heading', { name: 'sPESI — estratificação de risco' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Classificação AHA/ACC' }),
    ).not.toHaveFocus();
  });

  it('"Ver contraindicações" abre a Referência na seção certa', async () => {
    render(<TepPage />);
    await choose('Instabilidade hemodinâmica (PAS < 90, choque, PCR)');
    await choose(/^Choque refratário/);
    await user.click(screen.getByRole('button', { name: 'Ver contraindicações' }));

    expect(screen.getByRole('tab', { name: 'Referência' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Sangramento ativo maior')).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.queryByText('Hemograma completo (atenção às plaquetas)')).not.toBeInTheDocument();
  });

  it('"Reiniciar roteiro" volta ao passo 1', async () => {
    render(<TepPage />);
    await choose('Instabilidade hemodinâmica (PAS < 90, choque, PCR)');
    await choose(/^Hipotensão transitória/);
    expect(screen.getByRole('region', { name: 'Categoria DR' })).toBeInTheDocument();
    await choose('Reiniciar roteiro');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Estabilidade hemodinâmica' }),
    ).toBeInTheDocument();
  });
});

describe('/ferramentas/tep — calculadoras e referência', () => {
  it('lista as nove calculadoras do ANY e abre cada uma com resultado ao vivo', async () => {
    render(<TepPage />);
    await user.click(screen.getByRole('tab', { name: 'Calculadoras' }));
    const names = [
      'PERC Rule',
      'Wells para TEP',
      'D-dímero ajustado por idade',
      'Algoritmo YEARS',
      'YEARS adaptado para gestantes',
      'sPESI (PESI simplificado)',
      'PESI (Pulmonary Embolism Severity Index)',
      'Escore de Bova',
      'Critérios de Hestia',
    ];
    for (const name of names) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }),
      ).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: /^D-dímero ajustado por idade/ }));
    await user.type(screen.getByRole('textbox', { name: 'Idade (anos)' }), '72');
    await user.type(screen.getByRole('textbox', { name: 'D-dímero (µg/L FEU)' }), '650');
    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('D-dímero negativo');
    expect(result).toHaveTextContent('720 µg/L FEU (idade 72 anos)');
  });

  it('a Referência tem as sete seções da referência rápida', async () => {
    render(<TepPage />);
    await user.click(screen.getByRole('tab', { name: 'Referência' }));
    for (const title of [
      'Laboratório pré-anticoagulação',
      'Contraindicações',
      'Eco à beira-leito — disfunção de VD',
      'Anticoagulação — esquemas e doses',
      'Trombólise sistêmica',
      'Suporte hemodinâmico no DE',
      'Filtro de veia cava inferior',
    ]) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false');
    }
  });
});

describe('/ferramentas/[ferramenta] — destino ainda "em breve"', () => {
  it('Infusões, ainda não portada nesta base, mostra "em breve" em vez de 404', async () => {
    render(await ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'infusoes' }) }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Infusões contínuas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('ferramenta que já abre ou id desconhecido vira 404', async () => {
    await expect(
      ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'tep' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      ToolComingSoonPage({ params: Promise.resolve({ ferramenta: 'xyz' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
