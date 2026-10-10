'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarBlank,
  Hospital,
  Stethoscope,
  TextAa,
  User,
  WarningCircle,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';
import { cn } from '@/lib/utils';

/**
 * /dev/type — specimen tipográfico do design system "Prontuário": escala,
 * papéis, pesos e famílias, aplicados ao caso piloto. Regras em
 * docs/design-system.md → Tipografia.
 */

const TYPE_SCALE = [
  { token: 'text-4xl', size: '40px', leading: '1.2', use: 'Título de página (PageHeader, desktop)', className: 'text-4xl font-bold tracking-[-0.015em]' },
  { token: 'text-3xl', size: '30px', leading: '1.25', use: 'Título de página (mobile), documento', className: 'text-3xl font-bold tracking-[-0.015em]' },
  { token: 'text-2xl', size: '24px', leading: '1.3', use: 'Título compacto, valor de destaque', className: 'text-2xl font-semibold' },
  { token: 'text-xl', size: '20px', leading: '1.3', use: 'Título de dialog, número de métrica', className: 'text-xl font-semibold' },
  { token: 'text-lg', size: '18px', leading: '1.5', use: 'H2 de seção (SectionHeader)', className: 'text-lg font-semibold' },
  { token: 'text-base', size: '16px', leading: '1.5', use: 'H3 / título de bloco, leitura', className: 'text-base' },
  { token: 'text-[0.9375rem]', size: '15px', leading: '1.5', use: 'Corpo de leitura (análise, documento)', className: 'text-[0.9375rem]' },
  { token: 'text-sm', size: '14px', leading: '1.5', use: 'UI — padrão do body', className: 'text-sm' },
  { token: 'text-[0.8125rem]', size: '13px', leading: '1.5', use: 'Metadado, rótulo de campo', className: 'text-[0.8125rem]' },
  { token: 'text-xs', size: '12px', leading: '1.4', use: 'Legenda, tag, eixo de gráfico', className: 'text-xs' },
] as const;

const WEIGHTS = [
  { token: 'font-normal', weight: '400', use: 'Corpo e tags' },
  { token: 'font-medium', weight: '500', use: 'Itens de UI, nome na linha' },
  { token: 'font-semibold', weight: '600', use: 'Seções, rótulos de bloco' },
  { token: 'font-bold', weight: '700', use: 'Só título de página' },
] as const;

const SAMPLE = 'Síndrome gripal há 3 dias, sem sinais de SRAG.';

const demoCase = DEMO_CASE_PRESETS[0]!;

const VERTICAL_LABELS: Record<string, string> = {
  trauma: 'Trauma',
  cardiac: 'Cardíaco',
  pediatric: 'Pediátrico',
  neuro: 'Neuro',
  general: 'Geral',
};

const CONTEXT_LABELS: Record<string, string> = {
  hasCT: 'Tomografia',
  isSus: 'SUS',
  hasLab: 'Laboratório',
  hasICU: 'UTI',
};

function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.75rem] text-muted-foreground">{children}</code>;
}

