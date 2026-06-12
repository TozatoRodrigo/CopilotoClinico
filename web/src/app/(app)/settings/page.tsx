"use client";

import Link from "next/link";
import { Gear, MoonStars, Shield, WifiHigh } from "@phosphor-icons/react";
import { useOnlineStatus } from "@/components/providers/offline-provider";
import { ConnectionStatus } from "@/components/domain/connection-status";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";

const SETTINGS_BLOCKS = [
  {
    title: "Tema",
    description: "Use o atalho do cabeçalho para alternar entre claro e escuro.",
    icon: MoonStars,
  },
  {
    title: "Segurança",
    description: "O detalhamento completo entra na sprint de configurações do médico.",
    icon: Shield,
  },
  {
    title: "Conectividade",
    description: "O shell agora expõe o estado online/offline de forma persistente.",
    icon: WifiHigh,
  },
];

export default function SettingsPage() {
  const { isOnline } = useOnlineStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Scaffold inicial do espaço que vai concentrar preferências, segurança e privacidade."
      >
        <Button variant="outline" asChild>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </PageHeader>

      <SectionCard title="Estado atual" badge="Scaffold">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-clinical-line bg-muted p-2 text-clinical-teal-deep">
              <Gear className="size-5" />
            </span>
            <div>
              <p className="font-medium">Shell preparado para preferências por papel</p>
              <p className="text-sm text-muted-foreground">
                A navegação já expõe atalhos de perfil, tema e conectividade.
              </p>
            </div>
          </div>
          <ConnectionStatus status={isOnline ? "online" : "offline"} />
        </div>
      </SectionCard>

      <SectionCard title="Próximos blocos" badge={String(SETTINGS_BLOCKS.length)}>
        <div className="grid gap-4 md:grid-cols-3">
          {SETTINGS_BLOCKS.map((block) => {
            const Icon = block.icon;
            return (
              <div key={block.title} className="rounded-xl border border-border/70 bg-card p-4">
                <span className="mb-3 inline-flex rounded-full border border-clinical-line bg-muted p-2 text-clinical-teal-deep">
                  <Icon className="size-5" />
                </span>
                <p className="font-medium">{block.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{block.description}</p>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
