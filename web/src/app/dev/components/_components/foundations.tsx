'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  CheckCircle,
  Info,
  Sparkle,
  Tag,
  WarningCircle,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Logo, LogoMark } from '@/components/brand/logo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { TONES, toneBg, toneInk, toneTag, toneText, type Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { ShowcaseSection, Specimen, Swatch, Token } from './showcase';

const SURFACES = [
  { className: 'bg-background', label: 'Página', token: 'bg-background' },
  { className: 'bg-sidebar', label: 'Sidebar', token: 'bg-sidebar' },
  { className: 'bg-surface-subtle', label: 'Superfície sutil', token: 'bg-surface-subtle' },
  { className: 'bg-card', label: 'Cartão', token: 'bg-card' },
  { className: 'bg-surface-input', label: 'Campo', token: 'bg-surface-input' },
  { className: 'bg-hover', label: 'Hover', token: 'bg-hover' },
  { className: 'bg-active', label: 'Ativo / selecionado', token: 'bg-active' },
  { className: 'bg-primary', label: 'Ação primária', token: 'bg-primary' },
] as const;

const TEXTS = [
  { className: 'text-foreground', label: 'Texto', token: 'text-foreground', note: 'Corpo e títulos' },
  { className: 'text-muted-foreground', label: 'Secundário', token: 'text-muted-foreground', note: 'Metadados, legendas (AA)' },
  { className: 'text-fg-tertiary', label: 'Terciário', token: 'text-fg-tertiary', note: 'Só placeholder/decoração' },
  { className: 'text-link', label: 'Link', token: 'text-link', note: 'Links no texto' },
  { className: 'text-primary', label: 'Primária', token: 'text-primary', note: 'Ícone/texto de ação' },
] as const;

const TONE_LABEL: Record<Tone, string> = {
  gray: 'Cinza',
  brown: 'Marrom',
  orange: 'Laranja',
  yellow: 'Amarelo',
  green: 'Verde',
  blue: 'Azul',
  purple: 'Roxo',
  pink: 'Rosa',
  red: 'Vermelho',
};

const CLINICAL_SEMANTICS: {
  meaning: string;
  tone: string;
  icon: Icon;
  example: ReactNode;
  classes: string;
}[] = [
  {
    meaning: 'Muda a conduta — pergunta bloqueadora, alerta que exige ação, pendência',
    tone: 'orange',
    icon: WarningCircle,
    example: <Badge variant="warning">Muda a conduta</Badge>,
    classes: 'clinical-amber*, Badge warning, Callout orange',
  },
  {
    meaning: 'Conduta confirmada/assinada, verificado, saudável',
    tone: 'green',
    icon: CheckCircle,
    example: <Badge variant="success">Assinado</Badge>,
    classes: 'clinical-green*, Badge success',
  },
  {
    meaning: 'Erro, destrutivo, rejeitado, gravidade crítica',
    tone: 'red',
    icon: XCircle,
    example: <Badge variant="destructive">Rejeitado</Badge>,
    classes: 'clinical-error*, destructive',
  },
  {
    meaning: 'Ação primária, IA, em revisão',
    tone: 'blue',
    icon: Sparkle,
    example: <Badge variant="default">Em revisão</Badge>,
    classes: 'primary, clinical-teal* (nome legado)',
  },
  {
    meaning: 'Neutro, rascunho, metadado',
    tone: 'gray',
    icon: Info,
    example: <Badge variant="secondary">Rascunho</Badge>,
    classes: 'secondary, muted',
  },
  {
    meaning: 'Categorias sem peso clínico (vertical, tipo de doc, fonte)',
    tone: 'purple · brown · pink · yellow',
    icon: Tag,
    example: (
      <span className="flex flex-wrap gap-1">
        <Badge variant="purple">Cardíaco</Badge>
        <Badge variant="brown">Prescrição</Badge>
        <Badge variant="pink">Pediátrico</Badge>
        <Badge variant="yellow">Protocolo</Badge>
      </span>
    ),
    classes: 'Badge purple/brown/pink/yellow',
  },
];

