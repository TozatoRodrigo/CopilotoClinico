"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { AppShell } from "@/components/layout/app-shell";
import { LogoMark } from "@/components/brand/logo";
import { useLegalTermsGate } from "@/components/layout/legal-terms-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  // CC-905 — termos e política novos: tela de aceite antes do app.
  useLegalTermsGate(!isLoading && isAuthenticated);

  useEffect(() => {
    // Só redireciona DEPOIS que o estado de auth terminou de carregar
    // (isLoading false). Evita redirect prematuro na hidratação.
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Loading state enquanto verifica localStorage — evita flash de
  // "não autenticado" e previne mismatch de hidratação (AppShell
  // não renderiza durante a fase de hidratação).
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
        <LogoMark size="lg" className="animate-pulse" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
