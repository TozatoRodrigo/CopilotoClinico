import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncExternalStore, type ReactElement } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AclsBanner } from '@/components/domain/clinical-tools/acls/acls-banner';
import { AclsSessionProvider } from '@/components/domain/clinical-tools/acls/acls-session-provider';
import type { AclsAudio } from '@/lib/acls/audio';
import FerramentasLayout from '../layout';
import { AclsScreen } from '../_components/acls-screen';
import { CalculatorScreen } from '../_components/calculator-screen';
import ChoqueIndiferenciadoPage from '../choque-indiferenciado/page';
import ChoqueSepticoPage from '../choque-septico/page';
import InfusoesPage from '../infusoes/page';
import SedacaoPage from '../sedacao/page';
import TepPage from '../tep/page';
import ToxicologiaPage from '../toxicologia/page';
import ViaAereaPage from '../via-aerea/page';

/**
 * CC-331 — ida e volta entre ferramentas. O endereço é simulado com um store
 * pequeno (como em infusoes.test.tsx): `visit` troca rota e parâmetros e
 * monta a página dentro do layout das Ferramentas, que mostra o "Voltar para
 * …". Sair de uma tela desmonta; voltar monta de novo, e o estado vem só da
 * sessão da aba (ou do armazenamento do ACLS), como no navegador.
 */
const location = {
  pathname: '/ferramentas',
  search: new URLSearchParams(),
  listeners: new Set<() => void>(),
};

function setLocation(href: string) {
  const url = new URL(href, 'http://copiloto.local');
  location.pathname = url.pathname;
  location.search = url.searchParams;
  location.listeners.forEach((listener) => listener());
}

const replace = vi.fn((href: string) => act(() => setLocation(href)));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () =>
    useSyncExternalStore(
      (listener) => {
        location.listeners.add(listener);
        return () => location.listeners.delete(listener);
      },
      () => location.pathname,
    ),
  useSearchParams: () =>
    useSyncExternalStore(
      (listener) => {
        location.listeners.add(listener);
        return () => location.listeners.delete(listener);
      },
      () => location.search,
    ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function audio(): AclsAudio {
  return {
    unlock: vi.fn(() => true),
    startMetronome: vi.fn(() => true),
    stopMetronome: vi.fn(),
    setVentilation: vi.fn(),
    isMetronomeRunning: () => false,
    playAlert: vi.fn(),
    release: vi.fn(),
  };
}

let current: ReturnType<typeof render> | null = null;

/**
 * Abre o endereço: troca a rota, desmonta a tela anterior e monta a nova no
 * layout, com a faixa da parada do AppShell.
 */
function visit(href: string, page: ReactElement) {
  current?.unmount();
  setLocation(href);
  current = render(
    <AclsSessionProvider createAudio={audio}>
      <AclsBanner />
      <FerramentasLayout>{page}</FerramentasLayout>
    </AclsSessionProvider>,
  );
}

function hrefOf(name: string | RegExp): string {
  const href = screen.getByRole('link', { name }).getAttribute('href');
  if (!href) throw new Error(`Link ${String(name)} sem href`);
  return href;
}

/** O "Voltar para …" do topo: confere o rótulo e devolve o endereço. */
function returnHref(label: string): string {
  const nav = screen.getByRole('navigation', { name: 'Voltar à ferramenta anterior' });
  const link = within(nav).getByRole('link', { name: `Voltar para ${label}` });
  return link.getAttribute('href') ?? '';
}

function field(name: RegExp) {
  return screen.getByRole('textbox', { name });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  replace.mockClear();
});