const CHART_COLORS = [
  { className: 'bg-chart-1', token: 'bg-chart-1', note: 'série principal (azul)' },
  { className: 'bg-chart-2', token: 'bg-chart-2', note: 'laranja' },
  { className: 'bg-chart-3', token: 'bg-chart-3', note: 'verde' },
  { className: 'bg-chart-4', token: 'bg-chart-4', note: 'roxo' },
  { className: 'bg-chart-5', token: 'bg-chart-5', note: 'vermelho' },
] as const;

export function ColorsSection() {
  return (
    <ShowcaseSection
      id="cores"
      title="Cores"
      description="Página branca, cinza quente para tudo que não pede ação e cor só onde há significado. Sempre classes ligadas a tokens — nunca hex nem paleta crua do Tailwind."
    >
      <Specimen title="Superfícies" note="Hover e ativo são translúcidos: funcionam sobre qualquer fundo.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SURFACES.map((s) => (
            <Swatch key={s.token} {...s} />
          ))}
        </div>
      </Specimen>

      <Specimen title="Texto e linhas" note="Texto terciário não passa AA — nunca use para texto que precisa ser lido.">
        <div className="flex flex-col divide-y divide-border">
          {TEXTS.map((t) => (
            <div key={t.token} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 first:pt-0">
              <span className={cn('w-40 text-[0.9375rem] font-medium', t.className)}>{t.label}</span>
              <Token>{t.token}</Token>
              <span className="text-[0.8125rem] text-muted-foreground">{t.note}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 last:pb-0">
            <span className="w-40 text-[0.9375rem] font-medium text-foreground">Linhas</span>
            <span className="flex items-center gap-2">
              <span className="h-px w-12 bg-border" aria-hidden="true" />
              <Token>border-border</Token>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-6 w-12 rounded-md border border-input bg-surface-input" aria-hidden="true" />
              <Token>border-input</Token>
            </span>
          </div>
        </div>
      </Specimen>

      <Specimen
        title="Paleta Notion — 9 tons × 4 usos"
        note={
          <>
            <Token>text-tone-x</Token> texto/ícone · <Token>bg-tone-x-bg</Token> fundo de bloco ·{' '}
            <Token>bg-tone-x-tag</Token> tag · <Token>text-tone-x-ink</Token> texto sobre fundo/tag. Em
            código, use os mapas de <Token>lib/tone.ts</Token>.
          </>
        }
      >
        <TableWrapper>
          <Table aria-label="Paleta de tons">
            <TableHeader>
              <TableRow>
                <TableHead>Tom</TableHead>
                <TableHead>Texto</TableHead>
                <TableHead>Fundo de bloco</TableHead>
                <TableHead>Tag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TONES.map((tone) => (
                <TableRow key={tone}>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium text-foreground">{TONE_LABEL[tone]}</span>{' '}
                    <span className="hidden font-mono text-[0.75rem] text-muted-foreground sm:inline">{tone}</span>
                  </TableCell>
                  <TableCell className={cn('font-medium whitespace-nowrap', toneText[tone])}>
                    Reavaliar
                  </TableCell>
                  <TableCell>
                    <span className={cn('block rounded-sm px-2 py-1 text-[0.8125rem] whitespace-nowrap', toneBg[tone], toneInk[tone])}>
                      Bloco
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex h-5 items-center rounded-[3px] px-1.5 text-xs whitespace-nowrap', toneTag[tone])}>
                      {TONE_LABEL[tone]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </Specimen>

      <Specimen
        title="Semântica clínica (fixa)"
        note="Significado médico-legal: laranja muda a conduta, verde é conduta confirmada, vermelho é risco/erro. Nunca como decoração — e estado nunca só por cor (sempre texto ou ícone junto)."
      >
        <TableWrapper>
          <Table aria-label="Semântica clínica das cores">
            <TableHeader>
              <TableRow>
                <TableHead>Significado</TableHead>
                <TableHead className="hidden sm:table-cell">Tom</TableHead>
                <TableHead>Exemplo</TableHead>
                <TableHead className="hidden md:table-cell">Classes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CLINICAL_SEMANTICS.map((row) => {
                const RowIcon = row.icon;
                return (
                  <TableRow key={row.tone}>
                    <TableCell className="min-w-[12rem] py-2">
                      <span className="flex items-start gap-2">
                        <RowIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {row.meaning}
                      </span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-[0.75rem] whitespace-nowrap text-muted-foreground sm:table-cell">
                      {row.tone}
                    </TableCell>
                    <TableCell>{row.example}</TableCell>
                    <TableCell className="hidden font-mono text-[0.75rem] text-muted-foreground md:table-cell">
                      {row.classes}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableWrapper>
      </Specimen>

      <Specimen
        title="Gráficos"
        note="Uma série = bg-chart-1. Várias séries seguem a ordem fixa abaixo; grade em linha de 1px cinza e rótulos em texto cinza (nunca na cor da série)."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {CHART_COLORS.map((c) => (
            <Swatch key={c.token} className={c.className} label={c.note} token={c.token} />
          ))}
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}

const TYPE_ROLES = [
  { role: 'Título de página', className: 'font-display text-3xl md:text-4xl', token: 'PageHeader · text-4xl bold', sample: 'Você tem 2 casos esperando' },
  { role: 'H2 de seção', className: 'text-lg font-semibold tracking-[-0.01em]', token: 'SectionHeader · text-lg', sample: 'Fila do plantão' },
  { role: 'H3 / título de bloco', className: 'text-base font-semibold', token: 'text-base font-semibold', sample: 'Raciocínio do copiloto' },
  { role: 'Corpo de leitura', className: 'text-[0.9375rem] leading-relaxed', token: 'text-[0.9375rem]', sample: 'Paciente com síndrome gripal há 3 dias, sem sinais de SRAG.' },
  { role: 'UI (padrão)', className: 'text-sm', token: 'text-sm · 14px', sample: 'Retomar caso · Leito 4' },
  { role: 'Metadado', className: 'text-[0.8125rem] text-muted-foreground', token: 'text-[0.8125rem] muted', sample: 'Atualizado há 12 min' },
  { role: 'Legenda', className: 'text-xs text-muted-foreground', token: 'text-xs muted', sample: 'Não substitui julgamento clínico.' },
  { role: 'Código / ID', className: 'font-mono text-[0.8125rem]', token: 'font-mono', sample: 'CRM-SP 123456 · 9f2a7c1e' },
] as const;

export function TypographySection() {
  return (
    <ShowcaseSection
      id="tipografia"
      title="Tipografia"
      description={
        <>
          Pilha de sistema do Notion (SF Pro, Segoe UI) — nenhuma fonte é baixada. Mono só para IDs,
          hashes, CRM e códigos.{' '}
          <Link href="/dev/type" className="text-link underline-offset-2 hover:underline">
            Ver o specimen completo em /dev/type
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {TYPE_ROLES.map((t) => (
          <div key={t.role} className="grid gap-1 py-3 md:grid-cols-[11rem_minmax(0,1fr)] md:items-baseline md:gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.8125rem] font-medium text-foreground">{t.role}</span>
              <span className="font-mono text-[0.75rem] text-muted-foreground">{t.token}</span>
            </div>
            <p className={cn('min-w-0 text-foreground', t.className)}>{t.sample}</p>
          </div>
        ))}
      </div>
    </ShowcaseSection>
  );
}

export function BrandSection() {
  return (
    <ShowcaseSection
      id="marca"
      title="Marca"
      description="Quadrado de cantos suaves com contorno na cor do texto — monocromático, herda o tema."
    >
      <div className="flex flex-wrap items-center gap-8">
        <Logo size="lg" />
        <Logo />
        <span className="flex items-center gap-3">
          <LogoMark size="lg" />
          <LogoMark />
          <LogoMark size="sm" />
        </span>
      </div>
    </ShowcaseSection>
  );
}
