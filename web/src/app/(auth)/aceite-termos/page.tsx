'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowClockwise, Scales, WarningCircle } from '@phosphor-icons/react';
import type { LegalDocumentType, PendingLegalDocument } from '@contracts/legal';
import { ApiError } from '@/lib/api-client';
import { useAcceptLegalDocuments, useLegalStatus } from '@/lib/legal-queries';
import { safeReturnPath } from '@/lib/legal-paths';
import { LogoMark } from '@/components/brand/logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { AuthHeading, FieldError } from '../_components/auth-ui';
import { DeclineOptions } from './_components/decline-options';
import { LegalDocumentReview } from './_components/legal-document-review';

/** Como cada documento entra na frase do aceite. */
const ACCEPTANCE_PHRASE: Record<LegalDocumentType, string> = {
  terms_of_use: 'os Termos de Uso',
  privacy_policy: 'a Política de Privacidade',
};

function acceptanceSentence(documents: readonly PendingLegalDocument[]): string {
  const phrases = documents.map((document) => ACCEPTANCE_PHRASE[document.type]);
  const last = phrases[phrases.length - 1] ?? '';
  const joined = phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} e ${last}` : last;
  return `Li e aceito ${joined} do Copiloto Clínico.`;
}

/** O `from` da URL, lido só no navegador (a página não é pré-renderizada com ele). */
function readReturnPath(): string {
  return safeReturnPath(new URLSearchParams(window.location.search).get('from'));
}

/**
 * CC-905 — tela de aceite dos termos de uso e da política de privacidade
 * (LEGAL_TERMS_V2). O médico chega aqui pelo gate do app ou por um 428 da
 * API, lê o que mudou e só segue depois de aceitar. Sem nada pendente (flag
 * desligada ou aceite feito), volta para onde estava.
 */
export default function LegalAcceptancePage() {
  const router = useRouter();
  const status = useLegalStatus();
  const accept = useAcceptLegalDocuments();
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState('');
  const [formError, setFormError] = useState('');
  const [outdated, setOutdated] = useState(false);

  const pending = status.data?.pending ?? [];
  const nothingPending = status.data !== undefined && !status.data.acceptanceRequired;

  useEffect(() => {
    if (nothingPending) router.replace(readReturnPath());
  }, [nothingPending, router]);

  async function handleAccept() {
    setFormError('');
    if (!agreed) {
      setAgreeError('Marque a caixa para confirmar que leu e aceita.');
      return;
    }
    try {
      await accept.mutateAsync({ documentIds: pending.map((document) => document.id) });
      toast.success('Aceite registrado.');
    } catch (err) {
      // 409: outra versão foi publicada enquanto a tela estava aberta.
      if (err instanceof ApiError && err.status === 409) {
        setAgreed(false);
        setOutdated(true);
        await status.refetch();
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível registrar o aceite. Tente de novo.',
      );
    }
  }

  if (status.isError) {
    return (
      <div className="flex w-full max-w-[560px] flex-col gap-8">
        <AuthHeading icon={<PageIcon />} title="Termos de Uso e Privacidade" />
        <Alert variant="destructive">
          <WarningCircle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Não foi possível carregar os termos.</span>
            <Button variant="outline" size="sm" onClick={() => void status.refetch()}>
              <ArrowClockwise aria-hidden="true" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
        <DeclineOptions />
      </div>
    );
  }

  if (!status.data || nothingPending) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label="Carregando"
      >
        <LogoMark size="lg" className="animate-pulse" />
      </div>
    );
  }

  const firstAcceptance = pending.every((document) => document.previouslyAcceptedVersion === null);
  const provisional = pending.some((document) => document.provisional);

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-8">
      <AuthHeading
        icon={<PageIcon />}
        title={firstAcceptance ? 'Antes de continuar' : 'Atualizamos os termos'}
        description={
          firstAcceptance
            ? 'Leia e aceite os Termos de Uso e a Política de Privacidade do Copiloto Clínico.'
            : 'Leia o que mudou e aceite a nova versão para continuar usando o Copiloto Clínico.'
        }
      />

      {outdated && (
        <Alert variant="warning">
          <WarningCircle aria-hidden="true" />
          <AlertDescription>
            Uma versão nova foi publicada enquanto você lia. Confira o texto abaixo e aceite de
            novo.
          </AlertDescription>
        </Alert>
      )}

      {provisional && (
        <Callout tone="orange" icon={<WarningCircle weight="fill" />} title="Texto provisório">
          Este texto ainda passa por revisão jurídica. Quando a versão final sair, pediremos um novo
          aceite.
        </Callout>
      )}

      <div className="flex flex-col gap-3">
        {pending.map((document) => (
          <LegalDocumentReview key={document.id} document={document} />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="-mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                setAgreeError('');
              }}
              disabled={accept.isPending}
              aria-invalid={!!agreeError}
              aria-describedby={agreeError ? 'legal-agree-error' : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
            />
            <span className="text-sm text-foreground">{acceptanceSentence(pending)}</span>
          </label>
          {agreeError && <FieldError id="legal-agree-error">{agreeError}</FieldError>}
        </div>

        {formError && (
          <Alert variant="destructive">
            <WarningCircle aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button size="lg" className="w-full" onClick={handleAccept} loading={accept.isPending}>
          Aceitar e continuar
        </Button>
      </div>

      <DeclineOptions />
    </div>
  );
}

function PageIcon() {
  return <Scales className="size-10 text-foreground" weight="duotone" aria-hidden="true" />;
}
