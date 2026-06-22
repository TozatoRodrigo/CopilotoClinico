"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

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
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
