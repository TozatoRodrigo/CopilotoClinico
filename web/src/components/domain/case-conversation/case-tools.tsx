"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise, Paperclip, Toolbox, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { isFerramentasEnabled } from "@/lib/feature-flags";
import { useMessages } from "@/lib/messages/use-messages";
import {
  openToolFromCase,
  prefilledFieldCount,
  type CaseToolAttachment,
} from "@/lib/case-tool-link";
import type { CaseToolSuggestions } from "@/lib/types";

/**
 * CC-332 — "Ferramentas para este caso", dentro do plano: a ferramenta certa,
 * aberta já com o dado do caso. A sugestão vem da API
 * (`COPILOT_TOOL_SUGGESTIONS`) por regra fixa; a tela só aparece com as
 * Ferramentas ligadas no web (`NEXT_PUBLIC_FERRAMENTAS`). O dado do caso vai
 * pela sessão da aba, nunca pelo endereço.
 */
export function CaseToolSuggestionsSection({
  encounterId,
  interactionId,
  toolSuggestions,
}: {
  encounterId: string;
  interactionId: string;
  toolSuggestions: CaseToolSuggestions | undefined;
}) {
  const messages = useMessages();
  const router = useRouter();
  const copy = messages.caseTools;
  if (!isFerramentasEnabled() || !toolSuggestions || toolSuggestions.suggestions.length === 0) {
    return null;
  }
  const { facts, suggestions, mappingVersion } = toolSuggestions;

  return (
    <section aria-label={copy.title} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 border-b border-border pb-1.5 text-sm font-semibold text-foreground">
        <Toolbox className="size-4 text-muted-foreground" aria-hidden="true" />
        {copy.title}
      </h3>
      <ul className="flex flex-col divide-y divide-border">
        {suggestions.map((suggestion) => {
          const prefilled = prefilledFieldCount(suggestion.target, facts);
          return (
            <li
              key={suggestion.ruleId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[0.9375rem] text-pretty text-foreground">{suggestion.reason}</span>
                {prefilled > 0 && (
                  <span className="text-[0.8125rem] text-muted-foreground">{copy.prefilled(prefilled)}</span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(openToolFromCase({ encounterId, interactionId, suggestion, facts }))
                }
              >
                {copy.open(suggestion.name)}
                <ArrowRight aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-[0.8125rem] text-pretty text-muted-foreground">
        {copy.mappingNote(mappingVersion)}
      </p>
    </section>
  );
}

/**
 * Os resultados que o médico anexou nas ferramentas: ficam aqui até a
 * próxima reanálise, que os leva junto (as respostas às perguntas também).
 */
export function CaseToolAttachments({
  items,
  canRespond,
  busy,
  onRemove,
  onReanalyze,
}: {
  items: CaseToolAttachment[];
  canRespond: boolean;
  busy: boolean;
  onRemove: (id: string) => void;
  onReanalyze: () => void;
}) {
  const messages = useMessages();
  const copy = messages.caseTools;
  if (items.length === 0) return null;

  return (
    <section
      aria-label={copy.attachedTitle}
      className="flex flex-col gap-3 rounded-lg border border-border px-3.5 py-3"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
          {copy.attachedTitle}
        </h3>
        <p className="text-[0.8125rem] text-muted-foreground">
          {canRespond ? copy.attachedHint : copy.limitReached}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">{item.toolName}</span>
              <span className="text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
                {item.text.split("\n")[0]}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(item.id)}
              disabled={busy}
              aria-label={copy.remove(item.toolName)}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {canRespond && (
        <Button type="button" variant="outline" className="self-start" onClick={onReanalyze} disabled={busy}>
          <ArrowsClockwise weight="bold" aria-hidden="true" />
          {copy.reanalyze}
        </Button>
      )}
    </section>
  );
}
