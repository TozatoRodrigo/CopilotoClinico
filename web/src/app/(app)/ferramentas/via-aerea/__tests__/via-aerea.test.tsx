import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import ViaAereaPage from '../page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/via-aerea',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), info: vi.fn() },
}));

async function openPathway() {
  render(<ViaAereaPage />);
  await userEvent.click(screen.getByRole('button', { name: /Roteiro de intubação/ }));
}

async function goToStep(step: number) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Passo ${step}:`) }));
}

describe('/ferramentas/via-aerea (CC-315)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.scrollTo = vi.fn();
    toastSuccess.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sai de "em breve" no hub e abre em um toque', () => {
    render(<FerramentasPage />);
    const airway = screen.getByRole('region', { name: 'Via aérea' });
    expect(
      within(airway).getByRole('link', { name: /Intubação e via aérea difícil/ }),
    ).toHaveAttribute('href', '/ferramentas/via-aerea');
    expect(within(airway).queryByText('Em breve')).not.toBeInTheDocument();
  });

  it('mostra o aviso fixo, a procedência e as três entradas do ANY', () => {
    render(<ViaAereaPage />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    expect(
      screen.getByText(/AirwayGuide\.tsx \(95c8fba\).*revisão clínica pendente/),
    ).toBeInTheDocument();
    for (const name of [/Roteiro de intubação/, /Checklist de IOT/, /Doses de medicações/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('passo 1: só continua com uma indicação marcada', async () => {
    await openPathway();
    const next = screen.getByRole('button', { name: /Continuar/ });
    expect(next).toBeDisabled();
    expect(
      screen.getByText('Selecione ao menos uma indicação para continuar.'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Falha de ventilação ou oxigenação/ }),
    );
    expect(next).toBeEnabled();
    expect(screen.getByText('PCR ou PCR iminente?')).toBeInTheDocument();

    await userEvent.click(next);
    expect(screen.getByRole('heading', { name: 'VAD fisiológica — CRASH' })).toBeInTheDocument();
  });

  it('critério 3: índice de choque > 1,0 marca o H com aviso visível', async () => {
    await openPathway();
    await goToStep(2);

    const h = screen.getByRole('checkbox', { name: /H — Hipotensão/ });
    expect(h).not.toBeChecked();
    await userEvent.type(screen.getByLabelText(/^FC/), '120');
    await userEvent.type(screen.getByLabelText(/^PAS/), '90');

    expect(h).toBeChecked();
    expect(screen.getByText('1,33')).toBeInTheDocument();
    expect(screen.getByText('Acima de 1,0 (marca o H)')).toBeInTheDocument();
    const status = screen
      .getAllByRole('status')
      .find((element) => element.textContent?.includes('H (hipotensão) marcado automaticamente'));
    expect(status).toHaveTextContent('Índice de choque 1,33, acima de 1,0.');
    expect(screen.getByText('Taquicardia')).toBeInTheDocument();
    expect(screen.getByText('PAS limítrofe')).toBeInTheDocument();

    // Desmarcar o H é do médico: o aviso sai.
    await userEvent.click(h);
    expect(screen.queryByText('H (hipotensão) marcado automaticamente')).not.toBeInTheDocument();
  });

  it('critério 1: peso e instabilidade → doses do ANY com a redução sugerida', async () => {
    await openPathway();
    await goToStep(2);
    await userEvent.click(screen.getByRole('checkbox', { name: /H — Hipotensão/ }));
    await goToStep(8);

    expect(screen.getByText('Considere redução de dose')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Peso/), '80');

    const etomidate = document.querySelector<HTMLElement>('[data-drug="etomidato"]');
    if (!etomidate) throw new Error('cartão do etomidato ausente');
    expect(within(etomidate).getByText('24 mg')).toBeInTheDocument();
    expect(within(etomidate).getByText('= 12,0 mL')).toBeInTheDocument();
    expect(etomidate).toHaveTextContent('Com redução de 30–50%: 12 a 16,8 mg (6,0 a 8,4 mL)');

    const rocuronium = document.querySelector<HTMLElement>('[data-drug="rocuronio"]');
    expect(rocuronium).toHaveTextContent('120 mg');
    expect(rocuronium).not.toHaveTextContent('Com redução');

    // A régua muda a dose ao vivo.
    fireEvent.change(within(etomidate).getByRole('slider'), { target: { value: '0.2' } });
    expect(within(etomidate).getByText('16 mg')).toBeInTheDocument();
  });

  it('sem peso, nenhuma dose aparece (o ANY usava 70 kg)', async () => {
    render(<ViaAereaPage />);
    await userEvent.click(screen.getByRole('button', { name: /Doses de medicações/ }));
    expect(screen.getAllByText('Informe o peso para calcular a dose.')).toHaveLength(6);
  });

  it('um indutor e um BNM por vez', async () => {
    render(<ViaAereaPage />);
    await userEvent.click(screen.getByRole('button', { name: /Doses de medicações/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Cetamina/ }));
    // O alerta da droga aparece quando ela está selecionada, como no ANY.
    expect(screen.getByText(/Uso com cautela em emergência hipertensiva/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Propofol/ }));
    expect(screen.getByRole('checkbox', { name: /Cetamina/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Propofol/ })).toBeChecked();
    expect(
      screen.queryByText(/Uso com cautela em emergência hipertensiva/),
    ).not.toBeInTheDocument();
  });

  it('critério 2: "Intubou? Não" leva ao plano B e, se falhar, ao plano C', async () => {
    await openPathway();
    await goToStep(10);

    await userEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(
      screen.getByRole('heading', { name: 'Plano B — Dispositivo extraglótico' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Plano C — Cricotireoidostomia' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Falhou — Plano C' }));
    expect(
      screen.getByRole('heading', { name: 'Plano C — Cricotireoidostomia' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Falhou — Plano C' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Via aérea estabelecida' }));
    expect(screen.getByText('Resgate: Cricotireoidostomia')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    expect(
      screen.getByText(
        'Falha na intubação; via aérea estabelecida com cricotireoidostomia (plano C)',
      ),
    ).toBeInTheDocument();
  });

  it('copia o resumo para o prontuário', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await openPathway();
    await userEvent.click(screen.getByRole('checkbox', { name: /Falha em manter/ }));
    await goToStep(11);
    await userEvent.click(screen.getByRole('button', { name: /Copiar para o prontuário/ }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text.split('\n')[0]).toBe('Intubação orotraqueal — roteiro de via aérea');
    expect(text).toContain('Indicação: Falha em manter/proteger VA');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('o roteiro e o peso sobrevivem a sair e voltar na aba; recomeçar limpa tudo', async () => {
    const first = render(<ViaAereaPage />);
    await userEvent.click(screen.getByRole('button', { name: /Doses de medicações/ }));
    await userEvent.type(screen.getByLabelText(/^Peso/), '75');
    first.unmount();

    render(<ViaAereaPage />);
    expect(screen.getByLabelText(/^Peso/)).toHaveValue('75');
    await userEvent.click(screen.getByRole('button', { name: /Início da via aérea/ }));
    await userEvent.click(screen.getByRole('button', { name: /Recomeçar \(novo paciente\)/ }));
    await userEvent.click(screen.getByRole('button', { name: /Doses de medicações/ }));
    expect(screen.getByLabelText(/^Peso/)).toHaveValue('');
  });

  it('com instabilidade, abre a noradrenalina em Infusões com o caminho de volta (CC-331)', async () => {
    await openPathway();
    await goToStep(2);
    await userEvent.click(screen.getByRole('checkbox', { name: /H — Hipotensão/ }));
    await goToStep(6);
    expect(screen.getByText('Instabilidade hemodinâmica')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Calculadora de noradrenalina/ })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=noradrenalina&de=via-aerea',
    );
  });
});
