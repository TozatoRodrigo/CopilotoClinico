'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PencilSimple, Scales, SealCheck, SkipForward, XCircle } from '@phosphor-icons/react';
import type {
  KnowledgeCardContentInput,
  KnowledgeCardContentIssue,
} from '@contracts/knowledge-cards';
import type { KnowledgeCardReviewTaskItem } from '@contracts/knowledge-card-review';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useApproveCard, useCorrectCard, useRejectCard } from '@/lib/card-review-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { diffCardContent } from '../_lib/card-diff';
import { parseContentIssues } from '../_lib/card-editor';
import { useReviewTimer } from '../_lib/review-timer';
import { CardContentView } from './card-content-view';
import { CardEditor } from './card-editor';
import { CardSources } from './card-sources';
import { ApproveSheet, RejectSheet } from './decision-sheets';
import {
  AuthorBadge,
  ElapsedClock,
  formatDate,
  reportDecisionFailure,
  useSourceNavigation,
} from './session-parts';
import { VersionDiff } from './version-diff';

/**
 * CC-404 — um cartão na mesa do revisor: ler, conferir na fonte e decidir
 * (aprovar, corrigir, descartar). Montado com `key` = id do cartão: o
 * cronômetro começa quando o cartão aparece e segue durante a correção — o
 * tempo registrado é o da revisão inteira.
 */
