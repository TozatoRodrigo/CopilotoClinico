import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";
import { CitationFootnote, type CitationFootnoteProps } from "@/components/domain/citation-footnote";

interface BlockerQuestionCardProps {
  question: string;
  why: string;
  citation?: Omit<CitationFootnoteProps, "className">;
  children: ReactNode;
  className?: string;
}

export function BlockerQuestionCard({
  question,
  why,
  citation,
  children,
  className,
}: BlockerQuestionCardProps) {
  return (
    <Card className={cn("border-clinical-amber/50 bg-clinical-amber-bg/40", className)}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">{question}</CardTitle>
          <Badge variant="warning">{messages.blocker.changesConduct}</Badge>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer select-none font-medium text-foreground">
            {messages.blocker.whyAsk}
          </summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>{why}</p>
            {citation && <CitationFootnote {...citation} />}
          </div>
        </details>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
