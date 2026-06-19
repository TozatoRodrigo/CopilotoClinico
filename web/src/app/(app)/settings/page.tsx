'use client';

import { Suspense, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-store';
import { ProfileTab } from './_tabs/profile-tab';
import { SecurityTab } from './_tabs/security-tab';
import { PrivacyTab } from './_tabs/privacy-tab';
import {
  UserCircle,
  ShieldCheck,
  Lock,
} from '@phosphor-icons/react';
import type { ComponentType, SVGProps } from 'react';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * S24-SET-01 — tabs de settings. Antes incluía 'assinatura' (placeholder
 * morto com copy de milestone "D2/D3") e 3 componentes duplicados não usados
 * (PerfilTab, SegurancaTab, AssinaturaTab). Removidos: código morto confunde
 * na revisão e dá impressão de incompleto.
 *
 * Assinatura volta quando houver modelo de cobrança real (Sprint 25+ ou
 * conforme definição de negócio).
 */
const TABS: { id: string; label: string; icon: IconType }[] = [
  { id: 'perfil', label: 'Perfil', icon: UserCircle },
  { id: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  { id: 'privacidade', label: 'Privacidade', icon: Lock },
];

const VALID_TABS = TABS.map((t) => t.id);

function SettingsShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { physician } = useAuth();

  const tabParam = searchParams.get('tab');
  const currentTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'perfil';

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    startTransition(() => {
      router.push(`/settings?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta, segurança e privacidade."
      >
        <Button variant="outline" asChild>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </PageHeader>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-clinical-line bg-clinical-paper p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                disabled={isPending}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <ProfileTab physician={physician} />
        </TabsContent>
        <TabsContent value="seguranca" className="mt-6">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="privacidade" className="mt-6">
          <PrivacyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="size-5 animate-spin rounded-full border-2 border-clinical-line border-t-clinical-teal" />
        </div>
      }
    >
      <SettingsShell />
    </Suspense>
  );
}
