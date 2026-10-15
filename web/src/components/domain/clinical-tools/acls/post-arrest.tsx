'use client';

import Link from 'next/link';
import { TOOLS } from '@clinical-tools/catalog';
import { toolHref } from '@clinical-tools/links';
import { buildAclsReport, formatClockTime } from '@clinical-tools/acls/report';
import {
  HS_CAUSES,
  ROSC_CHECKLIST,
  splitFirstSentence,
  TS_CAUSES,
  type ReversibleCause,
} from '@clinical-tools/acls/reversible-causes';
import { aclsElapsedSeconds, formatElapsed } from '@clinical-tools/acls/session';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { CopyToChartButton } from '../copy-to-chart-button';
import { useAclsSession } from './acls-session-provider';

/**
 * Pós-parada e causas reversíveis (CC-314): H's e T's durante a parada,
 * checklist pós-RCE, desfecho e o relatório para o prontuário.
 */

/**
 * Link do card para outra ferramenta; "em breve" enquanto ela não foi portada.
 * O destino oferece "Voltar para Parada…" e a parada segue na faixa do topo
 * (CC-331).
 */
function CauseLink({ target }: { target: NonNullable<ReversibleCause['link']> }) {
  const tool = TOOLS.find(({ id }) => id === target);
  if (!tool) return null;
  if (tool.status !== 'disponivel') {
    return (
      <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{tool.name}</span>
        <Badge variant="gray">Em breve</Badge>
      </span>
    );
  }
  return (
    <Link
      href={toolHref(tool.id, { from: { tool: 'acls' } })}
      className="mt-1 text-sm text-link underline-offset-4 hover:underline"
    >
      Abrir {tool.name}
    </Link>
  );
}

function CauseList({ title, causes }: { title: string; causes: readonly ReversibleCause[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      {causes.map((cause) => {
        const { lead, rest } = splitFirstSentence(cause.action);
        return (
          <Disclosure
            key={cause.id}
            title={cause.name}
            className="rounded-md border border-border px-2 py-1"
          >
            <div className="flex flex-col gap-1 pb-1 text-[0.9375rem] text-foreground">
              <p className="text-pretty">
                <strong className="font-semibold">{lead}</strong>
                {rest ? ` ${rest}` : null}
              </p>
              {cause.link ? <CauseLink target={cause.link} /> : null}
            </div>
          </Disclosure>
        );
      })}
    </div>
  );
}

/** Os 10 cards de H's e T's, fechados para não empurrar a parada para baixo. */
export function ReversibleCausesSection() {
  return (
    <Disclosure title="Causas reversíveis (H's e T's)">
      <div className="flex flex-col gap-3">
        <CauseList title="Hs" causes={HS_CAUSES} />
        <CauseList title="Ts" causes={TS_CAUSES} />
      </div>
    </Disclosure>
  );
}

function RoscChecklist() {
  const { state, toggleRoscItem } = useAclsSession();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-semibold text-foreground">
        Checklist pós-RCE (AHA 2025)
      </legend>
      {ROSC_CHECKLIST.map((item) => (
        <label
          key={item.id}
          className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-[0.9375rem] text-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
        >
          <input
            type="checkbox"
            checked={state.roscChecklist.includes(item.id)}
            onChange={() => toggleRoscItem(item.id)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="text-pretty">{item.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Desfecho, checklist (RCE) e relatório da parada encerrada. */
export function AclsOutcome() {
  const { state, now } = useAclsSession();
  const rosc = state.outcome === 'rosc';
  const total = formatElapsed(aclsElapsedSeconds(state, now));
  const report = buildAclsReport(state, state.report?.number ?? 1);

  return (
    <div className="flex flex-col gap-6">
      {rosc ? (
        <Callout title="RCE obtido">Tempo total: {total}</Callout>
      ) : (
        <Callout title="Fim dos esforços">
          {state.endedAt !== null ? `Horário do óbito: ${formatClockTime(state.endedAt)} · ` : ''}
          Tempo total de RCP: {total}
        </Callout>
      )}

      {rosc ? <RoscChecklist /> : null}

      <section aria-labelledby="acls-relatorio" className="flex flex-col gap-3">
        <h2 id="acls-relatorio" className="text-base font-semibold text-foreground">
          Relatório
        </h2>
        <p className="text-sm text-muted-foreground">
          {state.report
            ? `Guardado neste aparelho como atendimento #${state.report.number}, sem identificação do paciente.`
            : 'Não foi possível guardar neste aparelho; copie o relatório agora.'}
        </p>
        <pre
          data-slot="acls-report"
          className="rounded-md bg-surface-subtle px-3 py-2 font-sans text-sm whitespace-pre-wrap text-foreground"
        >
          {report}
        </pre>
        <CopyToChartButton text={report} />
      </section>
    </div>
  );
}
