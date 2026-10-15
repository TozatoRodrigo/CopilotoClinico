import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncExternalStore, type ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openToolFromCase, readCaseAttachments } from '@/lib/case-tool-link';
import type { CaseToolFacts, CaseToolSuggestion } from '@/lib/types';
import FerramentasLayout from '../layout';
import { CalculatorScreen } from '../_components/calculator-screen';
import ChoqueSepticoPage from '../choque-septico/page';
import PediatriaLayout from '../pediatria/layout';
import PediatriaPage from '../pediatria/page';
import TepPage from '../tep/page';

/**
 * CC-332 — a ferramenta aberta pelo plano do Copiloto: já preenchida com o
 * caso, com os campos marcados "vindo do caso", o caminho de volta e o
 * "Anexar ao caso". O endereço é simulado como em ida-e-volta.test.tsx.
 */
const location = { search: new URLSearchParams(), listeners: new Set<() => void>() };

function setLocation(href: string) {
  location.search = new URL(href, 'http://copiloto.local').searchParams;
  location.listeners.forEach((listener) => listener());
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/ferramentas',
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

const ENCOUNTER = 'enc-332';
const FACTS: CaseToolFacts = {
  ageYears: 67,
  sex: 'F',
  weightKg: 73,
  systolicBp: 82,
  diastolicBp: 47,
  heartRate: 131,
  respiratoryRate: 33,
  spo2: 89,
  temperature: 38.9,
  glucose: null,
};

const suggestion = (target: CaseToolSuggestion['target'], name: string): CaseToolSuggestion => ({
  ruleId: 'teste',
  target,
  name,
  reason: 'teste',
});

/** O clique em "Abrir …" no plano: grava na aba e devolve o endereço. */
function openFromCase(target: CaseToolSuggestion['target'], name: string, facts = FACTS) {
  return openToolFromCase({
    encounterId: ENCOUNTER,
    interactionId: 'interaction-1',
    suggestion: suggestion(target, name),
    facts,
  });
}

function visit(href: string, page: ReactElement) {
  setLocation(href);
  return render(<FerramentasLayout>{page}</FerramentasLayout>);
}

const fromCaseBadges = () => screen.queryAllByText('vindo do caso');
const group = (name: string | RegExp) => screen.getByRole('group', { name });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
  window.sessionStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ferramenta aberta pelo plano do Copiloto (CC-332)', () => {
  it('a calculadora abre preenchida, marcada "vindo do caso", com volta e anexo', async () => {
    const href = openFromCase({ kind: 'calculator', calculatorId: 'perc-rule' }, 'PERC Rule');
    visit(href, <CalculatorScreen id="perc-rule" />);

    const back = within(screen.getByRole('navigation', { name: 'Caso de origem' })).getByRole(
      'link',
      { name: 'Voltar ao caso' },
    );
    expect(back).toHaveAttribute('href', `/encounters/${ENCOUNTER}/conversation`);

    expect(within(group(/Idade ≥ 50 anos/)).getByRole('radio', { name: /^Sim/ })).toBeChecked();
    expect(within(group(/FC ≥ 100 bpm/)).getByRole('radio', { name: /^Sim/ })).toBeChecked();
    expect(within(group(/SpO₂ < 95%/)).getByRole('radio', { name: /^Sim/ })).toBeChecked();
    expect(within(group(/Idade ≥ 50 anos/)).getByText('vindo do caso')).toBeInTheDocument();
    expect(fromCaseBadges()).toHaveLength(3);

    // O médico troca: a marca sai daquele item.
    await userEvent.click(within(group(/FC ≥ 100 bpm/)).getByRole('radio', { name: 'Não' }));
    expect(fromCaseBadges()).toHaveLength(2);
    expect(within(group(/FC ≥ 100 bpm/)).queryByText('vindo do caso')).not.toBeInTheDocument();

    // Sem resultado ainda, nada para anexar.
    const attach = screen.getByRole('button', { name: 'Anexar ao caso' });
    expect(attach).toBeDisabled();
    for (const name of [/Hemoptise/, /estrogênio/, /Cirurgia/, /TVP ou TEP/, /Edema/]) {
      await userEvent.click(within(group(name)).getByRole('radio', { name: 'Não' }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Anexar ao caso' }));

    const [attached] = readCaseAttachments(ENCOUNTER);
    expect(attached?.toolName).toBe('PERC Rule');
    expect(attached?.text).toMatch(/^PERC Rule: 2 critérios — PERC positivo\./);
    expect(screen.getByRole('button', { name: 'Anexado ao caso' })).toBeDisabled();
    expect(screen.getByText(/Entra na próxima reanálise/)).toHaveAttribute('role', 'status');
  });

  it('sem o token no endereço não há caso: sem volta, sem marca, sem anexar', () => {
    openFromCase({ kind: 'calculator', calculatorId: 'perc-rule' }, 'PERC Rule');
    visit('/ferramentas/calculadoras/perc-rule', <CalculatorScreen id="perc-rule" />);

    expect(screen.queryByRole('navigation', { name: 'Caso de origem' })).not.toBeInTheDocument();
    expect(fromCaseBadges()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Anexar ao caso/ })).not.toBeInTheDocument();
  });

  it('o roteiro adulto abre com o peso do caso, até o médico trocar', async () => {
    const href = openFromCase({ kind: 'tool', toolId: 'choque-septico' }, 'Choque séptico');
    visit(href, <ChoqueSepticoPage />);

    const weight = screen.getByRole('textbox', { name: /Peso estimado/ });
    expect(weight).toHaveValue('73');
    expect(weight).toHaveAccessibleDescription(/vindo do caso/);

    await userEvent.clear(weight);
    await userEvent.type(weight, '80');
    expect(fromCaseBadges()).toHaveLength(0);
  });

  it('a Pediatria abre com o peso e a idade da criança', () => {
    const href = openFromCase({ kind: 'tool', toolId: 'pediatria' }, 'Emergência pediátrica', {
      ...FACTS,
      ageYears: 4,
      weightKg: 16,
    });
    visit(
      href,
      <PediatriaLayout>
        <PediatriaPage />
      </PediatriaLayout>,
    );

    expect(screen.getByRole('textbox', { name: /Peso/ })).toHaveValue('16');
    expect(screen.getByRole('textbox', { name: /Idade/ })).toHaveValue('4');
    expect(fromCaseBadges()).toHaveLength(2);
  });

  it('o Wells do roteiro de TEP abre com a FC do caso, sem avançar o roteiro', async () => {
    const href = openFromCase({ kind: 'tool', toolId: 'tep' }, 'Tromboembolismo pulmonar');
    visit(href, <TepPage />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Paciente hemodinamicamente estável' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Calcular Wells' }));

    const hr = group(/FC > 100 bpm/);
    expect(within(hr).getByRole('radio', { name: /^Sim/ })).toBeChecked();
    expect(within(hr).getByText('vindo do caso')).toBeInTheDocument();
    // O nível do Wells continua sem escolha: só o toque do médico avança.
    expect(screen.getByRole('radio', { name: 'Intermediária (2–6)' })).not.toBeChecked();
  });
});
