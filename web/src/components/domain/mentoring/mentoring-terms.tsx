import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MentoringTermsDocument } from '@/lib/types';

/**
 * CC-708 — o termo da mentoria como o servidor manda (GET /mentoring/config).
 * Enquanto não houver parecer jurídico, o texto vem marcado como provisório e
 * a tela diz isso em vez de esconder.
 */
export function MentoringTermsText({
  document,
  version,
  provisional,
  className,
}: {
  document: MentoringTermsDocument;
  version: string;
  provisional: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label={document.title}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-surface-subtle px-3.5 py-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.8125rem] font-semibold text-foreground">{document.title}</h3>
        {provisional && <Badge variant="warning">Texto provisório</Badge>}
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[0.8125rem] text-pretty text-muted-foreground">
        {document.paragraphs.map((paragraph) => (
          <li key={paragraph}>{paragraph}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Versão <span className="font-mono">{version}</span>
        {provisional &&
          ' · aguardando parecer jurídico; a versão aceita fica registrada no pedido.'}
      </p>
    </section>
  );
}
