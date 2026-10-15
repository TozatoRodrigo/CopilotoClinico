import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AclsBanner } from '@/components/domain/clinical-tools/acls/acls-banner';
import { AclsSessionProvider } from '@/components/domain/clinical-tools/acls/acls-session-provider';
import type { AclsAudio } from '@/lib/acls/audio';
import { ACLS_SESSION_KEY } from '@/lib/acls/session-storage';
import { AclsScreen } from '../_components/acls-screen';

const navigation = vi.hoisted(() => ({ pathname: '/ferramentas/acls' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function fakeAudio() {
  let running = false;
  const audio = {
    unlock: vi.fn(() => true),
    startMetronome: vi.fn(() => {
      running = true;
      return true;
    }),
    stopMetronome: vi.fn(() => {
      running = false;
    }),
    setVentilation: vi.fn(),
    isMetronomeRunning: () => running,
    playAlert: vi.fn(),
    release: vi.fn(),
  } satisfies AclsAudio;
  return audio;
}

type FakeAudio = ReturnType<typeof fakeAudio>;

function shell(audio: FakeAudio, page: ReactNode) {
  return (
    <AclsSessionProvider createAudio={() => audio}>
      <AclsBanner />
      {page}
    </AclsSessionProvider>
  );
}

const vibrate = vi.fn();

describe('/ferramentas/acls (CC-313)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 14, 30, 0) });
    window.localStorage.clear();
    navigation.pathname = '/ferramentas/acls';
    Object.defineProperty(window.navigator, 'vibrate', { value: vibrate, configurable: true });
    vibrate.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conduz a parada: ritmo, choques, amiodarona, fim do ciclo com som e vibração', () => {
    const audio = fakeAudio();
    render(shell(audio, <AclsScreen />));

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    expect(audio.unlock).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Chocável/ }));

    expect(screen.getByText('Ciclo 1 de RCP')).toBeInTheDocument();
    expect(screen.getByText('RCP de alta qualidade + preparar choque')).toBeInTheDocument();

    const shock = screen.getByRole('button', { name: /Registrar choque/ });
    fireEvent.click(shock);
    fireEvent.click(shock);
    fireEvent.click(shock);
    expect(vibrate).toHaveBeenCalledWith([200]);
    // Critério 3: 3 choques → amiodarona 300 mg.
    expect(screen.getByText('Considere amiodarona 300 mg IV')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Registrar Amiodarona 300 mg IV/ }));
    fireEvent.click(shock);
    fireEvent.click(shock);
    // …e no 5º choque, 150 mg.
    expect(screen.getByText('Considere amiodarona 150 mg IV')).toBeInTheDocument();

    // Critério 1: fim dos 2 min avisa por som e vibração e pede o ritmo.
    act(() => vi.advanceTimersByTime(120_000));
    const dialog = screen.getByRole('dialog', { name: /Checar ritmo · fim do ciclo 1/ });
    expect(audio.playAlert).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([500]);

    fireEvent.change(within(dialog).getByRole('textbox', { name: /ETCO2/ }), {
      target: { value: '18' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Não chocável' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Ciclo 2 de RCP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar choque/ })).not.toBeInTheDocument();
  });

  it('avisa a epinefrina vencida por som e vibração, mesmo em outra ferramenta (faixa global)', () => {
    const audio = fakeAudio();
    const view = render(shell(audio, <AclsScreen />));

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Não chocável/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar Epinefrina 1 mg IV\/IO/ }));
    expect(vibrate).toHaveBeenCalledWith([100, 50, 100]);
    expect(screen.getByText(/Próxima epinefrina em 4:00/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Parada em andamento' })).not.toBeInTheDocument();

    // O médico vai para outra ferramenta: a parada segue e a faixa aparece.
    navigation.pathname = '/ferramentas/toxicologia';
    view.rerender(shell(audio, <p>Toxicologia</p>));
    const banner = screen.getByRole('region', { name: 'Parada em andamento' });
    expect(within(banner).getByRole('link', { name: 'Voltar à parada' })).toHaveAttribute(
      'href',
      '/ferramentas/acls',
    );

    act(() => vi.advanceTimersByTime(100_000));
    expect(within(banner).getByText(/Ciclo 1 · 0:[12]\d/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(20_000));
    expect(within(banner).getByText('Checar ritmo')).toBeInTheDocument();
    expect(audio.playAlert).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(120_000));
    expect(within(banner).getByText('Considere epinefrina')).toBeInTheDocument();
    expect(audio.playAlert).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith([300, 100, 300]);

    // Volta ao ACLS: tudo onde estava, com a checagem de ritmo esperando.
    navigation.pathname = '/ferramentas/acls';
    view.rerender(shell(audio, <AclsScreen />));
    expect(screen.queryByRole('region', { name: 'Parada em andamento' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: /Checar ritmo · fim do ciclo 1/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Não chocável' }));
    expect(screen.getByText('Ciclo 2 de RCP')).toBeInTheDocument();
    expect(screen.getByText('Considere epinefrina agora')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Registrar Epinefrina 1 mg IV\/IO \(1 registrada\)/ }),
    ).toBeInTheDocument();
  });

  it('liga o metrônomo e soma a ventilação com via aérea avançada', () => {
    const audio = fakeAudio();
    render(shell(audio, <AclsScreen />));

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Chocável/ }));
    const metronome = screen.getByRole('button', { name: /110\/min/ });
    fireEvent.click(metronome);

    expect(audio.startMetronome).toHaveBeenCalledWith({ ventilation: false });
    expect(metronome).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('switch', { name: /Via aérea avançada/ }));
    expect(audio.setVentilation).toHaveBeenCalledWith(true);

    fireEvent.click(metronome);
    expect(audio.stopMetronome).toHaveBeenCalled();
    expect(metronome).toHaveAttribute('aria-pressed', 'false');
  });

  it('a parada sobrevive a recarregar a aba', () => {
    const first = render(shell(fakeAudio(), <AclsScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Chocável/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar choque/ }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(window.localStorage.getItem(ACLS_SESSION_KEY)).toContain('"shockCount":1');
    first.unmount();

    render(shell(fakeAudio(), <AclsScreen />));
    expect(screen.getByText('Ciclo 1 de RCP')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Registrar choque · 1 até agora/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('descartar pede confirmação e volta ao início', () => {
    const audio = fakeAudio();
    render(shell(audio, <AclsScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Chocável/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Descartar parada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.getByRole('button', { name: 'Iniciar código' })).toBeInTheDocument();
    expect(audio.release).toHaveBeenCalled();
    expect(window.localStorage.getItem(ACLS_SESSION_KEY)).toBeNull();
  });

  it('o óbito pede confirmação antes de encerrar', () => {
    render(shell(fakeAudio(), <AclsScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Não chocável/ }));
    act(() => vi.advanceTimersByTime(120_000));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Óbito' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Óbito' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar óbito' }));

    expect(screen.getByText('Fim dos esforços')).toBeInTheDocument();
  });
});