export default function TypeSpecimenPage() {
  const activeContext = Object.entries(demoCase.context).filter(([, value]) => value);

  return (
    <main className="min-w-0 bg-background px-4 pt-10 pb-24 sm:px-8 md:pt-14 lg:px-12">
      <Page width="default" className="gap-14">
        <PageHeader
          icon={TextAa}
          iconTone="blue"
          eyebrow="Copiloto Clínico · /dev/type"
          title="Tipografia"
          description="A pilha de sistema do Notion: SF Pro no Apple, Segoe UI no Windows, Roboto no Android. Nenhuma fonte é baixada — o texto aparece na hora e nativo em cada SO."
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/dev/components">
                  <ArrowLeft />
                  Design system
                </Link>
              </Button>
              <ThemeToggle size="sm" />
            </>
          }
        />

        {/* Escala */}
        <section className="flex flex-col gap-4" aria-labelledby="escala">
          <SectionHeader
            title={<span id="escala">Escala</span>}
            description="Do maior para o menor. Tamanhos fora desta lista são exceção — prefira o papel mais próximo."
            className="border-b border-border pb-2"
          />
          <div className="flex flex-col divide-y divide-border">
            {TYPE_SCALE.map((step) => (
              <div
                key={step.token}
                className="grid gap-1.5 py-3.5 first:pt-0 md:grid-cols-[10rem_minmax(0,1fr)] md:items-baseline md:gap-6"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 md:flex-col md:gap-0.5">
                  <Mono>{step.token}</Mono>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {step.size} / {step.leading}
                  </span>
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className={cn('text-pretty text-foreground', step.className)}>{SAMPLE}</p>
                  <p className="text-xs text-muted-foreground">{step.use}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Em contexto */}
        <section className="flex flex-col gap-4" aria-labelledby="contexto">
          <SectionHeader
            title={<span id="contexto">Em contexto</span>}
            description={`A hierarquia aplicada a uma página de caso — caso piloto “${demoCase.slug}”.`}
            className="border-b border-border pb-2"
          />
          <article className="flex flex-col gap-6 rounded-lg border border-border px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Plantão · Caso piloto</p>
              <h2 className="font-display text-3xl text-balance text-foreground md:text-4xl">{demoCase.title}</h2>
              <PropertyList>
                <PropertyRow icon={User} label="Paciente">
                  {demoCase.patientRef}
                </PropertyRow>
                <PropertyRow icon={Stethoscope} label="Vertical">
                  <Badge variant="purple">{VERTICAL_LABELS[demoCase.vertical] ?? demoCase.vertical}</Badge>
                </PropertyRow>
                <PropertyRow icon={Hospital} label="Recursos">
                  <span className="flex flex-wrap gap-1">
                    {activeContext.map(([key]) => (
                      <Badge key={key} variant="gray">
                        {CONTEXT_LABELS[key] ?? key}
                      </Badge>
                    ))}
                  </span>
                </PropertyRow>
                <PropertyRow icon={CalendarBlank} label="Criado em">
                  10/10/2026, 09:12
                </PropertyRow>
              </PropertyList>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Resumo do caso</h3>
              <p className="text-[0.9375rem] leading-relaxed text-pretty text-foreground">{demoCase.caseText}</p>
              <p className="text-[0.8125rem] text-muted-foreground">Ditado às 09:12 · transcrito automaticamente</p>
            </div>

            <Callout tone="orange" icon={<WarningCircle weight="fill" />} title="Paciente faz uso atual de imunossupressor?">
              A resposta muda a indicação de antiviral após 48 horas do início dos sintomas.
            </Callout>

            <div className="flex flex-col gap-1.5">
              <h4 className="text-base font-semibold text-foreground">Fonte citada</h4>
              <p className="text-sm text-foreground">
                Diretriz Influenza <span className="text-muted-foreground">v3 · Ministério da Saúde</span>
              </p>
              <p className="text-xs text-muted-foreground">Sugestão de apoio — não substitui o julgamento clínico.</p>
            </div>
          </article>
        </section>

        {/* Pesos */}
        <section className="flex flex-col gap-4" aria-labelledby="pesos">
          <SectionHeader
            title={<span id="pesos">Pesos</span>}
            description="Negrito (700) só no título da página; o resto da hierarquia vem de 500 e 600."
            className="border-b border-border pb-2"
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            {WEIGHTS.map((w) => (
              <div key={w.token} className="flex flex-col gap-1">
                <span className={cn('text-2xl text-foreground', w.token)}>Conduta</span>
                <Mono>
                  {w.token} · {w.weight}
                </Mono>
                <span className="text-xs text-muted-foreground">{w.use}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Famílias */}
        <section className="flex flex-col gap-4" aria-labelledby="familias">
          <SectionHeader
            title={<span id="familias">Famílias</span>}
            className="border-b border-border pb-2"
          />
          <div className="flex flex-col divide-y divide-border">
            <div className="grid gap-2 py-4 first:pt-0 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">Sans</span>
                <Mono>font-sans</Mono>
              </div>
              <div className="space-y-1">
                <p className="font-sans text-[0.9375rem] text-foreground">
                  Toda a interface. ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 — ç ã õ é ê á.
                </p>
                <p className="text-xs text-muted-foreground">
                  ui-sans-serif, -apple-system, Segoe UI Variable, Segoe UI, Helvetica, Arial
                </p>
              </div>
            </div>
            <div className="grid gap-2 py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">Serif</span>
                <Mono>font-serif</Mono>
              </div>
              <div className="space-y-1">
                <p className="font-serif text-base leading-relaxed text-foreground">
                  Leitura longa opcional, como o estilo “Serif” de página do Notion. Nunca em títulos de display.
                </p>
                <p className="text-xs text-muted-foreground">Lyon-Text, Georgia, ui-serif</p>
              </div>
            </div>
            <div className="grid gap-2 py-4 last:pb-0 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">Mono</span>
                <Mono>font-mono</Mono>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Só para IDs, hashes de auditoria, CRM, patientRef e códigos — nunca decorativo.
                </p>
                <dl className="space-y-1 font-mono text-[0.8125rem] text-foreground">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">patientRef:</dt>
                    <dd>{demoCase.patientRef}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">auditHash:</dt>
                    <dd className="min-w-0 break-all">3f9a1c7e2b6d4f08a51c9e3b7d2f1a6c8e0b4d7f2a9c1e6b3d8f0a2c4e6b8d1f</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">chunkId:</dt>
                    <dd className="min-w-0 break-all">kb-001-top20-ps/01-sindrome-gripal-ivas#chunk-03</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Números */}
        <section className="flex flex-col gap-4" aria-labelledby="numeros">
          <SectionHeader
            title={<span id="numeros">Números</span>}
            description="Algarismos tabulares em colunas e relógios (alinham); proporcionais em números grandes isolados."
            className="border-b border-border pb-2"
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Mono>tabular-nums</Mono>
              <div className="w-40 space-y-0.5 text-right text-sm text-foreground tabular-nums">
                <p>US$ 111,11</p>
                <p>US$ 48,37</p>
                <p>US$ 1.612,00</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Mono>proporcional (padrão)</Mono>
              <p className="text-[2.25rem] leading-none font-semibold tracking-[-0.02em] text-foreground">121</p>
              <p className="text-xs text-muted-foreground">Valor de StatCard</p>
            </div>
          </div>
        </section>

        {/* Regras */}
        <section className="flex flex-col gap-4" aria-labelledby="regras">
          <SectionHeader title={<span id="regras">Regras</span>} className="border-b border-border pb-2" />
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.9375rem] text-foreground marker:text-fg-tertiary">
            <li>Rótulos em caixa normal (sentence case) — nunca caixa-alta com tracking largo.</li>
            <li>Cinza secundário para metadados; terciário só para placeholder.</li>
            <li>Títulos sem serifa display; a hierarquia vem de tamanho e peso.</li>
            <li>Uma linha de leitura com no máximo ~75 caracteres (colunas narrow/default).</li>
          </ul>
        </section>
      </Page>
    </main>
  );
}
