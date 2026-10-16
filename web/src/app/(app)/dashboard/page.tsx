'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  BookOpen,
  Flask,
  Keyboard,
  Microphone,
  SealCheck,
} from '@phosphor-icons/react';
import { useDashboardStats, useEncounterList } from '@/lib/clinical-queries';
import { useAuth } from '@/lib/auth-store';
import { StatCard, StatStrip } from '@/components/ui/stat-card';
import { PlantaoQueue } from '@/components/domain/plantao-queue';
import { MentoringAnswerNotice } from '@/components/domain/mentoring/mentoring-answer-notice';
import { ShiftReviewEntry } from '@/components/domain/shift-review/shift-review-entry';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';

const VERTICAL_LABELS: Record<string, string> = {
  trauma: 'Trauma',
  cardiac: 'Cardíaco',
  pediatric: 'Pediátrico',
  neuro: 'Neuro',
  general: 'Geral',
};

export default function DashboardPage() {
  const { physician, role } = useAuth();
  // Auditoria é restrita a compliance/admin (web/src/middleware.ts,
  // STAFF_ONLY_ROUTES) — o link "Ver trilha" só aparece para quem
  // realmente consegue abrir a rota.
  const canSeeAudit = role === 'compliance' || role === 'admin';
  const searchParams = useSearchParams();
  const deniedShown = useRef(false);

  useEffect(() => {
    const denied = searchParams.get('denied');
    if (denied && !deniedShown.current) {
      deniedShown.current = true;
      toast.error(
        denied === 'admin'
          ? 'Acesso negado: o console administrativo é restrito a Compliance e Admin.'
          : 'Acesso negado.',
      );
    }
  }, [searchParams]);

  const statsQuery = useDashboardStats();
  const queueQuery = useEncounterList({ limit: 6 });
  const draftsQuery = useEncounterList({ status: 'draft', limit: 1 });

  const loading = statsQuery.isPending || queueQuery.isPending;
  const error = statsQuery.error?.message ?? queueQuery.error?.message ?? null;

  const queue = queueQuery.data?.data ?? [];
  const draftCount = draftsQuery.data?.meta?.total ?? 0;
  const firstName = physician?.name?.split(' ')[0] ?? 'Médico';

  const pendingCount = statsQuery.data?.pendingReviews ?? 0;
  const confirmedCount = statsQuery.data?.confirmedDocuments ?? 0;
  const queueHeadline =
    pendingCount === 0
      ? 'Nenhum caso esperando'
      : `Você tem ${pendingCount} caso${pendingCount === 1 ? '' : 's'} esperando`;

  const rawDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const dateStr = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom plantão';
    if (hour < 19) return 'Boa tarde';
    return 'Boa noite';
  })();

  return (
    <Page width="default">
      <PageHeader
        eyebrow={
          <>
            {dateStr} · {greeting}, Dr. {firstName}
          </>
        }
        title={
          loading ? (
            <span className="inline-block h-10 w-80 max-w-full animate-pulse rounded-sm bg-tone-gray-bg align-middle" />
          ) : (
            queueHeadline
          )
        }
        actions={
          <>
            <Button asChild size="lg" className="max-md:flex-1">
              <Link href="/encounters/new">
                <Microphone weight="fill" />
                Novo caso por voz
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" aria-label="Digitar caso">
              <Link href="/encounters/new">
                <Keyboard />
                <span className="max-md:sr-only">Digitar</span>
              </Link>
            </Button>
          </>
        }
      />

      {/* CC-707 — resposta de um médico da equipe que o médico ainda não abriu. */}
      <MentoringAnswerNotice />

      {/* E2-S2: métricas */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
          <StatCard
            label="Aguardando sua revisão"
            value={pendingCount}
            sublabel="casos no plantão"
            variant="highlight"
          />
          <StatStrip
            items={[
              { label: 'Casos hoje', value: statsQuery.data?.todayCount ?? 0 },
              { label: 'Rascunhos', value: draftCount },
              { label: 'Confirmados', value: confirmedCount },
            ]}
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o plantão</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void statsQuery.refetch();
                void queueQuery.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* E2-S3: fila do plantão */}
      <div className="flex flex-col gap-1.5">
        <PlantaoQueue encounters={queue} loading={loading} />
        <p className="px-2 text-xs text-muted-foreground">
          Ordem sugerida por tempo desde a última avaliação e gravidade. Não é triagem e não
          substitui seu julgamento.
        </p>
      </div>

      {/* CC-801: revisão da semana — só aparece com a flag ligada e algo para revisar */}
      <ShiftReviewEntry />

      {/* Resolvidos hoje */}
      {!loading && (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Resolvidos hoje"
            action={
              <Link
                href="/encounters"
                className="rounded-sm px-1.5 py-0.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                Todos os casos →
              </Link>
            }
          />
          <div className="flex items-center gap-3 rounded-md bg-tone-green-bg px-4 py-3 text-tone-green-ink">
            <SealCheck className="size-5 shrink-0 text-tone-green" weight="fill" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {confirmedCount} documento{confirmedCount === 1 ? '' : 's'} assinado
                {confirmedCount === 1 ? '' : 's'}
              </p>
              <p className="text-[0.8125rem] opacity-90">
                Trilha de auditoria encadeada por hash · verificação automática diária às 02:00 (UTC)
              </p>
            </div>
            {canSeeAudit && (
              <Button asChild variant="ghost" size="sm" className="shrink-0 hover:bg-black/5">
                <Link href="/audit">Ver trilha</Link>
              </Button>
            )}
          </div>
        </section>
      )}

      {/* E2-S4: atalhos — casos piloto como galeria do Notion */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Casos piloto"
          description="Casos de treino para conhecer o fluxo completo, do ditado ao documento assinado."
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {DEMO_CASE_PRESETS.map((preset) => (
            <Link
              key={preset.slug}
              href={`/encounters/new?demoCase=${preset.slug}`}
              className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-hover/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <div className="flex items-center justify-between gap-2">
                <Flask className="size-5 text-tone-purple" weight="duotone" aria-hidden="true" />
                <Badge variant="purple">{VERTICAL_LABELS[preset.vertical] ?? preset.vertical}</Badge>
              </div>
              <p className="text-sm font-medium text-foreground">{preset.title}</p>
              <p className="line-clamp-2 text-[0.8125rem] text-muted-foreground">{preset.summary}</p>
            </Link>
          ))}
        </div>
        <Link
          href="/guidelines"
          className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <BookOpen className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="flex-1">Dúvida rápida sem abrir caso? Pergunte à diretriz.</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      </section>
    </Page>
  );
}
