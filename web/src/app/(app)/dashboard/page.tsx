'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Microphone, Keyboard, Flask } from '@phosphor-icons/react';
import { useDashboardStats, useEncounterList } from '@/lib/clinical-queries';
import { useAuth } from '@/lib/auth-store';
import { StatCard, StatStrip } from '@/components/ui/stat-card';
import { PlantaoQueue } from '@/components/domain/plantao-queue';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';

export default function DashboardPage() {
  const { physician } = useAuth();
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

  const dateStr = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom plantão';
    if (hour < 19) return 'Boa tarde';
    return 'Boa noite';
  })();

  return (
    <div className="flex flex-col gap-7">
      {/* E2-S1: Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-soft)]">
            {dateStr}
          </p>
          <h1 className="font-display text-[2.25rem] leading-[1.15] tracking-[-0.01em]">
            {greeting}, Dr. {firstName}
          </h1>
        </div>
        <div className="hidden gap-2.5 md:flex">
          <Button asChild size="lg" className="h-12 gap-2 shadow-[0_4px_14px_rgba(14,124,123,0.3)]">
            <Link href="/encounters/new">
              <Microphone className="size-[18px]" weight="bold" />
              Novo caso por voz
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 gap-2">
            <Link href="/encounters/new">
              <Keyboard className="size-[17px]" />
              Digitar
            </Link>
          </Button>
        </div>
      </div>

      {/* Mobile action buttons */}
      <div className="flex gap-2.5 md:hidden">
        <Button asChild className="h-12 flex-1 gap-2">
          <Link href="/encounters/new">
            <Microphone className="size-[18px]" weight="bold" />
            Novo caso
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 gap-2 px-4">
          <Link href="/encounters/new">
            <Keyboard className="size-[17px]" />
          </Link>
        </Button>
      </div>

      {/* E2-S2: Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[104px] rounded-[14px]" />
          <Skeleton className="h-[104px] rounded-[14px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.4fr_1fr]">
          <StatCard
            label="Aguardando sua revisão"
            value={statsQuery.data?.pendingReviews ?? 0}
            sublabel="casos no plantão"
            variant="highlight"
          />
          <StatStrip
            items={[
              { label: 'Casos hoje', value: statsQuery.data?.todayCount ?? 0 },
              { label: 'Rascunhos', value: draftCount },
              { label: 'Confirmados', value: statsQuery.data?.confirmedDocuments ?? 0 },
            ]}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
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

      {/* E2-S3: Fila do plantão */}
      <PlantaoQueue encounters={queue} loading={loading} />

      {/* E2-S4: Casos piloto */}
      <div className="flex items-center gap-3.5 rounded-[14px] border border-dashed border-[var(--line)] p-4">
        <Flask className="size-[18px] shrink-0 text-[var(--ink-soft)]" />
        <p className="flex-1 text-[0.8rem] text-[var(--ink-soft)]">
          Casos piloto para treinar o fluxo:{' '}
          {DEMO_CASE_PRESETS.map((p, i) => (
            <span key={p.slug}>
              <Link
                href={`/encounters/new?demoCase=${p.slug}`}
                className="font-semibold text-[var(--ink)] hover:text-[var(--teal)]"
              >
                {p.title}
              </Link>
              {i < DEMO_CASE_PRESETS.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
        <Link
          href={`/encounters/new?demoCase=${DEMO_CASE_PRESETS[0]?.slug ?? ''}`}
          className="hidden shrink-0 text-[0.8rem] font-semibold text-[var(--teal)] hover:text-[var(--teal-deep)] md:block"
        >
          Abrir caso demo →
        </Link>
      </div>
    </div>
  );
}
