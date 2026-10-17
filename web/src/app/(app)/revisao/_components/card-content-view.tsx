'use client';

import type { Ref } from 'react';
import type {
  KnowledgeCardCitation,
  KnowledgeCardClaim,
  KnowledgeCardContent,
  KnowledgeCardDose,
} from '@contracts/knowledge-cards';
import { CLAIM_KIND_LABEL, CLAIM_KIND_ORDER } from '../_lib/card-labels';

function Quote({
  citation,
  onOpenSource,
}: {
  citation: KnowledgeCardCitation;
  onOpenSource: (key: string) => void;
}) {
  return (
    <blockquote className="flex flex-col gap-0.5 border-l-2 border-border pl-3 text-[0.8125rem] text-muted-foreground">
      <p className="text-pretty">“{citation.quote}”</p>
      <button
        type="button"
        onClick={() => onOpenSource(citation.sourceKey)}
        className="self-start rounded-sm text-xs font-medium text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-1.5"
      >
        Ver no texto da fonte {citation.sourceKey}
      </button>
    </blockquote>
  );
}

function DoseBlock({
  dose,
  onOpenSource,
}: {
  dose: KnowledgeCardDose;
  onOpenSource: (key: string) => void;
}) {
  const rows: [string, string | null][] = [
    ['Droga', dose.drug],
    ['Dose', dose.amount],
    ['Via', dose.route],
    ['Frequência', dose.frequency],
    ['Dose máxima', dose.maxDose],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">Dose estruturada</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={value ? 'font-medium text-foreground' : 'text-muted-foreground'}>
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
      <Quote citation={dose.citation} onOpenSource={onOpenSource} />
    </div>
  );
}

function ClaimItem({
  claim,
  onOpenSource,
}: {
  claim: KnowledgeCardClaim;
  onOpenSource: (key: string) => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="text-[0.9375rem] text-pretty text-foreground">{claim.text}</p>
      {claim.dose && <DoseBlock dose={claim.dose} onOpenSource={onOpenSource} />}
      {claim.citations.map((citation, index) => (
        <Quote
          key={`${citation.sourceKey}-${index}`}
          citation={citation}
          onOpenSource={onOpenSource}
        />
      ))}
    </li>
  );
}

/**
 * CC-404 — o cartão como o médico vai lê-lo: pergunta, população, resposta
 * curta e as afirmações por tipo (o que fazer agora primeiro), cada uma com
 * o trecho que a sustenta e o atalho para o texto da fonte.
 */
export function CardContentView({
  content,
  onOpenSource,
  headingRef,
}: {
  content: KnowledgeCardContent;
  onOpenSource: (key: string) => void;
  /** Recebe o foco quando a fila passa ao próximo cartão (leitor de tela). */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <article aria-labelledby="card-question" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h2
          id="card-question"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-balance text-foreground outline-none"
        >
          {content.question}
        </h2>
        {content.population && (
          <p className="text-sm text-muted-foreground">Vale para: {content.population}</p>
        )}
      </header>

      <section aria-labelledby="card-answer-title" className="flex flex-col gap-2">
        <h3 id="card-answer-title" className="text-xs font-medium text-muted-foreground">
          Resposta
        </h3>
        <p className="text-base text-pretty text-foreground">{content.answer}</p>
        {content.answerCitations.map((citation, index) => (
          <Quote
            key={`${citation.sourceKey}-${index}`}
            citation={citation}
            onOpenSource={onOpenSource}
          />
        ))}
      </section>

      {CLAIM_KIND_ORDER.map((kind) => {
        const claims = content.claims.filter((claim) => claim.kind === kind);
        if (claims.length === 0) return null;
        const titleId = `card-claims-${kind}`;
        return (
          <section key={kind} aria-labelledby={titleId} className="flex flex-col">
            <h3 id={titleId} className="text-base font-semibold text-foreground">
              {CLAIM_KIND_LABEL[kind]}
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {claims.map((claim, index) => (
                <ClaimItem key={`${kind}-${index}`} claim={claim} onOpenSource={onOpenSource} />
              ))}
            </ul>
          </section>
        );
      })}
    </article>
  );
}
