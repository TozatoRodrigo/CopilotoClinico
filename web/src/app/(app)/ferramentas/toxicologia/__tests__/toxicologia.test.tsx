import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import ToxicologiaPage from '../page';
import ToxindromesPage from '../toxindromes/page';
import DescontaminacaoPage from '../descontaminacao/page';
import DestinoPage from '../destino/page';
import AntidotosPage from '../antidotos/page';
import ChecklistPage from '../checklist/page';
import TabelasPage from '../tabelas/page';
import DosesToxicasPage from '../doses-toxicas/page';
import { RouteBreadcrumbs } from '@/components/layout/route-breadcrumbs';

let pathname = '/ferramentas/toxicologia';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  window.localStorage.clear();
});

describe('/ferramentas — Toxicologia no hub (CC-323)', () => {
  it('abre o roteiro em um toque, sem "em breve"', () => {
    render(<FerramentasPage />);
    const tox = screen.getByRole('region', { name: 'Toxicologia' });

    expect(within(tox).getByRole('link', { name: /Intoxicações e antídotos/ })).toHaveAttribute(
      'href',
      '/ferramentas/toxicologia',
    );
    expect(within(tox).queryByText('Em breve')).not.toBeInTheDocument();
  });
});

describe('/ferramentas/toxicologia', () => {
  it('liga para o Disque-Intoxicação e para o CIATox de Goiás com os números do ANY', () => {
    render(<ToxicologiaPage />);

    expect(screen.getByRole('link', { name: /0800 722 6001/ })).toHaveAttribute(
      'href',
      'tel:08007226001',
    );
    expect(screen.getByRole('link', { name: /0800 646 4350/ })).toHaveAttribute(
      'href',
      'tel:08006464350',
    );
  });

  it('lista as sete seções e as calculadoras de toxicologia', () => {
    render(<ToxicologiaPage />);
    const sections = screen.getByRole('region', { name: 'Seções' });

    expect(
      within(sections)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/ferramentas/toxicologia/toxindromes',
      '/ferramentas/toxicologia/descontaminacao',
      '/ferramentas/toxicologia/destino',
      '/ferramentas/toxicologia/antidotos',
      '/ferramentas/toxicologia/checklist',
      '/ferramentas/toxicologia/tabelas',
      '/ferramentas/toxicologia/doses-toxicas',
    ]);
    const calculators = screen.getByRole('region', { name: /Calculadoras de toxicologia/ });
    expect(within(calculators).getByRole('link', { name: /CIWA-Ar/ })).toHaveAttribute(
      'href',
      '/ferramentas/calculadoras/ciwa-ar',
    );
  });
});

describe('identificar toxíndrome', () => {
  it('rebaixado + miose puntiforme + depressão respiratória → opioide e o próximo passo', async () => {
    render(<ToxindromesPage />);

    expect(screen.getByText('Pergunta 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rebaixado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Miose puntiforme' }));
    expect(screen.getByText('Pergunta 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sim' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Opioide' })).toBeInTheDocument();
    expect(screen.getByText('Considere NALOXONA — Disponível')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver antídotos e doses' })).toHaveAttribute(
      'href',
      '/ferramentas/toxicologia/antidotos',
    );
    expect(screen.getByRole('button', { name: 'Copiar para o prontuário' })).toBeEnabled();
  });

  it('volta uma pergunta e recomeça', async () => {
    render(<ToxindromesPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Normal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Não, paciente estável' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sem toxíndrome evidente' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pergunta anterior' }));
    expect(screen.getByText('Pergunta 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, investigar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recomeçar avaliação' }));
    expect(screen.getByText('Pergunta 1')).toBeInTheDocument();
  });
});

describe('descontaminação GI', () => {
  async function walkToCharcoal() {
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar avaliação' }));
    for (const option of [
      'Não',
      'Menos de 1 hora',
      'Sim, é adsorvida',
      'Consciente e via aérea ok',
      'Sem contraindicações',
    ]) {
      await userEvent.click(screen.getByRole('button', { name: option }));
    }
  }

  it('carvão indicado: 1 g/kg entre 25 e 100 g, só com peso na faixa', async () => {
    render(<DescontaminacaoPage />);
    await walkToCharcoal();

    expect(screen.getByText('Carvão ativado pode ser considerado')).toBeInTheDocument();
    const weight = screen.getByRole('textbox', { name: /Peso do paciente/ });
    await userEvent.type(weight, '70');
    expect(screen.getByText('70 g')).toBeInTheDocument();

    await userEvent.clear(weight);
    await userEvent.type(weight, '10');
    expect(screen.getByText('25 g')).toBeInTheDocument();

    await userEvent.clear(weight);
    await userEvent.type(weight, '400');
    expect(screen.queryByText(/^\d+ g$/)).not.toBeInTheDocument();
    expect(weight).toBeInvalid();
  });

  it('substância cáustica: contraindicação absoluta', async () => {
    render(<DescontaminacaoPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar avaliação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, substância cáustica' }));

    expect(screen.getByText('Contraindicação absoluta')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Peso do paciente/ })).not.toBeInTheDocument();
  });
});

describe('critérios de destino', () => {
  it('sem critério sugere observação; um critério de UTI decide', async () => {
    render(<DestinoPage />);
    const result = screen.getAllByRole('status')[0]!;
    expect(result).toHaveTextContent('Considere observação / possível alta');
    expect(result).toHaveTextContent('0 critérios marcados');

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Ingestão intencional com necessidade/ }),
    );
    expect(result).toHaveTextContent('Considere enfermaria');

    await userEvent.click(screen.getByRole('checkbox', { name: /Hipotensão \(PAS <= 80 mmHg\)/ }));
    expect(result).toHaveTextContent('Considere UTI');
    expect(result).toHaveTextContent('2 critérios marcados');
    expect(screen.getByRole('link', { name: 'Ver bombas-relógio tóxicas' })).toHaveAttribute(
      'href',
      '/ferramentas/toxicologia/tabelas#bombas',
    );
  });
});

