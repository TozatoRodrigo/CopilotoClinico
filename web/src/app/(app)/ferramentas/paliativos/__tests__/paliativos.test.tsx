import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import PaliativosPage from '../page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

async function openModule(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name }));
}

async function openScalesTab(name: string) {
  await openModule(/Ferramentas e escalas/);
  await userEvent.click(screen.getByRole('tab', { name }));
}

describe('/ferramentas/paliativos (CC-329)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/ferramentas/paliativos');
    window.scrollTo = vi.fn();
    window.localStorage.clear();
  });

  it('sai de "em breve" no hub e abre em um toque', () => {
    render(<FerramentasPage />);

    const group = screen.getByRole('region', { name: 'Paliativos' });
    expect(within(group).getByRole('link', { name: /Cuidados paliativos no PS/ })).toHaveAttribute(
      'href',
      '/ferramentas/paliativos',
    );
    expect(within(group).queryByText('Em breve')).not.toBeInTheDocument();
  });

  it('abre no início do roteiro, com o aviso fixo e os quatro passos', () => {
    render(<PaliativosPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Cuidados paliativos no PS' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    const steps = screen.getByRole('region', { name: 'Roteiro' });
    expect(
      within(steps)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      '1. IdentificarSPICT-BR',
      '2. DecidirSAVED',
      '3. ComunicarREDMAP / NURSE',
      '4. ManejarSintomas',
    ]);
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();
  });

  it('guarda a tela no endereço e volta com o voltar do navegador', async () => {
    render(<PaliativosPage />);

    await openModule(/Identificar/);
    expect(window.location.hash).toBe('#identificar');
    expect(screen.getByRole('region', { name: 'Identificar' })).toHaveTextContent(
      'Se 2 ou mais indicadores positivos, considere abordagem paliativa.',
    );

    act(() => {
      window.history.replaceState(null, '', '/ferramentas/paliativos#mitos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('region', { name: 'Mitos e verdades' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Início do roteiro' }));
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('region', { name: 'Roteiro' })).toBeInTheDocument();
  });

  it('abre direto na tela do endereço', () => {
    window.history.replaceState(null, '', '/ferramentas/paliativos#comunicar');
    render(<PaliativosPage />);

    expect(screen.getByRole('region', { name: 'Comunicar' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Módulos do roteiro' })).getByRole('button', {
        name: 'Comunicar',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('converte opioide ao vivo, com unidade, e mostra a orientação da metadona', async () => {
    render(<PaliativosPage />);
    await openScalesTab('Opioides');

    const dose = screen.getByRole('textbox', { name: /Dose atual/ });
    await userEvent.type(dose, '30');
    const result = () => screen.getByRole('region', { name: 'Resultado da conversão' });
    // Morfina VO → morfina VO: o ANY aplica os 75% também aqui.
    expect(result()).toHaveTextContent('22,5 mg/24 h');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Converter para' }),
      'morfina-ev',
    );
    expect(result()).toHaveTextContent('7,5 mg/24 h');
    expect(result()).toHaveTextContent('Equivalente de morfina VO: 30,0 mg/24 h');
    expect(
      within(result()).getByRole('button', { name: 'Copiar para o prontuário' }),
    ).toBeEnabled();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Converter para' }),
      'fentanil-ev',
    );
    expect(result()).toHaveTextContent('9,4 mcg/h');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Converter para' }),
      'metadona',
    );
    expect(result()).toHaveTextContent('A equivalência da metadona não é linear');
    expect(
      within(result()).getByRole('button', { name: 'Copiar para o prontuário' }),
    ).toBeDisabled();
  });

  it('recusa dose fora da faixa do opioide e não calcula', async () => {
    render(<PaliativosPage />);
    await openScalesTab('Opioides');

    await userEvent.type(screen.getByRole('textbox', { name: /Dose atual/ }), '5000');

    expect(screen.getByText('Fora da faixa aceita: 1 a 3000 mg/24 h.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resultado da conversão' })).toHaveTextContent(
      'Corrija a dose para ver a conversão.',
    );
  });

  it('PPI: começa sem resultado e calcula com os cinco itens', async () => {
    render(<PaliativosPage />);
    await openScalesTab('PPI');

    const result = () => screen.getByRole('region', { name: 'Resultado do PPI' });
    expect(result()).toHaveTextContent('Faltam 5 respostas');

    await userEvent.click(screen.getByRole('radio', { name: /10-20%/ }));
    await userEvent.click(screen.getByRole('radio', { name: /^Normal/ }));
    for (const group of ['Edema', 'Delirium']) {
      const fieldset = screen.getByRole('group', { name: group });
      await userEvent.click(within(fieldset).getByRole('radio', { name: /Ausente/ }));
    }
    const dyspnea = screen.getByRole('group', { name: 'Dispneia em Repouso' });
    await userEvent.click(within(dyspnea).getByRole('radio', { name: /Presente/ }));

    expect(result()).toHaveTextContent('7,5 pontos');
    expect(result()).toHaveTextContent('Prognóstico muito reservado');
    expect(result()).toHaveTextContent('Sobrevida mediana: ~5 dias');
  });

  it('ECOG: marcar um nível libera o texto para o prontuário', async () => {
    render(<PaliativosPage />);
    await openScalesTab('ECOG');

    const copy = screen.getByRole('button', { name: 'Copiar para o prontuário' });
    expect(copy).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /2 — <50% acamado/ }));
    expect(copy).toBeEnabled();
  });

  it('matriz de compatibilidade: 15 × 15 com a coluna DEX marcada "sem dado"', async () => {
    render(<PaliativosPage />);
    await openScalesTab('Hipodermóclise');
    await userEvent.click(screen.getByRole('tab', { name: 'Compatibilidade' }));

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(16);
    expect(within(table).getAllByText('sem dado, aguarda revisão')).toHaveLength(15);
    expect(screen.getByText('Matriz aguardando revisão clínica')).toBeInTheDocument();
  });

  it('busca medicação subcutânea sem acento', async () => {
    render(<PaliativosPage />);
    await openScalesTab('Hipodermóclise');
    await userEvent.click(screen.getByRole('tab', { name: 'Medicações' }));

    const list = () => screen.getByRole('list', { name: 'Medicações por via subcutânea' });
    expect(within(list()).getAllByRole('heading')).toHaveLength(19);

    const search = screen.getByRole('searchbox', { name: 'Buscar medicamento por via subcutânea' });
    await userEvent.type(search, 'escopolamina');
    expect(
      within(list())
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Escopolamina']);

    await userEvent.clear(search);
    await userEvent.type(search, 'xyz');
    expect(screen.getByText('Nenhum medicamento encontrado')).toBeInTheDocument();
  });

  it('mitos: abre um por vez e mostra o único que é verdade', async () => {
    render(<PaliativosPage />);
    await openModule(/Mitos e verdades/);

    await userEvent.click(screen.getByRole('button', { name: /Milagre acontece/ }));
    expect(screen.getByText('Verdade')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Morfina vicia/ }));
    expect(screen.queryByText('Verdade')).not.toBeInTheDocument();
    expect(screen.getByText('Mito')).toBeInTheDocument();
  });

  it('sintomas: troca de aba e mostra a tabela de medicação', async () => {
    render(<PaliativosPage />);
    await openModule(/Manejar/);

    await userEvent.click(screen.getByRole('tab', { name: 'Náusea' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('columnheader', { name: 'Causa' })).toBeInTheDocument();
    expect(within(panel).getByRole('row', { name: /Ondansetrona/ })).toHaveTextContent(
      'Geral / QT',
    );
  });
});
