'use client';

import Link from 'next/link';
import { use, useId, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ChatsCircle, Star, Stethoscope, Warning } from '@phosphor-icons/react';
import { ApiError } from '@/lib/api-client';
import {
  asEnabledConfig,
  MENTORING_ANSWER_MAX_LENGTH,
  MENTORING_STATUS_LABEL,
  useAnswerMentoringRequest,
  useClaimMentoringRequest,
  useMentorRequest,
  useMentoringConfig,
  useReleaseMentoringRequest,
} from '@/lib/mentoring-queries';
import type { MentorRequestDetail, MentoringTerms } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/domain/empty-state';
import { MentoringCaseSnapshotView } from '@/components/domain/mentoring/mentoring-case-snapshot';
import { MentoringTermsText } from '@/components/domain/mentoring/mentoring-terms';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnswerForm({ detail, terms }: { detail: MentorRequestDetail; terms: MentoringTerms }) {
  const answer = useAnswerMentoringRequest(detail.id);
  const release = useReleaseMentoringRequest(detail.id);
  const [text, setText] = useState('');
  const [accepted, setAccepted] = useState(false);
  const answerId = useId();

  async function submit() {
    try {
      await answer.mutateAsync({ answer: text.trim(), termsVersion: terms.version });
      toast.success('Resposta enviada. Ela aparece no caso do médico.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível enviar a resposta. Tente novamente.'));
    }
  }

  async function handleRelease() {
    try {
      await release.mutateAsync(undefined);
      toast.success('Pedido devolvido à fila.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível devolver o pedido.'));
    }
  }

  return (
    <section aria-labelledby="answer-title" className="flex flex-col gap-3">
      <SectionHeader title={<span id="answer-title">Sua resposta</span>} />
      <MentoringTermsText
        document={terms.mentor}
        version={terms.version}
        provisional={terms.provisional}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={answerId}>Resposta ao médico</Label>
        <Textarea
          id={answerId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={MENTORING_ANSWER_MAX_LENGTH}
          placeholder="O que você faria, o que depende de dado que você não tem e o que observar."
        />
        <p className="text-xs text-muted-foreground">
          Dados pessoais são mascarados ao salvar. A resposta fica na trilha de auditoria.
        </p>
      </div>
      <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
        />
        <span className="text-[0.8125rem] text-foreground">
          Li o termo do médico da equipe e respondo como teleinterconsulta.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void submit()}
          disabled={!accepted || text.trim().length === 0}
          loading={answer.isPending}
        >
          Enviar resposta
        </Button>
        {detail.status === 'claimed' && detail.assignedToMe && (
          <Button variant="ghost" onClick={() => void handleRelease()} loading={release.isPending}>
            Devolver à fila
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * CC-707 — o pedido como o mentor vê: o caso mascarado e o plano da IA, a
 * dúvida do médico e o formulário de resposta com o termo do mentor.
 */
export default function MentorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const config = useMentoringConfig();
  const enabledConfig = asEnabledConfig(config.data);
  const isMentor = enabledConfig?.isMentor === true;
  const request = useMentorRequest(id, isMentor);
  const claim = useClaimMentoringRequest(id);

  async function handleClaim() {
    try {
      await claim.mutateAsync(undefined);
      toast.success('Pedido assumido. Os outros médicos da equipe veem que está com você.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível assumir o pedido.'));
    }
  }

  if (config.isPending || (isMentor && request.isPending)) {
    return (
      <Page width="narrow">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40" />
      </Page>
    );
  }

  if (!enabledConfig || !isMentor) {
    return (
      <Page width="narrow">
        <EmptyState
          icon={<Stethoscope weight="duotone" />}
          title="Área dos médicos da equipe"
          description="Os pedidos de mentoria são restritos aos médicos da equipe que respondem."
          actionLabel="Voltar ao Plantão"
          actionHref="/dashboard"
        />
      </Page>
    );
  }

  const detail = request.data;
  if (request.error || !detail) {
    return (
      <Page width="narrow">
        <Alert variant="destructive">
          <AlertTitle>Pedido não encontrado</AlertTitle>
          <AlertDescription>
            {request.error?.message ?? 'Este pedido não existe ou não está disponível para você.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="self-start">
          <Link href="/mentoria">
            <ArrowLeft aria-hidden="true" />
            Voltar à fila
          </Link>
        </Button>
      </Page>
    );
  }

  const claimedByOther = detail.status === 'claimed' && !detail.assignedToMe;
  const canAnswer =
    detail.status === 'pending' || (detail.status === 'claimed' && detail.assignedToMe);

  return (
    <Page width="narrow">
      <PageHeader
        icon={Stethoscope}
        size="compact"
        eyebrow={`Pedido em ${formatDateTime(detail.createdAt)}`}
        title={detail.mainHypothesis ?? 'Pedido de mentoria'}
        actions={
          detail.status === 'pending' ? (
            <Button variant="outline" onClick={() => void handleClaim()} loading={claim.isPending}>
              Assumir pedido
            </Button>
          ) : undefined
        }
        properties={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={detail.status === 'answered' ? 'success' : 'secondary'}>
              {detail.assignedToMe && detail.status === 'claimed'
                ? 'Com você'
                : MENTORING_STATUS_LABEL[detail.status]}
            </Badge>
            {detail.mentorName && <span>{detail.mentorName}</span>}
          </span>
        }
      />

      <Callout tone="orange" icon={<Warning weight="fill" />} title="Assíncrono, não é urgência">
        O médico que pediu segue responsável pelo paciente. Sua resposta é uma opinião.
      </Callout>

      {detail.question && (
        <section aria-labelledby="question-title" className="flex flex-col gap-2">
          <SectionHeader as="h3" title={<span id="question-title">Dúvida do médico</span>} />
          <p className="text-[0.9375rem] whitespace-pre-wrap text-foreground">{detail.question}</p>
        </section>
      )}

      <MentoringCaseSnapshotView snapshot={detail.caseSnapshot} />

      {detail.status === 'answered' ? (
        <section aria-labelledby="answered-title" className="flex flex-col gap-2">
          <SectionHeader as="h3" title={<span id="answered-title">Resposta enviada</span>} />
          <p className="text-[0.9375rem] whitespace-pre-wrap text-foreground">{detail.answer}</p>
          {detail.satisfaction !== null ? (
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
              <Star weight="fill" className="size-4 text-tone-yellow" aria-hidden="true" />
              Nota do médico: {detail.satisfaction} de 5
            </p>
          ) : (
            <p className="text-[0.8125rem] text-muted-foreground">O médico ainda não avaliou.</p>
          )}
        </section>
      ) : claimedByOther ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChatsCircle aria-hidden="true" />
          Outro médico da equipe assumiu este pedido.
        </p>
      ) : canAnswer ? (
        <AnswerForm detail={detail} terms={enabledConfig.terms} />
      ) : (
        <p className="text-sm text-muted-foreground">O médico cancelou este pedido.</p>
      )}
    </Page>
  );
}
