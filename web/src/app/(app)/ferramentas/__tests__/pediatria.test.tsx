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
    expect(
      screen.getByText(/PedGuide\.tsx \(95c8fba\).*revisão clínica pendente/),
    ).toBeInTheDocument();
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

function weightStatus(): HTMLElement | null {
  return screen.getByText(/Peso em uso/).closest('p');
}

describe('/ferramentas/pediatria — estimativa de peso e apoio (CC-320)', () => {
  beforeEach(() => window.localStorage.clear());

  it('sem balança, o comprimento estima o peso e marca como estimado', async () => {
    renderScreen();
    await userEvent.type(screen.getByRole('textbox', { name: /Comprimento/ }), '100');
    expect(weightStatus()).toHaveTextContent('16 kg');
    expect(weightStatus()).toHaveTextContent('Estimado');
    expect(weightStatus()).toHaveTextContent('estimado pelo comprimento');
  });

  it('só com a idade, estima o peso pelo APLS e mostra acessos e drenos', async () => {
    renderScreen();
    await userEvent.type(screen.getByRole('textbox', { name: /Idade/ }), '3');
    expect(weightStatus()).toHaveTextContent('14 kg');
    expect(weightStatus()).toHaveTextContent('estimado pela idade (APLS)');
    expect(screen.getByText('Cateter venoso central').nextSibling).toHaveTextContent('5 Fr/20G');
  });

  it('o peso aferido manda sobre a estimativa', async () => {
    renderScreen();
    await userEvent.type(screen.getByRole('textbox', { name: /Idade/ }), '3');
    await typeWeight('11');
    expect(weightStatus()).toHaveTextContent('11 kg');
    expect(weightStatus()).toHaveTextContent('Aferido');
  });

  it('comprimento fora de 40 a 160 cm é erro e não calcula', async () => {
    renderScreen();
    await userEvent.type(screen.getByRole('textbox', { name: /Comprimento/ }), '170');
    expect(
      screen.getByText('Comprimento fora da faixa aceita: nenhuma dose é calculada.'),
    ).toBeInTheDocument();
  });

  it('lista os sete cenários com link para a tela de cada um', () => {
    renderScreen();
    const scenarios = screen.getByRole('region', { name: /Cenários/ });
    expect(within(scenarios).getAllByRole('link')).toHaveLength(7);
    expect(within(scenarios).getByRole('link', { name: /Anafilaxia/ })).toHaveAttribute(
      'href',
      '/ferramentas/pediatria/cenarios/anafilaxia',
    );
  });

  it('PCR, fluidos, transfusão e PAS mínima pelo peso e pela idade', async () => {
    renderScreen();
    await typeWeight('12');
    await userEvent.type(screen.getByRole('textbox', { name: /Idade/ }), '4');

    const cpr = screen.getByRole('region', { name: /PCR pediátrica/ });
    expect(within(cpr).getByText('1ª desfibrilação (2 J/kg)').nextSibling).toHaveTextContent('24');
    expect(within(cpr).getByText('Profundidade').nextSibling).toHaveTextContent('1/3 AP (~5cm)');
    expect(within(cpr).getByText('Refratária: 2 J/kg (24 J)')).toBeInTheDocument();

    const fluids = screen.getByRole('region', { name: /Fluidos e transfusão/ });
    expect(
      within(fluids).getByText('Bolus de cristaloide (20 mL/kg)').nextSibling,
    ).toHaveTextContent('240');
    expect(within(fluids).getByText('Manutenção (Holliday-Segar)').nextSibling).toHaveTextContent(
      '44',
    );
    expect(within(fluids).getByText(/Considere ativar com perda/)).toBeInTheDocument();

    expect(screen.getByText(/PAS mínima estimada/)).toHaveTextContent('78 mmHg');
  });

  it('checklist de intubação mostra o material da cor e marca os itens', async () => {
    renderScreen();
    await typeWeight('12');
    const checklist = screen.getByRole('region', { name: /Checklist de intubação/ });
    expect(within(checklist).getByText('Lâmina 2')).toBeInTheDocument();
    expect(within(checklist).getByText('4 e 3,5')).toBeInTheDocument();
    const item = within(checklist).getByRole('checkbox', { name: /Acesso venoso pérvio/ });
    await userEvent.click(item);
    expect(item).toBeChecked();
  });
});
