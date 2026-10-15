'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

function Reader({ name, onValue }: { name: string; onValue: (value: string) => void }) {
  const value = useSearchParams().get(name);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!value || applied.current === value) return;
    applied.current = value;
    onValue(value);
  }, [value, onValue]);
  return null;
}

/**
 * Lê um parâmetro do endereço uma vez e entrega à tela (`?aba=vti` abre o
 * choque indiferenciado na aba da calculadora que levou até lá, CC-331). O
 * resto do estado continua vindo da sessão da aba. O Suspense deixa a página
 * ser pré-renderizada no build, como pede o offline (CC-322).
 */
export function AddressParam({
  name,
  onValue,
}: {
  name: string;
  onValue: (value: string) => void;
}) {
  return (
    <Suspense fallback={null}>
      <Reader name={name} onValue={onValue} />
    </Suspense>
  );
}