describe('guia de antídotos', () => {
  it('busca sem acento e separa os não disponíveis', async () => {
    render(<AntidotosPage />);
    expect(screen.getByRole('region', { name: /Disponíveis/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Não disponíveis/ })).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar antídoto ou indicação' }),
      'acetilcisteina',
    );
    const available = screen.getByRole('region', { name: /Disponíveis/ });
    expect(within(available).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(available).getByText('N-acetilcisteína (NAC)')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Não disponíveis/ })).not.toBeInTheDocument();
  });

  it('NAC: três etapas por peso e o nomograma da calculadora', async () => {
    render(<AntidotosPage />);
    await userEvent.click(screen.getByRole('button', { name: /N-acetilcisteína \(NAC\)/ }));

    await userEvent.type(screen.getByRole('textbox', { name: /Peso do paciente/ }), '70');
    expect(screen.getByText('10,5 g (10500 mg) em 200 mL SF')).toBeInTheDocument();
    expect(screen.getByText('3,5 g (3500 mg) em 500 mL SF')).toBeInTheDocument();
    expect(screen.getByText('7,0 g (7000 mg) em 1000 mL SF')).toBeInTheDocument();
    expect(screen.getByText('Dose total: 21,0 g em 21 horas')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Horas após a ingestão/ }), '4');
    await userEvent.type(
      screen.getByRole('textbox', { name: /Nível sérico de paracetamol/ }),
      '150',
    );
    expect(screen.getByText('Acima da linha de tratamento')).toBeInTheDocument();
  });

  it('atropina: 20% da dose de ataque por hora', async () => {
    render(<AntidotosPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Atropina/ }));

    await userEvent.type(screen.getByRole('textbox', { name: /Dose de ataque efetiva/ }), '8');
    expect(screen.getByText('1,60 mg/hora')).toBeInTheDocument();
    expect(screen.getByText('Aprox. 7 ampolas/hora (0,25 mg/amp)')).toBeInTheDocument();
  });
});

describe('checklist de avaliação', () => {
  it('conta os itens marcados dos 32', async () => {
    render(<ChecklistPage />);
    expect(screen.getByText('0 / 32')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /C\. Exame neurológico/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Clonus/ }));
    expect(screen.getByText('1 / 32')).toBeInTheDocument();
  });
});

describe('tabelas de consulta', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('abre na aba das toxíndromes e troca de aba', async () => {
    render(<TabelasPage />);
    expect(screen.getByRole('tab', { name: 'Toxíndromes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'ECG' }));
    expect(screen.getByRole('cell', { name: 'QRS > 100 ms' })).toBeInTheDocument();
  });

  it('#bombas abre direto nas bombas-relógio', () => {
    window.location.hash = '#bombas';
    render(<TabelasPage />);

    expect(screen.getByRole('tab', { name: 'Bombas-relógio' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('cell', { name: 'Paraquat' })).toBeInTheDocument();
  });
});

describe('doses tóxicas (CC-324)', () => {
  it('busca pelo nome comercial, sem acento, e mostra dose tóxica e meia-vida', async () => {
    render(<DosesToxicasPage />);
    expect(screen.getByText(/Base com 242 medicamentos/)).toBeInTheDocument();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar medicamento por nome ou sinônimo',
    });
    await userEvent.type(search, 'depakene');
    await userEvent.click(screen.getByRole('button', { name: /Ácido Valpróico/ }));

    const card = screen.getByRole('article', { name: 'Ácido Valpróico' });
    expect(within(card).getByText('200 mg/kg')).toBeInTheDocument();
    expect(within(card).getByText('20 hs')).toBeInTheDocument();
    expect(within(card).getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('mg/kg ingerido ÷ dose tóxica: paracetamol 70 kg com 7.000 mg', async () => {
    render(<DosesToxicasPage />);
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar medicamento por nome ou sinônimo' }),
      'paracetamol',
    );
    await userEvent.click(screen.getByRole('button', { name: /^Paracetamol/ }));

    await userEvent.type(screen.getByRole('textbox', { name: /Peso do paciente/ }), '70');
    await userEvent.type(screen.getByRole('textbox', { name: /Quantidade ingerida/ }), '7000');
    const result = screen
      .getAllByRole('status')
      .find((element) => element.textContent?.includes('Dose ingerida'));
    expect(result).toHaveTextContent('100,00 mg/kg');
    expect(result).toHaveTextContent('Acima da dose tóxica (1,3x)');
    expect(result).toHaveTextContent('133% da dose tóxica');
  });

  it('a tela de tabelas aponta para as doses tóxicas', () => {
    render(<TabelasPage />);
    expect(screen.getByRole('link', { name: /doses tóxicas de 242 medicamentos/ })).toHaveAttribute(
      'href',
      '/ferramentas/toxicologia/doses-toxicas',
    );
  });
});

describe('trilha da rota', () => {
  it('Ferramentas › Intoxicações e antídotos › seção', () => {
    pathname = '/ferramentas/toxicologia/antidotos';
    render(<RouteBreadcrumbs />);

    expect(screen.getByRole('link', { name: 'Ferramentas' })).toHaveAttribute(
      'href',
      '/ferramentas',
    );
    expect(screen.getByRole('link', { name: 'Intoxicações e antídotos' })).toHaveAttribute(
      'href',
      '/ferramentas/toxicologia',
    );
    expect(screen.getByText('Guia de antídotos')).toBeInTheDocument();
  });
});
