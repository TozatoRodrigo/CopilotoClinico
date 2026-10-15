import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WORKSHEET_COLUMNS, WORKSHEET_ROWS } from '@clinical-tools/cad-ehh/content';
import FerramentasPage from '../page';
import { CadEhhScreen } from '../cad-ehh/_components/cad-ehh-screen';
import { WORKSHEET_PRINT_CSS } from '../cad-ehh/_components/worksheet';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/cad-ehh',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

const T0 = Date.UTC(2026, 9, 15, 12, 0);
const MINUTE = 60_000;

function renderTool(now: () => number = () => T0) {
  const user = userEvent.setup();
  const view = render(<CadEhhScreen now={now} />);
  return { user, ...view };
}

async function openStep(user: ReturnType<typeof userEvent.setup>, n: number, title: string) {
  await user.click(screen.getByRole('button', { name: `Passo ${n}: ${title}` }));
}

async function typeLab(user: ReturnType<typeof userEvent.setup>, label: RegExp, value: string) {
  const input = screen.getByRole('textbox', { name: label });
  await user.clear(input);
  await user.type(input, value);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('/ferramentas — CAD e EHH no hub', () => {
  it('sai do "em breve" e abre em um toque a partir do grupo Metabólico', () => {
    render(<FerramentasPage />);
    const group = screen.getByRole('region', { name: 'Metabólico' });
    expect(within(group).getByRole('link', { name: /CAD e EHH/ })).toHaveAttribute(
      'href',
      '/ferramentas/cad-ehh',
    );
    expect(within(group).queryByText('Em breve')).not.toBeInTheDocument();
  });
});

describe('/ferramentas/cad-ehh (CC-326)', () => {
  it('abre na tela inicial com o aviso fixo, os nove cartões e o escopo', () => {
    renderTool();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    for (const card of ['Primeira hora', 'Após os exames', 'Reavaliação', 'Planilha']) {
      expect(screen.getByRole('button', { name: new RegExp(card) })).toBeInTheDocument();
    }
    expect(screen.getByText(/Não cobre pediatria, gestantes/)).toBeInTheDocument();
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('sem potássio, a insulina continua travada (critério de aceite)', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Após os exames/ }));
    await openStep(user, 7, 'Insulina');

    expect(screen.getByText('Seção travada')).toBeInTheDocument();
    expect(screen.getByText('Informe o potássio para liberar esta seção')).toBeInTheDocument();
    expect(screen.queryByText('Calculadora de velocidade')).not.toBeInTheDocument();

    // O botão leva ao passo em que o potássio é digitado.
    await user.click(screen.getByRole('button', { name: /Informar o potássio/ }));
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('potássio fora da faixa não destrava a insulina', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Após os exames/ }));
    await openStep(user, 3, 'Confirmar');
    await typeLab(user, /^Potássio/, '12');
    expect(await screen.findByText(/Fora da faixa aceita: 1 a 9 mEq\/L/)).toBeInTheDocument();
    await openStep(user, 7, 'Insulina');
    expect(screen.getByText('Seção travada')).toBeInTheDocument();
  });

  it('com potássio abaixo de 3,5 abre bloqueada; com 4,2 e 70 kg calcula 7,0 U/h', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Primeira hora/ }));
    await typeLab(user, /^Peso/, '70');
    await openStep(user, 3, 'Confirmar');
    await typeLab(user, /^Potássio/, '3,2');
    await openStep(user, 7, 'Insulina');
    expect(screen.getByText('Insulina bloqueada')).toBeInTheDocument();

    await openStep(user, 3, 'Confirmar');
    await typeLab(user, /^Potássio/, '4,2');
    await openStep(user, 7, 'Insulina');
    expect(screen.queryByText('Insulina bloqueada')).not.toBeInTheDocument();
    // 1 U/mL: U/h e mL/h são o mesmo número.
    expect(screen.getAllByText('7,0')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '0,05 U/kg/h' }));
    expect(screen.getAllByText('3,5')).toHaveLength(2);
  });

  it('o passo do potássio destaca a faixa e o KCl espelha mL e mEq', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Após os exames/ }));
    await openStep(user, 3, 'Confirmar');
    await typeLab(user, /^Potássio/, '3,0');
    await openStep(user, 6, 'Potássio');

    const table = screen.getByRole('table', { name: 'Conduta por faixa de potássio' });
    const active = within(table)
      .getAllByRole('row')
      .find((row) => row.getAttribute('aria-current') === 'true');
    expect(active).toHaveTextContent('<3,5 mEq/L');
    expect(screen.getByText('Potássio abaixo de 3,5 mEq/L')).toBeInTheDocument();

    await typeLab(user, /^KCl a aspirar/, '15');
    expect(screen.getByRole('textbox', { name: /^Equivale a/ })).toHaveValue('20,1');
    expect(screen.getByText('402 mL')).toBeInTheDocument();
    expect(screen.getByText('200,0 mL/h · 2,0 h')).toBeInTheDocument();
  });

  it('o ciclo mede a queda por hora com o relógio injetado', async () => {
    let clock = T0;
    const { user } = renderTool(() => clock);
    await user.click(screen.getByRole('button', { name: /Reavaliação/ }));
    await typeLab(user, /^Glicemia/, '450');
    await user.click(screen.getByRole('button', { name: /Nova rodada/ }));
    expect(screen.getByText(/Reavaliação 2/)).toBeInTheDocument();

    clock = T0 + 60 * MINUTE;
    await typeLab(user, /^Glicemia/, '420');
    expect(screen.getByText('Glicemia caiu 30 mg/dL por hora')).toBeInTheDocument();
    expect(
      screen.getByText(/Se a glicemia não cair pelo menos 50 a 70 mg\/dL/),
    ).toBeInTheDocument();
    expect(screen.getByText(/anterior há 1,0 h/)).toBeInTheDocument();
  });

  it('marca o iSGLT2 e mostra a nota', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Precipitante/ }));
    await user.click(screen.getByRole('checkbox', { name: /Inibidor de SGLT2/ }));
    expect(screen.getByText(/geralmente são suspensos na admissão/)).toBeInTheDocument();
  });

  it('retoma o roteiro salvo na aba e oferece recomeçar', async () => {
    const first = renderTool();
    await first.user.click(screen.getByRole('button', { name: /Precipitante/ }));
    await first.user.click(screen.getByRole('checkbox', { name: /Trauma/ }));
    first.unmount();

    const { user } = renderTool();
    expect(screen.getByText('Roteiro retomado nesta aba')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Trauma/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /Recomeçar/ }));
    expect(screen.getByRole('button', { name: /Primeira hora/ })).toBeInTheDocument();
  });
});

