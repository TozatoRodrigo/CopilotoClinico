"use client";

import Link from "next/link";
import { BookOpen, Buildings, MagnifyingGlass } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/domain/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const GUIDELINE_SOURCES = [
  {
    title: "Diretrizes públicas",
    description: "Fontes abertas e auditáveis para consulta clínica rápida.",
    badge: "Disponível",
    icon: BookOpen,
  },
  {
    title: "Protocolos institucionais",
    description: "Espaço reservado para catálogos específicos por instituição.",
    badge: "Scaffold",
    icon: Buildings,
  },
];

export default function GuidelinesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Diretrizes"
        description="Atalhos para o acervo clínico que vai alimentar a busca global e o copiloto."
      >
        <Button variant="outline" asChild>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </PageHeader>

      <SectionCard title="Fontes priorizadas" badge={String(GUIDELINE_SOURCES.length)}>
        <div className="grid gap-4 md:grid-cols-2">
          {GUIDELINE_SOURCES.map((source) => {
            const Icon = source.icon;
            return (
              <div key={source.title} className="rounded-xl border border-border/70 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-clinical-line bg-muted p-2 text-clinical-teal-deep">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium">{source.title}</p>
                      <p className="text-sm text-muted-foreground">{source.description}</p>
                    </div>
                  </div>
                  <Badge variant={source.badge === "Disponível" ? "success" : "outline"}>
                    {source.badge}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Busca global" badge="⌘K">
        <EmptyState
          icon={<MagnifyingGlass className="size-10" />}
          title="Scaffold da paleta preparado"
          description="A busca funcional entra na F3. Por enquanto, use a paleta para navegar rápido entre as áreas principais."
          actionLabel="Abrir painel"
          actionHref="/dashboard"
        />
      </SectionCard>
    </div>
  );
}
