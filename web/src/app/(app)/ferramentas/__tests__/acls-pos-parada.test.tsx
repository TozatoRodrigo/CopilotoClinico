import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AclsSessionProvider } from '@/components/domain/clinical-tools/acls/acls-session-provider';
import type { AclsAudio } from '@/lib/acls/audio';
import { ACLS_HISTORY_KEY } from '@/lib/acls/history-storage';
import { AclsHistoryScreen } from '../_components/acls-history-screen';
import { AclsOvaceScreen } from '../_components/acls-ovace-screen';
import { AclsScreen } from '../_components/acls-screen';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ferramentas/acls',
  useRouter: () => router,
  notFound: vi.fn(),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), info: vi.fn() },
}));

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

function withSession(page: ReactNode) {
  return <AclsSessionProvider createAudio={audio}>{page}</AclsSessionProvider>;
}

/** Inicia, escolhe o ritmo, deixa o ciclo vencer e responde a checagem. */
function runCode(result: 'RCE (pulso presente)' | 'death') {
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
  fireEvent.click(screen.getByRole('button', { name: /^Chocável/ }));
  fireEvent.click(screen.getByRole('button', { name: /Registrar choque/ }));
  fireEvent.click(screen.getByRole('button', { name: /Registrar Epinefrina 1 mg IV\/IO/ }));
  act(() => vi.advanceTimersByTime(120_000));
  const dialog = screen.getByRole('dialog');
  if (result === 'death') {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Óbito' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar óbito' }));
  } else {
    fireEvent.click(within(dialog).getByRole('button', { name: result }));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 15, 14, 30, 0) });
  window.localStorage.clear();
  router.push.mockClear();
  toastSuccess.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('fim da parada: checklist e relatório (CC-314)', () => {
  it('no RCE mostra o checklist e o relatório pronto para copiar, já guardado', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(withSession(<AclsScreen />));
    runCode('RCE (pulso presente)');

    expect(screen.getByText('RCE obtido')).toBeInTheDocument();
    const checklist = screen.getByRole('group', { name: 'Checklist pós-RCE (AHA 2025)' });
    const items = within(checklist).getAllByRole('checkbox');
    expect(items).toHaveLength(10);
    fireEvent.click(items[4]!);
    expect(items[4]).toBeChecked();

    // Critério 1: horários, choques, medicações e desfecho.
    const report = screen.getByText(/RELATÓRIO DE PCR/);
    expect(report).toHaveTextContent('Atendimento #1');
    expect(report).toHaveTextContent('Data: 15/10/2026 | Início: 14:30');
    expect(report).toHaveTextContent('Choques: 1');
    expect(report).toHaveTextContent('Medicações: Epinefrina 1 mg IV/IO ×1');
    expect(report).toHaveTextContent('Desfecho: RCE obtido');
    expect(report).toHaveTextContent('(14:30) — Choque 1');
    expect(screen.getByText(/Guardado neste aparelho como atendimento #1/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar para o prontuário' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Desfecho: RCE obtido'));

    // Critério 2: o histórico fica no aparelho, sem identificação do paciente.
    const saved = JSON.parse(window.localStorage.getItem(ACLS_HISTORY_KEY) ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ number: 1, outcome: 'RCE', shocks: 1 });
    expect(Object.keys(saved[0]).sort()).toEqual(
      [
        'cycles',
        'date',
        'durationSeconds',
        'endTime',
        'id',
        'initialRhythm',
        'number',
        'outcome',
        'report',
        'shocks',
        'startTime',
      ].sort(),
    );
  });

  it('no óbito mostra o horário e guarda o relatório; nova parada volta ao início', () => {
    render(withSession(<AclsScreen />));
    runCode('death');

    expect(screen.getByText('Fim dos esforços')).toBeInTheDocument();
    expect(screen.getByText(/Horário do óbito: 14:32/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Checklist pós-RCE/ })).not.toBeInTheDocument();
    expect(screen.getByText(/RELATÓRIO DE PCR/)).toHaveTextContent('Desfecho: Óbito');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nova parada' }));
    expect(screen.getByRole('button', { name: 'Iniciar código' })).toBeInTheDocument();
  });
});

