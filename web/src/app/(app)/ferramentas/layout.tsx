import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isFerramentasEnabled } from '@/lib/feature-flags';

/**
 * ADR-017 — com `NEXT_PUBLIC_FERRAMENTAS` desligada a área não existe: toda
 * rota de /ferramentas responde 404, e o menu também não mostra o item.
 */
export default function FerramentasLayout({ children }: { children: ReactNode }) {
  if (!isFerramentasEnabled()) notFound();
  return children;
}
