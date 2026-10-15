import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumericField } from '../numeric-field';
import { WeightField } from '../weight-field';

function ControlledNumeric({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <NumericField
      label="Frequência cardíaca"
      unit="bpm"
      range={{ min: 30, max: 250 }}
      value={value}
      onValueChange={setValue}
    />
  );
}

function ControlledWeight({ population }: { population: 'adulto' | 'pediatrico' }) {
  const [value, setValue] = useState('');
  return <WeightField population={population} value={value} onValueChange={setValue} />;
}

describe('NumericField (CC-305)', () => {
  it('tem nome acessível com a unidade e descreve a faixa aceita', () => {
    render(<ControlledNumeric />);

    const input = screen.getByRole('textbox', { name: 'Frequência cardíaca (bpm)' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAccessibleDescription('Faixa aceita: 30 a 250 bpm.');
    // A unidade também fica visível dentro do campo.
    expect(screen.getByText('bpm')).toBeVisible();
  });

  it('aceita vírgula decimal sem acusar erro', async () => {
    render(<ControlledNumeric />);
    const input = screen.getByRole('textbox', { name: /Frequência cardíaca/ });

    await userEvent.type(input, '72,5');
    fireEvent.blur(input);

    expect(input).toHaveValue('72,5');
    expect(input).not.toBeInvalid();
  });

  it('acusa na hora valor acima do máximo, sem esperar sair do campo', async () => {
    render(<ControlledNumeric />);
    const input = screen.getByRole('textbox', { name: /Frequência cardíaca/ });

    await userEvent.type(input, '300');

    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(/Fora da faixa aceita: 30 a 250 bpm\./);
  });

  it('espera sair do campo para acusar valor abaixo do mínimo (o 2 ainda pode virar 25)', async () => {
    render(<ControlledNumeric />);
    const input = screen.getByRole('textbox', { name: /Frequência cardíaca/ });

    await userEvent.type(input, '2');
    expect(input).not.toBeInvalid();

    fireEvent.blur(input);
    expect(input).toBeInvalid();
    expect(screen.getByText('Fora da faixa aceita: 30 a 250 bpm.')).toBeInTheDocument();
  });

  it('recusa ponto com cara de milhar', async () => {
    render(<ControlledNumeric />);
    const input = screen.getByRole('textbox', { name: /Frequência cardíaca/ });

    await userEvent.type(input, '1.500');

    expect(input).toBeInvalid();
    expect(screen.getByText(/não use ponto de milhar/)).toBeInTheDocument();
  });
});

describe('WeightField (CC-305)', () => {
  it('adulto: 40 a 200 kg', async () => {
    render(<ControlledWeight population="adulto" />);
    const input = screen.getByRole('textbox', { name: 'Peso (kg)' });
    expect(input).toHaveAccessibleDescription('Adulto: 40 a 200 kg.');

    await userEvent.type(input, '201');
    expect(input).toBeInvalid();
    expect(screen.getByText('Fora da faixa aceita: 40 a 200 kg.')).toBeInTheDocument();
  });

  it('pediátrico: 0,5 a 50 kg, com vírgula', async () => {
    render(<ControlledWeight population="pediatrico" />);
    const input = screen.getByRole('textbox', { name: 'Peso (kg)' });
    expect(input).toHaveAccessibleDescription('Pediátrico: 0,5 a 50 kg.');

    await userEvent.type(input, '0,5');
    fireEvent.blur(input);
    expect(input).not.toBeInvalid();

    await userEvent.clear(input);
    await userEvent.type(input, '0,4');
    fireEvent.blur(input);
    expect(input).toBeInvalid();
    expect(screen.getByText('Fora da faixa aceita: 0,5 a 50 kg.')).toBeInTheDocument();
  });
});
