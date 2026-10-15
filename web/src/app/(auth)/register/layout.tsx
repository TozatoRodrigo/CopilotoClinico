import { Suspense } from 'react';

/**
 * CC-702 — o cadastro lê o código do link de convite (`?convite=`) com
 * `useSearchParams`, que pede um limite de Suspense para a página continuar
 * pré-renderizável.
 */
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
