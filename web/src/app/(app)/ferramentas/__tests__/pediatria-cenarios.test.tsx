import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getPediatricScenario } from '@clinical-tools/pediatrics/scenarios';
import PediatriaLayout from '../pediatria/layout';
import { ScenarioScreen } from '../pediatria/_components/scenario-screen';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/pediatria/cenarios/anafilaxia',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderScenario(id: string) {
  const scenario = getPediatricScenario(id);
  if (!scenario) throw new Error(`cenário ${id} não existe`);
  return render(
    <PediatriaLayout>
      <ScenarioScreen scenario={scenario} />
    </PediatriaLayout>,
  );
}

describe('/ferramentas/pediatria/cenarios/[id] (CC-320)', () => {
  it('anafilaxia mostra só as três drogas do cenário, com dose pelo peso', async () => {
    renderScenario('anafilaxia');
    expect(screen.getByRole('heading', { level: 1, name: 'Anafilaxia' })).toBeInTheDocument();
    expect(
      screen.getByText('Doses aguardando assinatura da fonte única (CC-321).'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '20');
    const medications = screen.getByRole('region', { name: /Medicações/ });
    const cards = within(medications).getAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'EPINEFRINA IM (Anafilaxia)',
      'HIDROCORTISONANão rotineiro',
      'DIFENIDRAMINANão rotineiro',
    ]);
    // Adrenalina IM sem diluir: dose em mg e volume em mL dão o mesmo número.
    expect(within(cards[0]!).getAllByText('0,20')).toHaveLength(2);
  });

  it('sem peso, a idade estima o peso do cenário e marca como estimado', async () => {
    renderScenario('anafilaxia');
    await userEvent.type(screen.getByRole('textbox', { name: /Idade/ }), '1');
    const status = screen.getByText(/Peso em uso/).closest('p');
    expect(status).toHaveTextContent('10 kg');
    expect(status).toHaveTextContent('Estimado');
    expect(within(screen.getAllByRole('article')[0]!).getAllByText('0,10')).toHaveLength(2);
  });

  it('choque mostra fluidos e as três infusões abertas, na faixa do peso', async () => {
    renderScenario('choque');
    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '10');
    expect(screen.getByRole('region', { name: /Fluidos e volumes/ })).toHaveTextContent('200');
    for (const name of ['EPINEFRINA', 'NOREPINEFRINA', 'DOBUTAMINA']) {
      expect(screen.getByRole('region', { name: `Preparo de ${name}` })).toHaveTextContent(
        'Preparo para < 15 kg',
      );
    }
  });

  it('IOT/ISR traz o checklist com o material da cor', async () => {
    renderScenario('iot-isr');
    await userEvent.click(screen.getByRole('radio', { name: /Azul/ }));
    const checklist = screen.getByRole('region', { name: /Checklist de intubação/ });
    expect(within(checklist).getByText('5 e 4,5')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });
});