describe('planilha para imprimir (A4 paisagem)', () => {
  const print = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('print', print);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    print.mockClear();
  });

  it('a folha impressa existe, com 19 colunas, 12 linhas e o cabeçalho', async () => {
    const { user } = renderTool();
    await user.click(screen.getByRole('button', { name: /Planilha/ }));

    const sheet = screen.getByTestId('planilha-impressa');
    // Fica direto no body: o CSS de impressão esconde todo o resto.
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet).toHaveAttribute('data-print-root', 'cad-ehh-planilha');
    expect(within(sheet).getAllByRole('columnheader')).toHaveLength(WORKSHEET_COLUMNS.length);
    expect(within(sheet).getAllByRole('row')).toHaveLength(WORKSHEET_ROWS + 1);
    expect(sheet).toHaveTextContent('Nome do paciente:');
    expect(sheet).toHaveTextContent('Dextrose (sim/não, %)');

    await user.click(screen.getByRole('button', { name: /Imprimir planilha/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('o CSS de impressão pede A4 paisagem e só vale com a planilha aberta', async () => {
    expect(WORKSHEET_PRINT_CSS).toMatch(/@page\s*\{\s*size:\s*A4 landscape/);
    expect(WORKSHEET_PRINT_CSS).toMatch(/@media print/);

    const { user, unmount } = renderTool();
    await user.click(screen.getByRole('button', { name: /Planilha/ }));
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent);
    expect(styles.some((css) => css?.includes('size: A4 landscape'))).toBe(true);

    await user.click(screen.getAllByRole('button', { name: /^Início$/ })[0]!);
    expect(screen.queryByTestId('planilha-impressa')).not.toBeInTheDocument();
    expect(
      [...document.querySelectorAll('style')].some((style) =>
        style.textContent?.includes('A4 landscape'),
      ),
    ).toBe(false);
    unmount();
  });
});
