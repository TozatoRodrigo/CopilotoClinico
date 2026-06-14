'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { AdminShell } from '@/components/layout/admin-shell';
import { toast } from 'sonner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?from=/admin');
      return;
    }

    if (role === 'physician') {
      toast.error('Acesso negado: o console administrativo é restrito a Compliance e Admin.');
      router.push('/dashboard');
    }
  }, [isAuthenticated, role, router]);

  if (!isAuthenticated || role === 'physician') {
    return null;
  }

  return <AdminShell>{children}</AdminShell>;
}
