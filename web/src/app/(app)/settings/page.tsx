'use client';

import { Suspense, useSyncExternalStore, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/lib/auth-store';
import { ProfileTab } from './_tabs/profile-tab';
import { SecurityTab } from './_tabs/security-tab';
import { PrivacyTab } from './_tabs/privacy-tab';
import SettingsLoading from './loading';
import { Gear, UserCircle, ShieldCheck, Lock } from '@phosphor-icons/react';
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

/**
 * Navegação vertical (como o modal de Settings do Notion) a partir de `md`;
 * abaixo disso, abas sublinhadas no topo. A orientação vai para o Radix para
 * as setas do teclado seguirem o layout (↑↓ na vertical, ←→ na horizontal).
 */
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

function SettingsShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { physician } = useAuth();
  const isDesktop = useIsDesktop();

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
    <Page width="default">
      <PageHeader
        icon={Gear}
        title="Configurações"
        description="Gerencie sua conta, segurança e privacidade."
      />

      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        orientation={isDesktop ? 'vertical' : 'horizontal'}
        className="w-full flex-col gap-8 md:flex-row md:items-start md:gap-12"
      >
        <nav aria-label="Seções das configurações" className="md:sticky md:top-16 md:w-48 md:shrink-0">
          <p className="mb-1.5 hidden px-2 text-xs font-medium text-muted-foreground md:block">
            Conta
          </p>
          {/* variant={null}: sem o sublinhado padrão — o estilo de item de
              sidebar (vertical) e o sublinhado (horizontal) vêm daqui. */}
          <TabsList
            variant={null}
            className="flex w-full gap-1 overflow-x-auto border-b border-border md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:border-b-0"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  disabled={isPending}
                  className="h-10 rounded-sm px-2.5 hover:bg-hover data-active:text-foreground group-data-horizontal/tabs:data-active:after:opacity-100 md:h-8 md:justify-start md:gap-2 md:rounded-md md:px-2 md:font-normal md:data-active:bg-active md:data-active:font-medium"
                >
                  <Icon className="size-4 md:size-[18px]" aria-hidden="true" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </nav>

        <div className="min-w-0 flex-1">
          <TabsContent value="perfil">
            <ProfileTab physician={physician} />
          </TabsContent>
          <TabsContent value="seguranca">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="privacidade">
            <PrivacyTab />
          </TabsContent>
        </div>
      </Tabs>
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsShell />
    </Suspense>
  );
}
