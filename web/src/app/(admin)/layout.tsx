'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { AdminShell } from '@/components/layout/admin-shell';
import { LogoMark } from '@/components/brand/logo';
import { useLegalTermsGate } from '@/components/layout/legal-terms-gate';
import { toast } from 'sonner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const router = useRouter();
  // CC-905 — o console também passa pelo aceite dos termos novos.
  useLegalTermsGate(!isLoading && isAuthenticated && role !== 'physician');

  useEffect(() => {
    // Só decide DEPOIS que o estado de auth terminou de carregar do
    // localStorage (isLoading false). Antes, o efeito deste layout rodava
    // antes do AuthProvider hidratar e mandava todo carregamento direto de
    // /admin/* para /login (que, autenticado, cai no /dashboard).
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push('/login?from=/admin');
      return;
    }

    if (role === 'physician') {
      toast.error('Acesso negado: o console administrativo é restrito a Compliance e Admin.');
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, role, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
        <LogoMark size="lg" className="animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated || role === 'physician') {
    return null;
  }

  return <AdminShell>{children}</AdminShell>;
}
