'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowClockwise, Info, PaperPlaneTilt, Scales, WarningCircle } from '@phosphor-icons/react';
import type {
  LegalAdminDocumentType,
  LegalAdminOverview,
  LegalDocumentDraftSummary,
} from '@contracts/legal';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useLegalAdminOverview, usePublishLegalDocument } from '@/lib/legal-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Metric } from '../_components/metric';
import { RateMeter } from '../_components/charts';
import { formatDate } from '../_lib/format';

/**
 * CC-905 — termos de uso e política de privacidade no console: versão
 * vigente, percentual de aceite, histórico e as versões do código ainda não
 * publicadas. Publicar (só ADMIN) reabre o aceite de todas as contas no
 * próximo acesso; Compliance só acompanha.
 */
export default function LegalDocumentsAdminPage() {
  const { role } = useAuth();
  const overview = useLegalAdminOverview();
  const canPublish = role === 'admin';

  return (
    <Page width="default">
      <PageHeader
        icon={Scales}
        title="Termos e privacidade"
        description="Versões dos Termos de Uso e da Política de Privacidade e o aceite das contas. Publicar uma versão pede um novo aceite a todos no próximo acesso."
      />

      {overview.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os documentos</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {overview.error instanceof ApiError ? overview.error.message : 'Erro inesperado.'}
            </span>
            <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>
              <ArrowClockwise aria-hidden="true" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <GateNotice overview={overview.data} />
          <Summary overview={overview.data} />
          {overview.data
            ? overview.data.types.map((entry) => (
                <DocumentTypeSection key={entry.type} entry={entry} canPublish={canPublish} />
              ))
            : [0, 1].map((index) => <Skeleton key={index} className="h-48 w-full" />)}
        </>
      )}
    </Page>
  );
}

function GateNotice({ overview }: { overview: LegalAdminOverview | undefined }) {
  if (!overview) return null;
  if (!overview.enabled) {
    return (
      <Callout tone="gray" icon={<Info weight="fill" />} title="Aceite desligado">
        Com <code className="font-mono text-[0.8125rem]">LEGAL_TERMS_V2</code> desligada, ninguém é
        bloqueado. Publicar agora só deixa a versão pronta para quando a flag for ligada.
      </Callout>
    );
  }
  if (overview.fullyAccepted === null) {
    return (
      <Callout tone="orange" icon={<WarningCircle weight="fill" />} title="Nada publicado">
        A flag está ligada, mas sem versão publicada nada é exigido. Publique os Termos de Uso e a
        Política de Privacidade abaixo.
      </Callout>
    );
  }
  return (
    <Callout tone="blue" icon={<Info weight="fill" />} title="Aceite ativo">
      Quem não aceitou a versão vigente vê a tela de aceite e a API recusa as demais rotas até o
      aceite. Exportação, eliminação de dados e logout seguem abertos.
    </Callout>
  );
}

function Summary({ overview }: { overview: LegalAdminOverview | undefined }) {
  const loading = !overview;
  const fullyAccepted = overview?.fullyAccepted ?? null;
  const eligible = overview?.eligibleAccounts ?? 0;
  const rate = fullyAccepted !== null && eligible > 0 ? fullyAccepted / eligible : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Metric
        label="Contas em dia com as versões vigentes"
        value={fullyAccepted === null ? '—' : `${Math.round(rate * 1000) / 10}%`}
        sub={
          fullyAccepted === null
            ? 'Nenhuma versão publicada'
            : `${fullyAccepted} de ${eligible} contas aceitaram termos e política`
        }
        tone="highlight"
        loading={loading}
      >
        {fullyAccepted !== null && <RateMeter rate={rate} />}
      </Metric>
      <Metric
        label="Contas ativas"
        value={eligible}
        sub="Sem as contas eliminadas a pedido (LGPD)"
        loading={loading}
      />
    </div>
  );
}

function DocumentTypeSection({
  entry,
  canPublish,
}: {
  entry: LegalAdminDocumentType;
  canPublish: boolean;
}) {
  const { current } = entry;
  return (
    <section aria-label={entry.label} className="flex flex-col gap-4">
      <SectionHeader title={entry.label} count={`${entry.history.length} publicadas`} />

      {current ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <div className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Vigente</span>
              <span className="font-mono text-[0.8125rem] text-foreground">{current.version}</span>
              {current.provisional ? (
                <Badge variant="warning">Provisório</Badge>
              ) : (
                <Badge variant="success">Revisado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publicada em {formatDate(current.publishedAt)} · hash{' '}
              <span className="font-mono" title={current.contentHash}>
                {current.contentHash.slice(0, 12)}
              </span>
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[0.8125rem] text-pretty text-muted-foreground">
              {current.changeSummary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Metric
            label="Aceite da versão vigente"
            value={`${current.acceptance.percent}%`}
            sub={`${current.acceptance.accepted} de ${current.acceptance.eligible} contas`}
          >
            <RateMeter rate={current.acceptance.percent / 100} />
          </Metric>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-3.5 text-sm text-muted-foreground">
          Nenhuma versão publicada.
        </p>
      )}

      {entry.drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Prontas para publicar</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {entry.drafts.map((draft) => (
              <DraftRow key={draft.version} entry={entry} draft={draft} canPublish={canPublish} />
            ))}
          </ul>
        </div>
      )}

      {entry.history.length > 1 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Histórico</h3>
          <ul className="divide-y divide-border rounded-lg border border-border text-[0.8125rem]">
            {entry.history.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-mono text-foreground">{item.version}</span>
                <span className="text-muted-foreground">{formatDate(item.publishedAt)}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {item.accepted} aceites
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DraftRow({
  entry,
  draft,
  canPublish,
}: {
  entry: LegalAdminDocumentType;
  draft: LegalDocumentDraftSummary;
  canPublish: boolean;
}) {
  const publish = usePublishLegalDocument();
  const [confirming, setConfirming] = useState(false);

  async function handlePublish() {
    try {
      await publish.mutateAsync({ type: entry.type, version: draft.version });
      toast.success(`${entry.label}: versão ${draft.version} publicada.`);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível publicar.');
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.8125rem] text-foreground">{draft.version}</span>
          {draft.provisional && <Badge variant="warning">Provisório</Badge>}
        </div>
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-[0.8125rem] text-pretty text-muted-foreground">
          {draft.changeSummary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      {canPublish ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <PaperPlaneTilt aria-hidden="true" />
            Publicar
          </Button>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle variant="brand">Publicar {entry.label}?</DialogTitle>
                <DialogDescription>
                  A versão <span className="font-mono">{draft.version}</span> passa a valer agora.
                  Com o aceite ligado, todas as contas terão de aceitá-la no próximo acesso.
                </DialogDescription>
              </DialogHeader>
              {draft.provisional && (
                <Callout tone="orange" icon={<WarningCircle weight="fill" />}>
                  Texto provisório, sem parecer jurídico. A versão final vai exigir um novo aceite.
                </Callout>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button onClick={handlePublish} loading={publish.isPending}>
                  Publicar versão
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Só ADMIN publica</span>
      )}
    </li>
  );
}
