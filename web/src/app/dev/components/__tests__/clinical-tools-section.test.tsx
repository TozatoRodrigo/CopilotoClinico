import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalToolsSection } from '../_components/clinical-tools';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

/**
 * CC-305 — acessibilidade dos componentes das Ferramentas como aparecem no
 * playground /dev/components: todo controle com nome acessível, rádios em
 * grupos nomeados, descrições que apontam para elementos reais, resultado
 * anunciado (`status`) e nenhuma cor fora dos tokens.
 */
describe('playground — Ferramentas clínicas (CC-305)', () => {
  function renderSection() {
    const view = render(<ClinicalToolsSection />);
    const section = screen.getByRole('region', { name: 'Ferramentas clínicas' });
    return { ...view, section };
  }

  it('mostra todos os componentes novos', () => {
    const { section } = renderSection();

    for (const title of [
      'Aviso fixo',
      'Campo numérico e campo de peso',
      'Itens de escore com resultado ao vivo',
      'Caixa de resultado',
      'Copiar para o prontuário',
      'Seção de referência',
      'Calculadora completa',
    ]) {
      expect(within(section).getByRole('heading', { name: title, level: 3 })).toBeInTheDocument();
    }
  });

  it('dá nome acessível a todo campo, rádio e botão', () => {
    const { section } = renderSection();
    const controls = [
      ...within(section).getAllByRole('textbox'),
      ...within(section).getAllByRole('radio'),
      ...within(section).getAllByRole('button'),
    ];

    expect(controls.length).toBeGreaterThan(20);
    for (const control of controls) expect(control).toHaveAccessibleName();
  });

  it('agrupa cada item de escore num grupo com nome (fieldset + legend)', () => {
    const { section } = renderSection();

    for (const radio of within(section).getAllByRole('radio')) {
      const group = radio.closest('fieldset');
      expect(group).not.toBeNull();
      expect(group).toHaveAccessibleName();
    }
  });

  it('não repete id e toda descrição aponta para um elemento que existe', () => {
    const { container } = renderSection();
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const element of container.querySelectorAll('[aria-describedby]')) {
      for (const id of element.getAttribute('aria-describedby')?.split(' ') ?? []) {
        expect(container.querySelector(`#${CSS.escape(id)}`), id).not.toBeNull();
      }
    }
  });

  it('anuncia os resultados e o aviso fixo', () => {
    const { section } = renderSection();

    expect(within(section).getAllByRole('status').length).toBeGreaterThanOrEqual(6);
    for (const note of within(section).getAllByRole('note')) {
      expect(note).toHaveTextContent('Apoio à decisão; não substitui o julgamento clínico.');
    }
  });

  it('marca o campo inválido para o leitor de tela', async () => {
    const { section } = renderSection();
    const heartRate = within(section).getAllByRole('textbox', { name: /Frequência cardíaca/ })[0];
    if (!heartRate) throw new Error('campo de FC ausente');

    await userEvent.clear(heartRate);
    await userEvent.type(heartRate, '300');

    expect(heartRate).toBeInvalid();
    expect(heartRate).toHaveAccessibleDescription(/Fora da faixa aceita/);
  });

  it('não usa cor inline: tudo vem dos tokens do design system', () => {
    const { container } = renderSection();
    const inlineColors = [...container.querySelectorAll<HTMLElement>('[style]')].filter((element) =>
      /color|background/i.test(element.getAttribute('style') ?? ''),
    );
    expect(inlineColors).toEqual([]);
  });
});
