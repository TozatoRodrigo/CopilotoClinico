'use client';

import Link from 'next/link';
import { GraduationCap } from '@phosphor-icons/react';
import { EmptyState } from '@/components/domain/empty-state';
import { CalibrationMap } from '@/components/domain/shift-review/calibration-map';
import { SHIFT_REVIEW_HREF } from '@/components/domain/shift-review/shift-review-entry';
import { ShiftReviewNav } from '@/components/domain/shift-review/shift-review-nav';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useShiftReviewMap } from '@/hooks/use-shift-review';
import { useMessages } from '@/lib/messages/use-messages';

/**
 * CC-802 — "Seu mapa", aba da revisão do plantão: por tema, acerto × o quanto
 * o médico sabia, com o que estudar onde ele errou marcando "Sei". O mapa só
 * sai com respostas suficientes; antes disso, a tela mostra quanto falta.
 */
export default function CalibrationMapPage() {
  const messages = useMessages();
  const copy = messages.shiftReview;
  const mapQuery = useShiftReviewMap();
  const state = mapQuery.data;

  return (
    <Page width="narrow">
      <div className="flex flex-col gap-4">
        <PageHeader
          size="compact"
          icon={GraduationCap}
          iconTone="blue"
          title={copy.title}
          description={copy.map.description}
        />
        <ShiftReviewNav current="map" />
      </div>

      {mapQuery.isPending ? (
        <MapSkeleton label={copy.map.loading} />
      ) : mapQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{copy.map.errorTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{mapQuery.error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void mapQuery.refetch()}>
              {messages.common.actions.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : state?.status === 'ready' ? (
        <CalibrationMap map={state.map} />
      ) : state?.status === 'insufficient' ? (
        <section aria-labelledby="calibration-insufficient-title" className="flex flex-col gap-3">
          <h2 id="calibration-insufficient-title" className="text-lg font-semibold text-foreground">
            {copy.map.insufficientTitle}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {copy.map.insufficientDescription(state.required)}
          </p>
          <div className="flex flex-col gap-1.5">
            <p className="text-[0.8125rem] font-medium text-foreground tabular-nums">
              {copy.map.insufficientProgress(state.answered, state.required)}
            </p>
            <Progress
              value={Math.min(100, (state.answered / state.required) * 100)}
              aria-label={copy.map.insufficientProgress(state.answered, state.required)}
            />
          </div>
          <Button asChild className="self-start max-sm:w-full">
            <Link href={SHIFT_REVIEW_HREF}>{copy.map.goToReview}</Link>
          </Button>
        </section>
      ) : (
        <EmptyState
          icon={<GraduationCap weight="duotone" />}
          title={copy.map.disabledTitle}
          description={copy.map.disabledDescription}
          actionLabel={copy.page.backToShift}
          actionHref="/dashboard"
        />
      )}
    </Page>
  );
}

function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-36 w-full" />
      ))}
    </div>
  );
}
