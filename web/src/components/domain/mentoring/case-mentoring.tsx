'use client';

import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { ChatsCircle, Clock, Star, Stethoscope, Warning } from '@phosphor-icons/react';
import { ApiError } from '@/lib/api-client';
import {
  MENTORING_QUESTION_MAX_LENGTH,
  MENTORING_STATUS_LABEL,
  useCancelMentoringRequest,
  useCreateMentoringRequest,
  useEncounterMentoring,
  useMarkMentoringAnswerSeen,
  useMentoringEnabled,
  useRateMentoringRequest,
} from '@/lib/mentoring-queries';
import type { MentoringRequestView, MentoringTerms } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/layout/page-header';
import { MentoringTermsText } from './mentoring-terms';
import { cn } from '@/lib/utils';

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

interface CaseMentoringProps {
  encounterId: string;
  /** O pedido leva o plano da IA: sem análise, o botão fica indisponível. */
  hasAnalysis: boolean;
  /** Caso cancelado não é discutido. */
  closed?: boolean;
}

/**
 * CC-707 — "Discutir com um médico da equipe", no próprio caso.
 *
 * Com `COPILOT_MENTORING` desligada não renderiza nada. Ligada: o botão abre
 * o aviso de que não é para urgência e o termo (CC-708); o pedido em aberto
 * mostra o estado; a resposta do mentor aparece aqui, com a nota de 1 a 5.
 */
export function CaseMentoring({ encounterId, hasAnalysis, closed = false }: CaseMentoringProps) {
  const config = useMentoringEnabled();
  const requests = useEncounterMentoring(encounterId, config !== null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!config) return null;

  const items = requests.data ?? [];
  const open = items.find((item) => item.status === 'pending' || item.status === 'claimed');
  const answered = items.filter((item) => item.status === 'answered');
  const canRequest = !open && !closed;

  return (
    <section aria-labelledby="mentoring-title" className="flex flex-col gap-3">
      <SectionHeader
        title={<span id="mentoring-title">Discussão com a equipe</span>}
        description="Assíncrona: um médico da equipe responde aqui, no caso. Não é para urgência."
      />

      {/* Fora do cabeçalho: o rótulo longo não cabe ao lado do título no celular. */}
      {canRequest && (
        <div className="flex flex-col items-start gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="max-sm:w-full"
            disabled={!hasAnalysis}
            onClick={() => setDialogOpen(true)}
          >
            <Stethoscope aria-hidden="true" />
            Discutir com um médico da equipe
          </Button>
          {!hasAnalysis && (
            <p className="text-[0.8125rem] text-muted-foreground">
              Disponível depois do plano do copiloto: o pedido leva o caso e o plano.
            </p>
          )}
        </div>
      )}

      {open && <OpenRequest encounterId={encounterId} request={open} />}

      {answered.map((request) => (
        <MentoringAnswer key={request.id} encounterId={encounterId} request={request} />
      ))}

      <MentoringRequestDialog
        encounterId={encounterId}
        terms={config.terms}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  );
}

function OpenRequest({
  encounterId,
  request,
}: {
  encounterId: string;
  request: MentoringRequestView;
}) {
  const cancel = useCancelMentoringRequest(encounterId);

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ requestId: request.id });
      toast.success('Pedido cancelado.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível cancelar. Tente novamente.'));
    }
  }

  return (
    <div className="flex flex-col gap-2 border-y border-border px-2 py-3">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          {MENTORING_STATUS_LABEL[request.status]}
          {request.status === 'claimed' && request.mentorName && (
            <span className="text-muted-foreground"> · {request.mentorName}</span>
          )}
        </span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          Pedido em {formatDateTime(request.createdAt)}
        </span>
      </p>
      {request.question && (
        <p className="text-[0.8125rem] whitespace-pre-wrap text-muted-foreground">
          Sua dúvida: {request.question}
        </p>
      )}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          loading={cancel.isPending}
          onClick={() => void handleCancel()}
        >
          Cancelar pedido
        </Button>
      </div>
    </div>
  );
}

