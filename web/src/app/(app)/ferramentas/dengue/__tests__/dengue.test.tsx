import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import DenguePage from '../page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/dengue',
  useRouter: () => ({ push: vi.fn() }),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), info: vi.fn() },
}));

const WEIGHT_KEY = 'copiloto:ferramentas:sessao:peso-adulto';
const STATE_KEY = 'copiloto:ferramentas:sessao:dengue';

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  toastSuccess.mockClear();
});

function nav() {
  return screen.getByRole('navigation', { name: 'Seções da dengue' });
}

async function openTrail() {
  await userEvent.click(within(nav()).getByRole('button', { name: 'Trilha' }));
}

function weightField() {
  return screen.getByRole('textbox', { name: /Peso/ });
}

describe('/ferramentas — Dengue no hub (CC-325)', () => {
  it('sai de "em breve" e abre em um toque', () => {
    render(<FerramentasPage />);
    const infectious = screen.getByRole('region', { name: 'Infecciosas' });
    expect(within(infectious).getByRole('link', { name: /Dengue/ })).toHaveAttribute(
      'href',
      '/ferramentas/dengue',
    );
    expect(within(infectious).queryByText('Em breve')).not.toBeInTheDocument();
  });
});

describe('/ferramentas/dengue — trilha', () => {
  it('mostra aviso fixo, aviso de adulto e as referências do ANY', () => {
    render(<DenguePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dengue' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Apoio à decisão');
    expect(screen.getByText('Ferramenta para adultos (≥15 anos)')).toBeInTheDocument();
    expect(screen.getByText('MS 6ª ed. (2024) · ABRAMEDE · OMS (2009/2012)')).toBeInTheDocument();
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('classifica ao vivo e leva ao manejo do grupo com volumes do peso', async () => {
    render(<DenguePage />);
    await openTrail();
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }));

    await userEvent.type(weightField(), '70');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vômitos persistentes' }));
    expect(screen.getByText('1 sinal de alarme')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }));

    const result = screen.getByRole('status', { name: '' });
    expect(result).toHaveAttribute('data-group', 'C');
    expect(result).toHaveTextContent('Grupo C · Internação');

    await userEvent.click(screen.getByRole('checkbox', { name: /Choque/ }));
    expect(screen.getByRole('status', { name: '' })).toHaveAttribute('data-group', 'D');

    await userEvent.click(screen.getByRole('button', { name: /Ver manejo do Grupo D/ }));
    expect(screen.getByRole('heading', { name: 'Grupo D — UTI / Emergência' })).toBeInTheDocument();
    // Bolus de 20 mL/kg para 70 kg.
    const bolus = screen.getByRole('region', { name: 'Bolus rápido — 20 mL/kg' });
    expect(bolus).toHaveTextContent('1.400');
    expect(bolus).toHaveTextContent('mL por bolus (até 3x)');
  });

  it('"Reavaliar classificação" desmarca gravidade e risco', async () => {
    render(<DenguePage />);
    await openTrail();
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gestante' }));
    expect(screen.getByRole('status', { name: '' })).toHaveAttribute('data-group', 'B');
    await userEvent.click(screen.getByRole('button', { name: /Reavaliar classificação/ }));
    expect(screen.getByRole('checkbox', { name: 'Gestante' })).not.toBeChecked();
    expect(screen.getByRole('status', { name: '' })).toHaveAttribute('data-group', 'A');
  });
});

describe('/ferramentas/dengue — reclassificação', () => {
  it('reclassifica nos dois sentidos a partir do manejo', async () => {
    render(<DenguePage />);
    await userEvent.click(within(nav()).getByRole('button', { name: 'Grupos' }));
    await userEvent.click(screen.getByRole('button', { name: /Grupo C/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo C' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Melhora clínica → Grupo B' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo B' })).toBeInTheDocument();
    expect(screen.getByText(/Grupo atual do paciente desde as/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sinais de alarme → Grupo C' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo C' })).toBeInTheDocument();
  });

  it('a classificação direta leva ao grupo da resposta', async () => {
    render(<DenguePage />);
    await userEvent.click(screen.getByRole('button', { name: /Classificação direta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Não → Próximo' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Não → Próximo' })[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Não → Grupo A' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo A' })).toBeInTheDocument();
  });
});

describe('/ferramentas/dengue — peso comum às ferramentas adultas', () => {
  it('grava o peso na chave comum, em texto cru com savedAt', async () => {
    render(<DenguePage />);
    await userEvent.click(within(nav()).getByRole('button', { name: 'Calculadoras' }));
    await userEvent.type(weightField(), '72,5');
    const stored = JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? 'null');
    expect(stored).toEqual({ savedAt: expect.any(Number), value: '72,5' });
  });

  it('usa o peso que outra ferramenta deixou na aba', async () => {
    window.sessionStorage.setItem(WEIGHT_KEY, JSON.stringify({ savedAt: Date.now(), value: '80' }));
    window.sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          screen: 'calculadoras',
          trailGroup: null,
          alarms: [],
          gravity: [],
          risks: [],
          directStep: 1,
          htBaseline: '',
          htCurrent: '',
          patientMessage: null,
          history: [],
        },
      }),
    );
    render(<DenguePage />);
    expect(weightField()).toHaveValue('80');
    await userEvent.click(screen.getByRole('button', { name: /Hidratação oral \(Grupo A\)/ }));
    // 80 kg × 60 mL/kg/dia
    expect(screen.getByRole('region', { name: 'Volume total diário' })).toHaveTextContent('4.800');
  });

  it('ignora peso vencido (mais de 30 minutos)', () => {
    window.sessionStorage.setItem(
      WEIGHT_KEY,
      JSON.stringify({ savedAt: Date.now() - 31 * 60 * 1000, value: '80' }),
    );
    render(<DenguePage />);
    expect(window.sessionStorage.getItem(WEIGHT_KEY)).toContain('""');
  });
});

describe('/ferramentas/dengue — alta segura', () => {
  it('gera a mensagem sem dado do paciente e oferece copiar e enviar', async () => {
    render(<DenguePage />);
    await userEvent.click(within(nav()).getByRole('button', { name: 'Trilha' }));
    await userEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    await userEvent.type(weightField(), '70');
    await userEvent.click(within(nav()).getByRole('button', { name: 'Alta segura' }));

    await userEvent.click(screen.getByRole('button', { name: 'Gerar orientações para WhatsApp' }));
    const message = (
      screen.getByRole('textbox', { name: /Mensagem gerada/ }) as HTMLTextAreaElement
    ).value;
    expect(message).toContain('*ORIENTAÇÕES DE ALTA — DENGUE*');
    expect(message).not.toContain('70');
    expect(screen.getByRole('link', { name: /Enviar no WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/\?text=/),
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }));
    expect(writeText).toHaveBeenCalledWith(message);
  });

  it('"Novo paciente" limpa o roteiro e o peso', async () => {
    render(<DenguePage />);
    await userEvent.click(within(nav()).getByRole('button', { name: 'Calculadoras' }));
    await userEvent.type(weightField(), '70');
    await userEvent.click(within(nav()).getByRole('button', { name: 'Início' }));
    await userEvent.click(screen.getByRole('button', { name: /Novo paciente/ }));
    expect(screen.queryByRole('button', { name: /Novo paciente/ })).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? '{}').value).toBe('');
  });
});
