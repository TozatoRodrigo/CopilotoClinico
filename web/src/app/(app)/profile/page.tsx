"use client";

import Link from "next/link";
import { IdentificationCard, ShieldCheck, Stethoscope } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { physician, role } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil"
        description="Resumo do usuário autenticado e da navegação visível para o papel atual."
      >
        <Button variant="outline" asChild>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </PageHeader>

      <SectionCard title="Identificação">
        <div className="grid gap-4 md:grid-cols-2">
          <ProfileItem
            icon={Stethoscope}
            label="Nome"
            value={physician?.name ?? "Médico"}
          />
          <ProfileItem
            icon={IdentificationCard}
            label="E-mail"
            value={physician?.email ?? "Sessão ativa"}
          />
          <ProfileItem
            icon={ShieldCheck}
            label="CRM"
            value={
              physician
                ? `${physician.crmUf} ${physician.crmNumber}`
                : "Indisponível"
            }
          />
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <p className="text-sm text-muted-foreground">Papel visual</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{role}</Badge>
              <span className="text-sm text-muted-foreground">
                Base do RBAC visual do shell.
              </span>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ProfileItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IdentificationCard;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-clinical-line bg-muted p-2 text-clinical-teal-deep">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-medium">{value}</p>
        </div>
      </div>
    </div>
  );
}
