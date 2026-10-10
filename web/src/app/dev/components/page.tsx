'use client';

import Link from 'next/link';
import { Palette, TextAa } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TableOfContents, type ShowcaseAnchor } from './_components/showcase';
import { BrandSection, ColorsSection, TypographySection } from './_components/foundations';
import {
  AlertsSection,
  BlocksSection,
  ButtonsSection,
  CalloutsSection,
  ChartPaperSection,
  DatabaseSection,
  EmptyStateSection,
  InputsSection,
  MetricsSection,
  OverlaysSection,
  TabsSection,
  TagsSection,
} from './_components/primitives';
import { DomainSection } from './_components/domain';

/**
 * /dev/components — vitrine do design system "Prontuário" (o Notion da
 * saúde): fundamentos, primitivos de `components/ui` em todos os estados e
 * os componentes clínicos de domínio, com conteúdo clínico real. Fonte da
 * verdade das regras: docs/design-system.md. Bloqueada em produção
 * (middleware.ts, DEV_ROUTES).
 */
const ANCHORS: ShowcaseAnchor[] = [
  { id: 'cores', label: 'Cores' },
  { id: 'tipografia', label: 'Tipografia' },
  { id: 'marca', label: 'Marca' },
  { id: 'botoes', label: 'Botões' },
  { id: 'tags', label: 'Tags' },
  { id: 'campos', label: 'Campos' },
  { id: 'callouts', label: 'Callouts' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'blocos', label: 'Toggle e propriedades' },
  { id: 'database', label: 'Database' },
  { id: 'abas', label: 'Abas' },
  { id: 'metricas', label: 'Métricas e progresso' },
  { id: 'papel', label: 'Chart paper' },
  { id: 'sobreposicoes', label: 'Dialog, menu e tooltip' },
  { id: 'vazio', label: 'Estado vazio' },
  { id: 'dominio', label: 'Componentes clínicos' },
];

export default function ComponentsShowcasePage() {
  return (
    <main className="min-w-0 bg-background px-4 pt-10 pb-24 sm:px-8 md:pt-14 lg:px-12">
      <Page width="default" className="gap-14">
        <div className="flex flex-col gap-6">
          <PageHeader
            icon={Palette}
            iconTone="blue"
            eyebrow="Copiloto Clínico · /dev/components"
            title="Design system"
            description="Prontuário — o Notion da saúde. Página branca, cinza quente e cor só onde há significado clínico. Tudo o que está aqui é o componente real, em claro e escuro."
            actions={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dev/type">
                    <TextAa />
                    Tipografia
                  </Link>
                </Button>
                <ThemeToggle size="sm" />
              </>
            }
          />
          <TableOfContents anchors={ANCHORS} />
        </div>

        <ColorsSection />
        <TypographySection />
        <BrandSection />
        <ButtonsSection />
        <TagsSection />
        <InputsSection />
        <CalloutsSection />
        <AlertsSection />
        <BlocksSection />
        <DatabaseSection />
        <TabsSection />
        <MetricsSection />
        <ChartPaperSection />
        <OverlaysSection />
        <EmptyStateSection />
        <DomainSection />
      </Page>
    </main>
  );
}
