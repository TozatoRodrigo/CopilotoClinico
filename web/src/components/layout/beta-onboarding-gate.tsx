'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { useBetaMe } from '@/lib/beta-queries';

/**
 * CC-702 — quem entrou no beta por convite e ainda não aceitou o termo em
 * vigor (ou não informou o perfil) volta ao onboarding do beta. Vale para
 * qualquer caminho de entrada: cadastro por senha, login social (CC-334) ou
 * uma versão nova do termo. Conta sem convite não é afetada; se a consulta
 * falhar, o app segue normalmente.
 */
export function BetaOnboardingGate() {
  const { role } = useAuth();
  const router = useRouter();
  const me = useBetaMe(role === 'physician');

  useEffect(() => {
    if (me.data?.participant && me.data.needsOnboarding) {
      router.replace('/onboarding/beta');
    }
  }, [me.data, router]);

  return null;
}
