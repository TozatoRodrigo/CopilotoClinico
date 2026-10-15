import type { ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";
import { CitationFootnote, type CitationFootnoteProps } from "@/components/domain/citation-footnote";

interface BlockerQuestionCardProps {
  question: string;
  why: string;
  /** F1 — decisão v2: "Separa: A × B", as hipóteses que a resposta separa. */
  separates?: string;
  citation?: Omit<CitationFootnoteProps, "className">;
  children: ReactNode;
  className?: string;
}

/**
 * Pergunta que muda a conduta, como callout laranja do Notion (semântica
 * clínica fixa: laranja = muda a conduta). A tag "Muda a conduta" repete o
 * significado em texto — a cor nunca é o único sinal.
 */
export function BlockerQuestionCard({
  question,
  why,
  separates,
  citation,
  children,
  className,
}: BlockerQuestionCardProps) {
  return (
    <div
      data-slot="blocker-question"
      className={cn(
        "flex gap-3 rounded-md bg-tone-orange-bg px-4 py-3.5 text-tone-orange-ink",
        className,
      )}
    >
      <WarningCircle
        aria-hidden="true"
        weight="fill"
        className="mt-0.5 size-[18px] shrink-0 text-tone-orange"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3 className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug text-pretty">
              {question}
            </h3>
            <Badge variant="warning" className="bg-background/70 dark:bg-tone-orange-tag">
              {messages.blocker.changesConduct}
            </Badge>
          </div>
          {separates && <p className="text-[0.8125rem] font-medium">{separates}</p>}
          <Disclosure
            title={
              <span className="text-[0.8125rem] font-normal opacity-80">
                {messages.blocker.whyAsk}
              </span>
            }
          >
            <div className="space-y-2.5 text-[0.8125rem] leading-relaxed opacity-90">
              <p>{why}</p>
              {citation && <CitationFootnote {...citation} />}
            </div>
          </Disclosure>
        </div>
        {children}
      </div>
    </div>
  );
}
