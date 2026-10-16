'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLegalStatus } from '@/lib/legal-queries';
import { legalAcceptanceHref } from '@/lib/legal-paths';

/**
 * CC-905 — quem ainda não aceitou a versão vigente dos termos e da política
 * (LEGAL_TERMS_V2 ligada) vai para a tela de aceite assim que entra no app ou
 * no console, antes de ver uma tela quebrada pelos 428 da API. Com a flag
 * desligada a API responde `acceptanceRequired: false` e nada acontece; se a
 * consulta falhar, o app segue e a própria API continua barrando.
 */
export function useLegalTermsGate(enabled: boolean): void {
  const router = useRouter();
  const pathname = usePathname();
  const status = useLegalStatus(enabled);
  const acceptanceRequired = status.data?.acceptanceRequired === true;

  useEffect(() => {
    if (enabled && acceptanceRequired) {
      router.replace(legalAcceptanceHref(pathname));
    }
  }, [enabled, acceptanceRequired, pathname, router]);
}
