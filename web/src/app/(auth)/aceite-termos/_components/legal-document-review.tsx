import type { PendingLegalDocument } from '@contracts/legal';
import { Badge } from '@/components/ui/badge';
import { Disclosure } from '@/components/ui/disclosure';

/** "15 de outubro de 2026". */
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * CC-905 — um documento a aceitar: o que mudou desde a versão que o médico
 * aceitou (ou o resumo, no primeiro aceite) à vista, e o texto completo a um
 * clique. O texto provisório aparece marcado, nunca escondido.
 */
export function LegalDocumentReview({ document }: { document: PendingLegalDocument }) {
  const headingId = `legal-${document.id}`;
  const changed = document.previouslyAcceptedVersion !== null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3.5"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="text-[0.9375rem] font-semibold text-foreground">
            {document.title}
          </h2>
          {document.provisional && <Badge variant="warning">Provisório</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Versão <span className="font-mono">{document.version}</span> · em vigor desde{' '}
          {formatLongDate(document.publishedAt)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[0.8125rem] font-medium text-muted-foreground">
          {changed ? 'O que mudou desde a versão que você aceitou' : 'Novidades desta versão'}
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-pretty text-foreground marker:text-muted-foreground">
          {document.changeSummary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <Disclosure title="Ler o texto completo">
        <div
          role="region"
          aria-label={`Texto completo: ${document.title}`}
          tabIndex={0}
          className="flex max-h-80 flex-col gap-4 overflow-y-auto rounded-md pr-1 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {document.sections.map((section) => (
            <div key={section.heading} className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-foreground">{section.heading}</h4>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm text-pretty text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </div>
      </Disclosure>
    </section>
  );
}