export function ReviewSession({
  item,
  autoFocus,
  onSkip,
  onDecided,
  onCorrected,
  onStale,
}: {
  item: KnowledgeCardReviewTaskItem;
  /** Leva o foco ao cartão (a fila acabou de avançar). */
  autoFocus: boolean;
  onSkip: () => void;
  onDecided: () => void;
  onCorrected: (next: KnowledgeCardReviewTaskItem) => void;
  /** O cartão saiu da fila (outro revisor decidiu, versão mudou): recarregar. */
  onStale: () => void;
}) {
  const { physician } = useAuth();
  const timer = useReviewTimer();
  const { card, divergence } = item;
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [issues, setIssues] = useState<KnowledgeCardContentIssue[]>([]);
  const [sheet, setSheet] = useState<'approve' | 'reject' | null>(null);
  const [focusRequest, setFocusRequest] = useState(autoFocus ? 1 : 0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sources = useSourceNavigation();

  const correct = useCorrectCard(card.id);
  const approve = useApproveCard(card.id);
  const reject = useRejectCard(card.id);

  const current = card.versions.find((version) => version.version === item.version);
  // Correção de cartão publicado: compara com o que está no ar; senão, com a versão anterior.
  const base = card.published
    ? card.versions.find((version) => version.version === card.published?.version)
    : card.versions.find((version) => version.version === item.version - 1);
  const changes = useMemo(
    () => (current && base ? diffCardContent(base.content, current.content) : []),
    [base, current],
  );

  useEffect(() => {
    if (focusRequest > 0 && mode === 'view') headingRef.current?.focus();
  }, [focusRequest, mode]);

  if (!current) return null;

  function failed(error: Error, fallback: string) {
    if (reportDecisionFailure(error, fallback, onStale) === 'stale') setSheet(null);
  }

  function submitCorrection(content: KnowledgeCardContentInput) {
    correct.mutate(
      { basedOnVersion: item.version, content },
      {
        onSuccess: (next) => {
          setIssues([]);
          setMode('view');
          setFocusRequest((count) => count + 1);
          toast.success(
            `Correção salva como versão ${next.version}. Confira o que mudou e decida.`,
          );
          onCorrected(next);
        },
        onError: (error) => {
          const contentIssues =
            error instanceof ApiError && error.status === 422
              ? parseContentIssues(error.body)
              : null;
          if (contentIssues) setIssues(contentIssues);
          else failed(error, 'Não foi possível salvar a correção.');
        },
      },
    );
  }

  function confirmApprove(input: { validityMonths: number; comment?: string }) {
    approve.mutate(
      { version: item.version, ...input, reviewDurationMs: timer.elapsedMs() },
      {
        onSuccess: (approved) => {
          setSheet(null);
          toast.success(
            approved.published
              ? `Cartão aprovado e publicado. Vale até ${formatDate(approved.published.validUntil)}.`
              : 'Cartão aprovado.',
          );
          onDecided();
        },
        onError: (error) => failed(error, 'Não foi possível aprovar o cartão.'),
      },
    );
  }

  function confirmReject(reason: string) {
    reject.mutate(
      { version: item.version, reason, reviewDurationMs: timer.elapsedMs() },
      {
        onSuccess: () => {
          setSheet(null);
          toast.success(
            card.published
              ? 'Correção descartada. A versão publicada continua valendo.'
              : 'Cartão descartado.',
          );
          onDecided();
        },
        onError: (error) => failed(error, 'Não foi possível descartar o cartão.'),
      },
    );
  }

  const signer = physician
    ? `${physician.name ?? 'você'} · CRM-${physician.crmUf} ${physician.crmNumber}`
    : 'você';
  const deciding = approve.isPending || reject.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge variant="purple">{card.topic}</Badge>
        <span className="text-xs text-muted-foreground">Versão {current.version}</span>
        <AuthorBadge version={current} />
        {card.published && (
          <Badge variant="success">
            <SealCheck weight="bold" aria-hidden="true" />
            Versão {card.published.version} publicada
          </Badge>
        )}
        <span className="flex-1" />
        <ElapsedClock timer={timer} />
        {mode === 'view' && (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} disabled={deciding}>
            <SkipForward aria-hidden="true" />
            Pular
          </Button>
        )}
      </div>

      {divergence && (
        <Callout
          tone="orange"
          icon={<Scales weight="bold" />}
          title="Voltou à fila pela revisão cruzada"
        >
          {divergence.crossReviewer.name ?? 'Um segundo médico'} divergiu da versão{' '}
          {divergence.disputedVersion}, aprovada por{' '}
          {divergence.firstReviewer.name ?? 'outro médico'}: “{divergence.reason}”. O cartão está
          fora do ar até uma nova decisão.
        </Callout>
      )}

      {mode === 'edit' ? (
        <CardEditor
          content={current.content}
          version={current.version}
          nextVersion={card.currentVersion + 1}
          issues={issues}
          saving={correct.isPending}
          onCancel={() => {
            setIssues([]);
            setMode('view');
          }}
          onSubmit={submitCorrection}
        />
      ) : (
        <>
          {base && (
            <Disclosure
              defaultOpen={current.authorKind === 'physician'}
              title={
                card.published
                  ? `O que mudou em relação à versão publicada (${base.version})`
                  : `O que mudou em relação à versão ${base.version}`
              }
              meta={`${changes.length} mudança${changes.length === 1 ? '' : 's'}`}
            >
              <VersionDiff changes={changes} />
            </Disclosure>
          )}
          <CardContentView
            content={current.content}
            onOpenSource={sources.openSource}
            headingRef={headingRef}
          />
        </>
      )}

      <CardSources
        sources={current.content.sources}
        sourceTexts={item.sourceTexts}
        openKeys={sources.openKeys}
        onOpenChange={sources.toggleSource}
      />

      {mode === 'view' && (
        <div
          role="group"
          aria-label="Decisão sobre o cartão"
          className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid grid-cols-3 gap-2 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:flex sm:justify-end sm:px-0 md:bottom-0"
        >
          <Button
            type="button"
            variant="destructive"
            disabled={deciding}
            onClick={() => setSheet('reject')}
          >
            <XCircle weight="bold" aria-hidden="true" />
            Descartar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={deciding}
            onClick={() => setMode('edit')}
          >
            <PencilSimple weight="bold" aria-hidden="true" />
            Corrigir
          </Button>
          <Button type="button" disabled={deciding} onClick={() => setSheet('approve')}>
            <SealCheck weight="bold" aria-hidden="true" />
            Aprovar
          </Button>
        </div>
      )}

      <ApproveSheet
        open={sheet === 'approve'}
        onOpenChange={(open) => setSheet(open ? 'approve' : null)}
        version={current.version}
        signer={signer}
        pending={approve.isPending}
        onConfirm={confirmApprove}
      />
      <RejectSheet
        open={sheet === 'reject'}
        onOpenChange={(open) => setSheet(open ? 'reject' : null)}
        version={current.version}
        correctsPublished={card.published !== null}
        pending={reject.isPending}
        onConfirm={confirmReject}
      />
    </div>
  );
}