afterEach(() => {
  current?.unmount();
  current = null;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('ida e volta entre ferramentas (CC-331)', () => {
  it('Choque séptico → noradrenalina em Infusões → volta no mesmo passo', async () => {
    visit('/ferramentas/choque-septico', <ChoqueSepticoPage />);
    await userEvent.type(field(/Peso estimado/), '72,5');
    await userEvent.type(field(/Lactato/), '36');
    await userEvent.type(field(/ou TEC medido/), '5,5');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar Tier 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Passo 3' }));
    await userEvent.type(field(/^PAD/), '48');

    const href = hrefOf('Calcular noradrenalina');
    expect(href).toBe('/ferramentas/infusoes?droga=noradrenalina&de=choque-septico');
    visit(href, <InfusoesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Noradrenalina' })).toBeInTheDocument();
    // O peso do roteiro vale nas Infusões (mesma chave da sessão).
    expect(screen.getByLabelText(/^Peso/)).toHaveValue('72,5');

    // Trocar de droga nas Infusões não perde o caminho de volta.
    await userEvent.click(screen.getByRole('button', { name: /Todas as drogas/ }));
    expect(replace).toHaveBeenLastCalledWith('/ferramentas/infusoes?de=choque-septico');

    visit(returnHref('Choque séptico'), <ChoqueSepticoPage />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Vasopressor — titulação' }),
    ).toBeInTheDocument();
    expect(field(/^PAD/)).toHaveValue('48');
  });

  it('TEP → heparina abre no esquema do TEP (80/18 UI/kg) → volta no mesmo passo', async () => {
    visit('/ferramentas/tep', <TepPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Instabilidade hemodinâmica (PAS < 90, choque, PCR)' }),
    );

    const href = hrefOf(/Calculadora de heparina/);
    expect(href).toBe('/ferramentas/infusoes?droga=heparina&indicacao=tep&de=tep');
    visit(href, <InfusoesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Heparina' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'TEP/TEV' })).toBeChecked();
    await userEvent.type(screen.getByLabelText(/^Peso/), '70');
    // 80 UI/kg × 70 = 5.600 UI; sem a indicação, as Infusões abriam na SCA (60 UI/kg, teto 4.000).
    expect(
      screen.getByText('Bolus inicial (TEP/TEV)').closest('[data-slot="callout"]'),
    ).toHaveTextContent('Este paciente5600 UI');

    visit(returnHref('Tromboembolismo pulmonar'), <TepPage />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Protocolo de instabilidade hemodinâmica' }),
    ).toBeInTheDocument();
  });

  it('ACLS → Via aérea e Toxicologia → volta com a parada correndo', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 14, 30, 0) });
    visit('/ferramentas/acls', <AclsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /^Não chocável/ }));
    fireEvent.click(screen.getByRole('button', { name: "Causas reversíveis (H's e T's)" }));
    fireEvent.click(screen.getByRole('button', { name: 'Hipóxia' }));

    const airway = hrefOf('Abrir Intubação e via aérea difícil');
    expect(airway).toBe('/ferramentas/via-aerea?de=acls');
    visit(airway, <ViaAereaPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Intubação e via aérea difícil' }),
    ).toBeInTheDocument();
    // A faixa global da parada segue no topo enquanto a via aérea está aberta.
    expect(screen.getByRole('region', { name: 'Parada em andamento' })).toBeInTheDocument();

    visit(returnHref('Parada cardiorrespiratória (ACLS)'), <AclsScreen />);
    expect(screen.queryByRole('button', { name: 'Iniciar código' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Causas reversíveis (H's e T's)" }));
    fireEvent.click(screen.getByRole('button', { name: 'Toxinas' }));

    const tox = hrefOf('Abrir Intoxicações e antídotos');
    expect(tox).toBe('/ferramentas/toxicologia?de=acls');
    visit(tox, <ToxicologiaPage />);
    expect(returnHref('Parada cardiorrespiratória (ACLS)')).toBe('/ferramentas/acls');
  });

  it('Via aérea → noradrenalina e sedação pós-IOT em Infusões → volta no mesmo passo', async () => {
    visit('/ferramentas/via-aerea', <ViaAereaPage />);
    await userEvent.click(screen.getByRole('button', { name: /Roteiro de intubação/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Passo 2:/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /H — Hipotensão/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Passo 6:/ }));

    const norepinephrine = hrefOf(/Calculadora de noradrenalina/);
    expect(norepinephrine).toBe('/ferramentas/infusoes?droga=noradrenalina&de=via-aerea');
    visit(norepinephrine, <InfusoesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Noradrenalina' })).toBeInTheDocument();

    // De volta no passo 6, com o "H" do CRASH ainda marcado (por isso o aviso).
    visit(returnHref('Intubação e via aérea difícil'), <ViaAereaPage />);
    expect(screen.getByText('Instabilidade hemodinâmica')).toBeInTheDocument();

    // Sedação pós-IOT: a lista abre com a sedação e analgesia primeiro.
    visit('/ferramentas/infusoes?grupo=sedation&de=via-aerea', <InfusoesPage />);
    const groups = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'));
    expect(groups[0]).toBe('infusoes-grupo-sedation');
    expect(returnHref('Intubação e via aérea difícil')).toBe('/ferramentas/via-aerea');
  });

  it('Sedação → Via aérea (via aérea difícil antecipada) → volta na mesma tela', async () => {
    visit('/ferramentas/sedacao', <SedacaoPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Pouco colaborativo/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Urgente — preciso agora/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Sim — tem acesso IV/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Via aérea difícil antecipada' }));

    const href = hrefOf(/Abrir Intubação e via aérea difícil/);
    expect(href).toBe('/ferramentas/via-aerea?de=sedacao');
    visit(href, <ViaAereaPage />);

    visit(returnHref('Sedação procedimental e agitação'), <SedacaoPage />);
    expect(screen.getByRole('checkbox', { name: 'Via aérea difícil antecipada' })).toBeChecked();
  });

  it('CIWA-Ar → roteiro de Toxicologia → volta com as respostas', async () => {
    visit('/ferramentas/calculadoras/ciwa-ar', <CalculatorScreen id="ciwa-ar" />);
    const nausea = screen.getByRole('group', { name: 'Náusea e vômitos' });
    await userEvent.click(within(nausea).getByRole('radio', { name: /Náusea leve sem vômitos/ }));

    const href = hrefOf('Abrir no roteiro: Intoxicações e antídotos');
    expect(href).toBe('/ferramentas/toxicologia?de=calculadoras/ciwa-ar');
    visit(href, <ToxicologiaPage />);

    visit(returnHref('CIWA-Ar'), <CalculatorScreen id="ciwa-ar" />);
    expect(
      within(screen.getByRole('group', { name: 'Náusea e vômitos' })).getByRole('radio', {
        name: /Náusea leve sem vômitos/,
      }),
    ).toBeChecked();
  });

  it('VTI → choque indiferenciado na aba VTI → volta com a resposta', async () => {
    // A última visita ao choque indiferenciado ficou na aba VNERi.
    visit('/ferramentas/choque-indiferenciado', <ChoqueIndiferenciadoPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'VNERi' }));

    visit(
      '/ferramentas/calculadoras/vti-classificacao',
      <CalculatorScreen id="vti-classificacao" />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /VTI < 16 cm — baixo débito/ }));

    const href = hrefOf('Abrir no roteiro: Choque indiferenciado');
    visit(href, <ChoqueIndiferenciadoPage />);
    expect(screen.getByRole('tab', { name: 'VTI' })).toHaveAttribute('aria-selected', 'true');

    visit(
      returnHref('Classificação hemodinâmica por VTI (Mercadal 2022)'),
      <CalculatorScreen id="vti-classificacao" />,
    );
    expect(screen.getByRole('radio', { name: /VTI < 16 cm — baixo débito/ })).toBeChecked();
  });
});
