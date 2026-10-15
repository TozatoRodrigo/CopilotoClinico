import { notFound } from 'next/navigation';
import { CALCULATOR_CATALOG } from '@clinical-tools/calculator-catalog';
import { CalculatorScreen } from '../../_components/calculator-screen';

// As 75 calculadoras do catálogo são pré-renderizadas no build (base do
// offline do CC-322). Id fora do catálogo vira 404 aqui, e não por
// `dynamicParams = false`: este faz o Next 16 registrar um NoFallbackError
// no log de erro a cada endereço digitado errado.
export function generateStaticParams() {
  return CALCULATOR_CATALOG.map(({ id }) => ({ id }));
}

export default async function CalculatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CALCULATOR_CATALOG.some((calculator) => calculator.id === id)) notFound();
  return <CalculatorScreen id={id} />;
}
