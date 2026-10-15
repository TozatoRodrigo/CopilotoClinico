'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { readToolReturn } from '@clinical-tools/links';

function ReturnLink() {
  const target = readToolReturn(useSearchParams());
  if (!target) return null;
  return (
    <nav aria-label="Voltar à ferramenta anterior" className="mx-auto mb-4 w-full max-w-[720px]">
      <Link
        href={target.href}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-link transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        Voltar para {target.label}
      </Link>
    </nav>
  );
}

/**
 * "Voltar para Choque séptico" no topo da ferramenta aberta por outra (CC-331),
 * pelo `?de=` do endereço. O roteiro de origem guarda o estado na sessão da
 * aba e reabre no mesmo passo. No app instalado não há o "voltar" do
 * navegador; este é o caminho de volta. O Suspense deixa o resto da página
 * ser pré-renderizado no build (o endereço só existe no cliente).
 */
export function ToolReturnLink() {
  return (
    <Suspense fallback={null}>
      <ReturnLink />
    </Suspense>
  );
}
