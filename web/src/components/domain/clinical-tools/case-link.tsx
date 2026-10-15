'use client';

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, ClipboardText, Paperclip } from '@phosphor-icons/react';
import { CASE_LINK_PARAM } from '@clinical-tools/links';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  attachToCase,
  clearPendingCaseLink,
  isAttachedToCase,
  readCaseLink,
  readPendingCaseLink,
  type CaseToolLink,
} from '@/lib/case-tool-link';

/**
 * CC-332 — a ferramenta aberta pelo plano do Copiloto sabe de qual caso veio.
 * O elo mora na sessão da aba e o endereço só traz o token (`?caso=`); sem
 * token no endereço (o médico seguiu para outra ferramenta), não há elo, e
 * nada de "Anexar ao caso" numa tela que não foi aberta por ele.
 */

const CaseLinkContext = createContext<CaseToolLink | null>(null);

/** O elo com o caso da ferramenta aberta pelo plano; `null` fora disso. */
export function useCaseLink(): CaseToolLink | null {
  return useContext(CaseLinkContext);
}

export const conversationHref = (encounterId: string) => `/encounters/${encounterId}/conversation`;

function TokenReader({ onToken }: { onToken: (token: string | null) => void }) {
  const token = useSearchParams().get(CASE_LINK_PARAM);
  useEffect(() => onToken(token), [token, onToken]);
  return null;
}

function CaseLinkBanner({ link }: { link: CaseToolLink }) {
  return (
    <nav
      aria-label="Caso de origem"
      className="mx-auto mb-4 flex w-full max-w-[720px] flex-wrap items-center gap-x-3 gap-y-1"
    >
      <Link
        href={conversationHref(link.encounterId)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-link transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        Voltar ao caso
      </Link>
      <span className="text-[0.8125rem] text-muted-foreground">
        Aberta pelo plano. Os campos marcados vieram do caso: confira antes de usar.
      </span>
    </nav>
  );
}

/**
 * Fica no layout das Ferramentas. Na primeira renderização o elo vem do
 * aviso "acabei de abrir pelo caso" (a Pediatria e as calculadoras do TEP
 * montam com o caso); depois, o token do endereço decide.
 */
export function CaseLinkProvider({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<CaseToolLink | null>(() => readPendingCaseLink());

  // O aviso serve só a esta abertura: outra visita às Ferramentas não o vê.
  useEffect(() => clearPendingCaseLink(), []);

  const onToken = useCallback((token: string | null) => {
    setLink((current) => {
      if (!token) return null;
      return current?.token === token ? current : readCaseLink(token);
    });
  }, []);

  return (
    <CaseLinkContext.Provider value={link}>
      <Suspense fallback={null}>
        <TokenReader onToken={onToken} />
      </Suspense>
      {link ? <CaseLinkBanner link={link} /> : null}
      {children}
    </CaseLinkContext.Provider>
  );
}

/** Marca de campo preenchido com o dado do caso: sai quando o médico troca o valor. */
export function FromCaseBadge({ id }: { id?: string }) {
  return (
    <Badge id={id} variant="blue" data-slot="from-case">
      <ClipboardText aria-hidden="true" />
      vindo do caso
    </Badge>
  );
}

/**
 * "Anexar ao caso" ao lado do "Copiar para o prontuário", só na ferramenta
 * aberta pelo plano. O resultado espera, na aba, a próxima reanálise do caso.
 */
export function AttachToCaseButton({ text }: { text: string | null }) {
  const link = useCaseLink();
  const statusId = useId();
  const [attachedText, setAttachedText] = useState<string | null>(() =>
    link && text && isAttachedToCase(link.encounterId, text) ? text : null,
  );
  if (!link) return null;

  const attached = text !== null && attachedText === text;

  function attach() {
    if (!link || !text) return;
    attachToCase(link.encounterId, { toolName: link.name, text });
    setAttachedText(text);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={attach}
        disabled={!text || attached}
        aria-describedby={attached ? statusId : undefined}
      >
        {attached ? <Check aria-hidden="true" /> : <Paperclip aria-hidden="true" />}
        {attached ? 'Anexado ao caso' : 'Anexar ao caso'}
      </Button>
      <p id={statusId} role="status" className="text-[0.8125rem] text-muted-foreground">
        {attached ? (
          <>
            Entra na próxima reanálise.{' '}
            <Link
              href={conversationHref(link.encounterId)}
              className="rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              Voltar ao caso
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
