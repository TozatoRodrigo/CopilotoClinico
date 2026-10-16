'use client';

import { useState } from 'react';
import { ChartLineUp, EnvelopeSimple, Ticket, UsersThree, type Icon } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { ActivationPanel } from './_components/activation-panel';
import { InvitesPanel } from './_components/invites-panel';
import { WaitlistPanel } from './_components/waitlist-panel';

type Tab = 'invites' | 'waitlist' | 'activation';

const TABS: { value: Tab; label: string; icon: Icon; adminOnly: boolean }[] = [
  { value: 'invites', label: 'Convites', icon: Ticket, adminOnly: true },
  { value: 'waitlist', label: 'Lista de espera', icon: UsersThree, adminOnly: true },
  { value: 'activation', label: 'Ativação', icon: ChartLineUp, adminOnly: false },
];

/**
 * CC-702 — console do beta: lotes de convites (uso único ou com limite,
 * validade, origem), usos, lista de espera (aprovar gera convite; apagar
 * atende o pedido da pessoa) e a ativação em 24 h. Convites e lista trazem
 * e-mails: só Admin. Compliance vê a ativação (só contagens).
 */
export default function BetaAdminPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const tabs = TABS.filter((tab) => isAdmin || !tab.adminOnly);
  const [active, setActive] = useState<Tab>(isAdmin ? 'invites' : 'activation');

  return (
    <Page width="wide">
      <PageHeader
        icon={EnvelopeSimple}
        title="Beta"
        description="Convites por lote, lista de espera e ativação. O sistema não envia e-mail: copie o link do convite e mande pelo seu canal."
      />

      <Tabs
        value={active}
        onValueChange={(value) => {
          const next = tabs.find((tab) => tab.value === value);
          if (next) setActive(next.value);
        }}
        className="gap-0"
      >
        <TabsList aria-label="Seções do beta" className="max-sm:w-full max-sm:overflow-x-auto">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                <TabIcon aria-hidden="true" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {isAdmin && (
          <>
            <TabsContent value="invites" className="pt-6">
              <InvitesPanel />
            </TabsContent>
            <TabsContent value="waitlist" className="pt-6">
              <WaitlistPanel />
            </TabsContent>
          </>
        )}
        <TabsContent value="activation" className="pt-6">
          <ActivationPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
