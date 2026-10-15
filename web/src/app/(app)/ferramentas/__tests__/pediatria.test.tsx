import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PediatriaLayout from '../pediatria/layout';
import PediatriaPage from '../pediatria/page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/pediatria',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function renderScreen() {
  return render(
    <PediatriaLayout>
      <PediatriaPage />
    </PediatriaLayout>,
  );
}

function drugCard(name: string): HTMLElement {
  const card = screen
    .getAllByRole('article')
    .find((article) => within(article).queryByRole('heading', { name: new RegExp(`^${name}`) }));
  if (!card) throw new Error(`cartão ${name} não está na tela`);
  return card;
}

async function openGroup(title: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
}

async function typeWeight(value: string) {
  const field = screen.getByRole('textbox', { name: /Peso/ });
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

describe('/ferramentas/pediatria (CC-319)', () => {
  beforeEach(() => window.localStorage.clear());

  it('avisa que as doses aguardam a assinatura da fonte única', () => {
    renderScreen();
    expect(screen.getByRole('note')).toHaveTextContent('Apoio à decisão');
    expect(
      screen.getByText('Doses aguardando assinatura da fonte única (CC-321).'),
    ).toBeInTheDocument();
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('sem peso não calcula e pede o peso ou a cor', async () => {
    renderScreen();
    await openGroup('Drogas de parada cardiorrespiratória');
    expect(
      within(drugCard('EPINEFRINA IV/IO')).getByText(
        'Informe o peso ou a cor de Broselow para calcular.',
      ),
    ).toBeInTheDocument();
  });

  it('com peso aferido calcula dose, volume e teto, e acha a cor de Broselow', async () => {
    renderScreen();
    await typeWeight('12');
    await openGroup('Drogas de parada cardiorrespiratória');

    const status = screen.getByText(/Peso em uso/).closest('p');
    expect(status).toHaveTextContent('12 kg');
    expect(status).toHaveTextContent('Aferido');
    expect(status).toHaveTextContent('Broselow Amarelo');

    const epinephrine = drugCard('EPINEFRINA IV/IO');
    expect(within(epinephrine).getByText('0,12')).toBeInTheDocument();
    expect(within(epinephrine).getByText('1,2')).toBeInTheDocument();
    expect(within(epinephrine).getByText('Teto: 1 mg')).toBeInTheDocument();
    expect(within(epinephrine).getByText('da solução 0,1 mg/mL')).toBeInTheDocument();
  });

  it('mostra o material de via aérea da cor em uso', async () => {
    renderScreen();
    await typeWeight('12');
    const airway = screen.getByRole('region', { name: 'Via aérea e equipamentos' });
    expect(within(airway).getByText('Faixa Amarelo da fita de Broselow')).toBeInTheDocument();
    expect(within(airway).getByText('Tubo traqueal').nextSibling).toHaveTextContent('4,0');
  });

  it('peso fora de 0,5 a 50 kg é erro e nenhuma dose é calculada', async () => {
    renderScreen();
    await typeWeight('60');
    await openGroup('Drogas de parada cardiorrespiratória');

    expect(screen.getByText('Fora da faixa aceita: 0,5 a 50 kg.')).toBeInTheDocument();
    expect(
      screen.getByText('Peso fora da faixa aceita: nenhuma dose é calculada.'),
    ).toBeInTheDocument();
    expect(
      within(drugCard('EPINEFRINA IV/IO')).getByText(
        'Informe o peso ou a cor de Broselow para calcular.',
      ),
    ).toBeInTheDocument();
  });

  it('a cor de Broselow dá o peso marcado como estimado', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('radio', { name: /Roxo/ }));

    expect(screen.getByRole('radio', { name: /Roxo/ })).toHaveAttribute('aria-checked', 'true');
    const status = screen.getByText(/Peso em uso/).closest('p');
    expect(status).toHaveTextContent('10 kg');
    expect(status).toHaveTextContent('Estimado');
    expect(status).toHaveTextContent('estimado pela cor de Broselow');
    expect(status).toHaveTextContent('Idade estimada pela cor: 10 meses');
  });

  it('avisa neonato abaixo de 3 kg, em forma de sugestão', async () => {
    renderScreen();
    await typeWeight('2,5');
    expect(
      screen.getByText(
        'Peso abaixo de 3 kg: considere o protocolo específico de reanimação neonatal.',
      ),
    ).toBeInTheDocument();
  });

  it('droga não rotineira tem o selo e o aviso', async () => {
    renderScreen();
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar droga em bolus' }),
      'bicarbonato',
    );

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    const pcr = drugCard('BICARBONATO DE SÓDIO 8,4%');
    expect(within(pcr).getByText('Não rotineiro')).toBeInTheDocument();
    expect(within(pcr).getByText(/Sem indicação de rotina/)).toBeInTheDocument();
  });

  it('marca quando a dose bate no teto', async () => {
    renderScreen();
    await typeWeight('40');
    await openGroup('Drogas de intubação');
    const midazolam = drugCard('MIDAZOLAM');
    expect(within(midazolam).getByText('10,0')).toBeInTheDocument();
    expect(within(midazolam).getByText('teto atingido')).toBeInTheDocument();
  });

  it('anti-histamínico pede a idade antes de calcular', async () => {
    renderScreen();
    await typeWeight('16');
    await openGroup('Anti-histamínicos por idade');
    expect(
      within(drugCard('LORATADINA')).getByText('Informe a idade para calcular.'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Idade/ }), '4');
    expect(within(drugCard('LORATADINA')).getByText('5')).toBeInTheDocument();
  });

  it('infusão: dose → mL/h na faixa do peso, dose fora da faixa é erro, e conta inversa', async () => {
    renderScreen();
    await typeWeight('10');
    await userEvent.click(screen.getByRole('button', { name: /DOBUTAMINA/ }));

    const preparation = screen.getByRole('region', { name: 'Preparo de DOBUTAMINA' });
    expect(preparation).toHaveTextContent('Preparo para < 15 kg');
    expect(preparation).toHaveTextContent('10 mL + diluente 60 mL = 70 mL');
    expect(preparation).toHaveTextContent('1,8 mg/mL');
    expect(screen.getByText('1,7')).toBeInTheDocument();

    const dose = screen.getByRole('textbox', { name: /^Dose/ });
    await userEvent.clear(dose);
    await userEvent.type(dose, '25');
    expect(screen.getByText('Fora da faixa aceita: 2,5 a 20 mcg/kg/min.')).toBeInTheDocument();
    expect(screen.getByText(/Digite a dose dentro de/)).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Vazão que já está correndo/ }),
      '3,4',
    );
    expect(screen.getByText('10,1')).toBeInTheDocument();
  });
});
