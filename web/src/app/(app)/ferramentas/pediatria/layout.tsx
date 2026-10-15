import type { ReactNode } from 'react';
import { PediatricSessionProvider } from './_components/pediatric-session';

/**
 * O peso da criança vale para todas as telas de Pediatria (lista e
 * cenários): o layout não remonta ao navegar entre elas, então o estado fica
 * aqui. Sair de /ferramentas/pediatria limpa tudo.
 */
export default function PediatriaLayout({ children }: { children: ReactNode }) {
  return <PediatricSessionProvider>{children}</PediatricSessionProvider>;
}
