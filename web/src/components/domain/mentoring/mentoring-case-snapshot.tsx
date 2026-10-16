import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/layout/page-header';
import type { MentoringCaseSnapshot } from '@/lib/types';

const CONTEXT_LABELS: Record<string, string> = {
  hasCT: 'TC',
  isSus: 'SUS',
  hasLab: 'Laboratório',
  hasICU: 'UTI',
};

const SEVERITY: Record<string, { label: string; variant: 'destructive' | 'warning' | 'yellow' }> = {
  critical: { label: 'Crítica', variant: 'destructive' },
  high: { label: 'Alta', variant: 'warning' },
  moderate: { label: 'Moderada', variant: 'yellow' },
};

/**
 * CC-707 — o caso como chegou ao mentor: texto mascarado e plano da IA. É
 * exatamente o que foi enviado no pedido, mesmo que o caso tenha sido
 * reanalisado depois.
 */
export function MentoringCaseSnapshotView({ snapshot }: { snapshot: MentoringCaseSnapshot }) {
  const { plan } = snapshot;
  const contexts = snapshot.context
    ? Object.entries(CONTEXT_LABELS).filter(
        ([key]) => snapshot.context?.[key as keyof typeof snapshot.context],
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="snapshot-case" className="flex flex-col gap-2">
        <SectionHeader as="h3" title={<span id="snapshot-case">Caso (mascarado)</span>} />
        {contexts.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {contexts.map(([, label]) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </span>
        )}
        <p className="text-[0.9375rem] whitespace-pre-wrap text-foreground">
          {snapshot.caseText ?? 'Sem texto do caso.'}
        </p>
      </section>

      <section aria-labelledby="snapshot-plan" className="flex flex-col gap-3">
        <SectionHeader
          as="h3"
          title={<span id="snapshot-plan">Plano da IA</span>}
          description={
            plan.uncertainty ? 'A IA marcou incerteza: há dados que mudam a conduta.' : undefined
          }
        />

        {plan.redFlags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[0.8125rem] font-semibold text-foreground">Sinais de alarme</h4>
            <ul className="flex flex-col gap-1">
              {plan.redFlags.map((flag, index) => {
                const severity = SEVERITY[flag.severity];
                return (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                    {severity && <Badge variant={severity.variant}>{severity.label}</Badge>}
                    <span>{flag.finding}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {plan.differentials.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[0.8125rem] font-semibold text-foreground">Hipóteses</h4>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground">
              {plan.differentials.map((d, index) => (
                <li key={index}>
                  {d.hypothesis}
                  {d.cannotMiss && (
                    <Badge variant="destructive" className="ml-2">
                      Não pode passar
                    </Badge>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {plan.recommendations.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[0.8125rem] font-semibold text-foreground">Condutas sugeridas</h4>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
              {plan.recommendations.map((rec, index) => (
                <li key={index}>
                  {rec.action}
                  {rec.preliminary && (
                    <Badge variant="secondary" className="ml-2">
                      Preliminar
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.pendingQuestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[0.8125rem] font-semibold text-foreground">
              Perguntas em aberto da IA
            </h4>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {plan.pendingQuestions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
