import { Suspense } from 'react';
import { InfusionsScreen, InfusionsScreenFallback } from './_components/infusions-screen';

/**
 * /ferramentas/infusoes — Infusões contínuas (CC-311). A tela lê `?droga=` no
 * cliente; o Suspense deixa o resto da rota ser pré-renderizado no build
 * (base do offline do CC-322).
 */
export default function InfusoesPage() {
  return (
    <Suspense fallback={<InfusionsScreenFallback />}>
      <InfusionsScreen />
    </Suspense>
  );
}
