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
  CreditCard,
  SealCheck,
  SealQuestion,
  IdentificationCard,
} from '@phosphor-icons/react';
import type { ComponentType, SVGProps } from 'react';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const TABS: { id: string; label: string; icon: IconType }[] = [
  { id: 'perfil', label: 'Perfil', icon: UserCircle },
  { id: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  { id: 'privacidade', label: 'Privacidade', icon: Lock },
  { id: 'assinatura', label: 'Assinatura', icon: CreditCard },
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
        description="Gerencie sua conta, segurança, privacidade e assinatura."
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
        <TabsContent value="assinatura" className="mt-6">
          <AssinaturaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: IconType;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-clinical-ink">{value}</p>
      </div>
      {children}
    </div>
  );
}

function PerfilTab({ physician }: { physician: ReturnType<typeof useAuth>['physician'] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">Identificação</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Seus dados de cadastro. Nome será editável em D2; e-mail e CRM são fixos.
        </p>
      </div>
      <div className="grid gap-3">
        <ProfileRow icon={UserCircle} label="Nome" value={physician?.name ?? 'Não informado'} />
        <ProfileRow icon={IdentificationCard} label="E-mail" value={physician?.email ?? '—'} />
        <ProfileRow
          icon={physician?.crmVerified ? SealCheck : SealQuestion}
          label="CRM"
          value={physician ? `${physician.crmUf} ${physician.crmNumber}` : '—'}
        >
          {physician?.crmVerified ? (
            <span className="rounded-full bg-clinical-green-bg px-2 py-0.5 text-xs font-medium text-clinical-green-foreground">
              Verificado
            </span>
          ) : (
            <Link
              href="/verificacao-crm"
              className="rounded-full bg-clinical-amber-bg px-2 py-0.5 text-xs font-medium text-clinical-amber-foreground hover:underline"
            >
              Pendente — verificar
            </Link>
          )}
        </ProfileRow>
      </div>
    </div>
  );
}

function SegurancaTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">Segurança da conta</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          MFA, alteração de senha e sessões ativas (D3).
        </p>
      </div>
      <div className="grid gap-3">
        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-clinical-teal" />
          <div className="flex-1">
            <p className="text-sm font-medium text-clinical-ink">Autenticação de dois fatores</p>
            <p className="text-xs text-muted-foreground">Ativa — configurada no onboarding</p>
          </div>
          <span className="rounded-full bg-clinical-green-bg px-2 py-0.5 text-xs font-medium text-clinical-green-foreground">
            Ativa
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <Lock className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium text-clinical-ink">Senha</p>
            <p className="text-xs text-muted-foreground">
              Altere periodicamente para maior segurança
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssinaturaTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-clinical-amber/30 bg-clinical-amber-bg p-5 text-center">
        <CreditCard className="mx-auto mb-3 size-10 text-clinical-amber" weight="duotone" />
        <h2 className="font-display text-lg text-clinical-amber-foreground">Assinatura</h2>
        <p className="mt-1 text-sm text-clinical-amber-foreground/80">
          Modelo de cobrança ainda não definido. Esta seção será ativada quando o plano de
          assinatura estiver disponível.
        </p>
      </div>
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