function MentoringAnswer({
  encounterId,
  request,
}: {
  encounterId: string;
  request: MentoringRequestView;
}) {
  const { mutate: markSeen } = useMarkMentoringAnswerSeen(encounterId);
  const unseen = request.answerSeenAt === null;
  // "Nova" fica enquanto o médico está na tela, mesmo depois de marcada como lida.
  const [isNew] = useState(unseen);

  // Abrir o caso com a resposta na tela é o "li": tira o aviso do Plantão.
  useEffect(() => {
    if (unseen) markSeen({ requestId: request.id });
  }, [unseen, markSeen, request.id]);

  return (
    <article
      aria-label={`Resposta de ${request.mentorName ?? 'um médico da equipe'}`}
      className="flex flex-col gap-3 rounded-md border border-border px-4 py-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <ChatsCircle className="size-4 shrink-0 text-tone-blue" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">
          {request.mentorName ?? 'Médico da equipe'}
        </span>
        {isNew && <Badge variant="blue">Nova</Badge>}
        {request.answeredAt && (
          <time
            dateTime={request.answeredAt}
            className="ml-auto text-xs text-muted-foreground tabular-nums"
          >
            {formatDateTime(request.answeredAt)}
          </time>
        )}
      </header>
      {request.question && (
        <p className="text-[0.8125rem] whitespace-pre-wrap text-muted-foreground">
          Sua dúvida: {request.question}
        </p>
      )}
      <p className="text-[0.9375rem] whitespace-pre-wrap text-foreground">{request.answer}</p>
      <p className="text-xs text-muted-foreground">
        Opinião em teleinterconsulta. Você segue responsável pelo paciente e pelas decisões.
      </p>
      <MentoringRating encounterId={encounterId} request={request} />
    </article>
  );
}

const RATINGS = [1, 2, 3, 4, 5] as const;

function MentoringRating({
  encounterId,
  request,
}: {
  encounterId: string;
  request: MentoringRequestView;
}) {
  const rate = useRateMentoringRequest(encounterId);
  const labelId = useId();

  if (request.satisfaction !== null) {
    return (
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <Star weight="fill" className="size-4 text-tone-yellow" aria-hidden="true" />
        Sua nota: {request.satisfaction} de 5
      </p>
    );
  }

  async function send(satisfaction: number) {
    try {
      await rate.mutateAsync({ requestId: request.id, body: { satisfaction } });
      toast.success('Obrigado pela avaliação.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível registrar a nota. Tente novamente.'));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="mr-1 text-[0.8125rem] text-muted-foreground">
        Esta resposta ajudou?
      </span>
      {RATINGS.map((value) => (
        <Button
          key={value}
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground max-sm:size-10"
          disabled={rate.isPending}
          aria-label={`Nota ${value} de 5`}
          onClick={() => void send(value)}
        >
          <Star aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}

/**
 * O passo que separa o clique do envio: aviso de urgência, termo e aceite.
 * "Enviar" só habilita com o aceite marcado.
 */
export function MentoringRequestDialog({
  encounterId,
  terms,
  open,
  onOpenChange,
}: {
  encounterId: string;
  terms: MentoringTerms;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateMentoringRequest(encounterId);
  const [accepted, setAccepted] = useState(false);
  const [question, setQuestion] = useState('');
  const questionId = useId();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setAccepted(false);
      setQuestion('');
    }
  }

  async function submit() {
    try {
      await create.mutateAsync({
        termsVersion: terms.version,
        acknowledgedNotUrgent: true,
        question: question.trim() || undefined,
      });
      toast.success('Pedido enviado. A resposta aparece aqui no caso.');
      close(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível enviar o pedido. Tente novamente.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Discutir com um médico da equipe</DialogTitle>
          <DialogDescription>
            O caso vai com os dados identificáveis mascarados, junto com o plano da IA.
          </DialogDescription>
        </DialogHeader>

        <Callout tone="orange" icon={<Warning weight="fill" />} title="Não é para urgência">
          A resposta é assíncrona e pode levar horas. Em urgência, siga o protocolo do seu serviço.
          Você continua responsável pelo paciente.
        </Callout>

        <MentoringTermsText
          document={terms.requester}
          version={terms.version}
          provisional={terms.provisional}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={questionId}>O que você quer discutir? (opcional)</Label>
          <Textarea
            id={questionId}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={MENTORING_QUESTION_MAX_LENGTH}
            placeholder="Ex.: vale anticoagular já ou espero a tomografia?"
          />
          <p className="text-xs text-muted-foreground">
            Não escreva nome, documento ou outro dado que identifique o paciente.
          </p>
        </div>

        <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
          />
          <span
            className={cn(
              'text-[0.8125rem]',
              accepted ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            Li o termo, sei que não é para urgência e sigo responsável pelo paciente.
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={create.isPending}>
            Voltar
          </Button>
          <Button onClick={() => void submit()} disabled={!accepted} loading={create.isPending}>
            Enviar para a equipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