describe("H's e T's durante a parada (CC-314)", () => {
  it('mostra os 10 cards e deixa Via aérea e Toxicologia como "em breve", sem link', () => {
    render(withSession(<AclsScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código' }));
    fireEvent.click(screen.getByRole('button', { name: /Não chocável/ }));

    fireEvent.click(screen.getByRole('button', { name: "Causas reversíveis (H's e T's)" }));
    for (const name of [
      'Hipovolemia',
      'Hipóxia',
      'Hidrogênio (acidose)',
      'Hipo/Hipercalemia',
      'Hipotermia',
      'Tensão (pneumotórax hipertensivo)',
      'Tamponamento cardíaco',
      'Toxinas',
      'Trombose pulmonar (TEP)',
      'Trombose coronária (IAM)',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Hipóxia' }));
    expect(screen.getByText('FiO₂ 100%.')).toBeInTheDocument();
    expect(screen.getByText('Intubação e via aérea difícil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toxinas' }));
    expect(screen.getByText('Intoxicações e antídotos')).toBeInTheDocument();
    expect(screen.getAllByText('Em breve')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /via aérea|antídotos/i })).not.toBeInTheDocument();
  });
});

describe('/ferramentas/acls/historico (CC-314)', () => {
  it('lista do mais recente para o mais antigo e apaga com confirmação', () => {
    const view = render(withSession(<AclsScreen />));
    runCode('RCE (pulso presente)');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nova parada' }));
    act(() => vi.advanceTimersByTime(60_000));
    runCode('death');
    view.unmount();

    render(withSession(<AclsHistoryScreen />));
    const list = screen.getByRole('list', { name: 'Atendimentos' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Atendimento #2');
    expect(items[0]).toHaveTextContent('Óbito');
    expect(items[1]).toHaveTextContent('Atendimento #1');
    expect(screen.getByText(/sem identificação do paciente/)).toBeInTheDocument();

    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Relatório' }));
    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Apagar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apagar todo o histórico' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(screen.getByText('Nenhum atendimento salvo')).toBeInTheDocument();
    expect(window.localStorage.getItem(ACLS_HISTORY_KEY)).toBeNull();
  });
});

describe('/ferramentas/acls/ovace (CC-314)', () => {
  it('leve: incentiva a tosse e volta à avaliação', () => {
    render(withSession(<AclsOvaceScreen />));
    expect(screen.getByText('O paciente apresenta sinais de OVACE grave?')).toBeInTheDocument();
    expect(screen.getByText('Tosse fraca ou ausente')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Não — OVACE leve' }));
    expect(screen.getByText('Incentivar a tosse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('O paciente apresenta sinais de OVACE grave?')).toBeInTheDocument();
  });

  it('grave e consciente até expelir; voltar ao início leva ao ACLS', () => {
    render(withSession(<AclsOvaceScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Sim — OVACE grave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim — Consciente' }));
    expect(
      screen.getByText('5 tapas nas costas (golpes) seguidos de 5 compressões abdominais'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Gestante ou obeso/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Objeto expelido' }));
    expect(screen.getByText('Continuar monitorando o paciente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(router.push).toHaveBeenCalledWith('/ferramentas/acls');
  });

  it('inconsciente: "Iniciar código de PCR" inicia a parada e abre o ACLS', () => {
    render(withSession(<AclsOvaceScreen />));
    fireEvent.click(screen.getByRole('button', { name: 'Sim — OVACE grave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Não — Inconsciente' }));
    expect(screen.getByText('Acionar o serviço médico de emergência')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar código de PCR' }));
    expect(router.push).toHaveBeenCalledWith('/ferramentas/acls');
    expect(window.localStorage.getItem('copiloto:ferramentas:acls:parada')).toContain(
      '"status":"running"',
    );
  });
});
