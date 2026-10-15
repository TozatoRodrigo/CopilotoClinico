import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalculatorScreen } from '../_components/calculator-screen';

// Com as 75 portadas (CC-309), nenhuma calculadora do catálogo cai no "em
// breve". O registro vazio simula a próxima que entrar no catálogo antes de
// ser portada: a rota existe e não pode quebrar.
vi.mock('@clinical-tools/registry', () => ({
  CALCULATORS: [],
  getCalculator: () => undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ferramentas/calculadoras/nihss',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('/ferramentas/calculadoras/[id] — calculadora ainda não portada', () => {
  it("mostra 'em breve' com o aviso fixo e o caminho de volta", () => {
    render(<CalculatorScreen id="nihss" />);

    expect(screen.getByRole('heading', { level: 1, name: 'NIHSS' })).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver calculadoras disponíveis' })).toHaveAttribute(
      'href',
      '/ferramentas/calculadoras',
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
