'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FloppyDisk, Trash, X } from '@phosphor-icons/react';
import type {
  KnowledgeCardCitation,
  KnowledgeCardClaim,
  KnowledgeCardContent,
  KnowledgeCardContentInput,
  KnowledgeCardContentIssue,
  KnowledgeCardDose,
} from '@contracts/knowledge-cards';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CLAIM_KIND_LABEL } from '../_lib/card-labels';
import { fieldId, issueLabel, issuesAt, optionalText, toContentInput } from '../_lib/card-editor';

type Issues = readonly KnowledgeCardContentIssue[];

/** Rótulo, controle e os problemas do campo, ligados por `aria-describedby`. */
function Field({
  path,
  label,
  issues,
  children,
}: {
  path: string;
  label: string;
  issues: Issues;
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = fieldId(path);
  const own = issuesAt(issues, path);
  const errorId = `${id}-erros`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': own.length > 0 || undefined,
        'aria-describedby': own.length > 0 ? errorId : undefined,
      })}
      {own.length > 0 && (
        <ul id={errorId} className="flex flex-col gap-0.5 text-[0.8125rem] text-tone-red">
          {own.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-surface-input px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive md:h-8 md:text-sm';

function CitationFields({
  path,
  title,
  citation,
  sourceKeys,
  issues,
  onChange,
  onRemove,
}: {
  path: string;
  title: string;
  citation: KnowledgeCardCitation;
  sourceKeys: readonly string[];
  issues: Issues;
  onChange: (next: KnowledgeCardCitation) => void;
  onRemove?: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 border-l-2 border-border pl-3">
      <legend className="sr-only">{title}</legend>
      <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
        <Field path={`${path}.sourceKey`} label="Fonte" issues={issues}>
          {(props) => (
            <select
              {...props}
              value={citation.sourceKey}
              onChange={(event) => onChange({ ...citation, sourceKey: event.target.value })}
              className={SELECT_CLASS}
            >
              {sourceKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field path={`${path}.quote`} label={`${title} — trecho literal da fonte`} issues={issues}>
          {(props) => (
            <Textarea
              {...props}
              value={citation.quote}
              rows={2}
              maxLength={600}
              onChange={(event) => onChange({ ...citation, quote: event.target.value })}
            />
          )}
        </Field>
      </div>
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onRemove}>
          <X aria-hidden="true" />
          Remover esta citação
        </Button>
      )}
    </fieldset>
  );
}

function DoseFields({
  path,
  dose,
  sourceKeys,
  issues,
  onChange,
}: {
  path: string;
  dose: KnowledgeCardDose;
  sourceKeys: readonly string[];
  issues: Issues;
  onChange: (next: KnowledgeCardDose) => void;
}) {
  const required: [keyof Pick<KnowledgeCardDose, 'drug' | 'amount'>, string][] = [
    ['drug', 'Droga'],
    ['amount', 'Dose (como a fonte escreve)'],
  ];
  const optional: [keyof Pick<KnowledgeCardDose, 'route' | 'frequency' | 'maxDose'>, string][] = [
    ['route', 'Via'],
    ['frequency', 'Frequência'],
    ['maxDose', 'Dose máxima'],
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {required.map(([key, label]) => (
        <Field key={key} path={`${path}.${key}`} label={label} issues={issues}>
          {(props) => (
            <Input
              {...props}
              value={dose[key]}
              onChange={(event) => onChange({ ...dose, [key]: event.target.value })}
            />
          )}
        </Field>
      ))}
      {optional.map(([key, label]) => (
        <Field key={key} path={`${path}.${key}`} label={`${label} (opcional)`} issues={issues}>
          {(props) => (
            <Input
              {...props}
              value={dose[key] ?? ''}
              onChange={(event) => onChange({ ...dose, [key]: optionalText(event.target.value) })}
            />
          )}
        </Field>
      ))}
      <div className="sm:col-span-2">
        <CitationFields
          path={`${path}.citation`}
          title="Trecho da dose"
          citation={dose.citation}
          sourceKeys={sourceKeys}
          issues={issues}
          onChange={(citation) => onChange({ ...dose, citation })}
        />
      </div>
    </div>
  );
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, position) => (position === index ? value : item));
}

function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

/**
 * CC-404 — "Corrigir": o revisor edita a pergunta, a resposta, o texto das
 * afirmações, a dose e os trechos citados, e pode remover afirmação, dose ou
 * citação. A versão nova passa pela mesma checagem de citação do rascunho da
 * IA; o 422 volta aqui, campo a campo. Incluir afirmação ou fonte nova fica
 * no console (pede escolher trecho de diretriz, inviável no celular).
 */
export function CardEditor({
  content,
  version,
  nextVersion,
  issues,
  saving,
  title = `Corrigir a versão ${version}`,
  submitLabel = 'Salvar correção',
  children,
  onCancel,
  onSubmit,
}: {
  content: KnowledgeCardContent;
  /** Versão que o médico está corrigindo. */
  version: number;
  /** Número que a correção vai receber. */
  nextVersion: number;
  issues: Issues;
  saving: boolean;
  title?: string;
  submitLabel?: string;
  /** Campos a mais antes do conteúdo (o motivo da divergência, na revisão cruzada). */
  children?: ReactNode;
  onCancel: () => void;
  onSubmit: (content: KnowledgeCardContentInput) => void;
}) {
  const [draft, setDraft] = useState<KnowledgeCardContentInput>(() => toContentInput(content));
  const sourceKeys = draft.sources.map((source) => source.key);
  const issuesRef = useRef<HTMLDivElement>(null);

  // O 422 chega com o revisor no fim do formulário (botão Salvar): leva o resumo à vista.
  useEffect(() => {
    if (issues.length > 0)
      issuesRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [issues]);

  const updateClaim = (index: number, change: (claim: KnowledgeCardClaim) => KnowledgeCardClaim) =>
    setDraft((current) => ({
      ...current,
      claims: current.claims.map((claim, position) => (position === index ? change(claim) : claim)),
    }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft);
  }

  const kindCounter = new Map<string, number>();

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="card-editor-title"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="card-editor-title" className="text-xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          A correção vira a versão {nextVersion}. Todo trecho citado precisa estar, literal, no
          texto da fonte; toda dose, no trecho que a cita.
        </p>
      </div>

      {issues.length > 0 && (
        <Alert variant="destructive" ref={issuesRef} className="scroll-mt-16">
          <AlertTitle>A correção não foi gravada</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-0.5">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <span className="font-medium">{issueLabel(issue.path)}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {children}

      <Field path="question" label="Pergunta" issues={issues}>
        {(props) => (
          <Textarea
            {...props}
            value={draft.question}
            rows={2}
            maxLength={300}
            onChange={(event) => setDraft({ ...draft, question: event.target.value })}
          />
        )}
      </Field>
      <Field path="population" label="Vale para (opcional)" issues={issues}>
        {(props) => (
          <Input
            {...props}
            value={draft.population ?? ''}
            maxLength={300}
            onChange={(event) =>
              setDraft({ ...draft, population: optionalText(event.target.value) })
            }
          />
        )}
      </Field>
      <Field path="answer" label="Resposta" issues={issues}>
        {(props) => (
          <Textarea
            {...props}
            value={draft.answer}
            rows={3}
            maxLength={600}
            onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
          />
        )}
      </Field>
      {draft.answerCitations.map((citation, index) => (
        <CitationFields
          key={`answer-${index}`}
          path={`answerCitations[${index}]`}
          title={`Citação da resposta ${index + 1}`}
          citation={citation}
          sourceKeys={sourceKeys}
          issues={issues}
          onChange={(next) =>
            setDraft({ ...draft, answerCitations: replaceAt(draft.answerCitations, index, next) })
          }
          onRemove={
            draft.answerCitations.length > 1
              ? () =>
                  setDraft({ ...draft, answerCitations: removeAt(draft.answerCitations, index) })
              : undefined
          }
        />
      ))}

      {draft.claims.map((claim, index) => {
        const position = (kindCounter.get(claim.kind) ?? 0) + 1;
        kindCounter.set(claim.kind, position);
        const path = `claims[${index}]`;
        const name = `${CLAIM_KIND_LABEL[claim.kind]} ${position}`;
        return (
          <fieldset
            key={`claim-${index}`}
            className={cn(
              'flex flex-col gap-3 rounded-lg border border-border p-3',
              issuesAt(issues, path).length > 0 && 'border-destructive/40',
            )}
          >
            <legend className="px-1 text-sm font-semibold text-foreground">{name}</legend>
            <Field path={`${path}.text`} label="Texto" issues={issues}>
              {(props) => (
                <Textarea
                  {...props}
                  value={claim.text}
                  rows={2}
                  maxLength={500}
                  onChange={(event) =>
                    updateClaim(index, (current) => ({ ...current, text: event.target.value }))
                  }
                />
              )}
            </Field>
            {claim.dose && (
              <DoseFields
                path={`${path}.dose`}
                dose={claim.dose}
                sourceKeys={sourceKeys}
                issues={issues}
                onChange={(dose) => updateClaim(index, (current) => ({ ...current, dose }))}
              />
            )}
            {claim.citations.map((citation, citationIndex) => (
              <CitationFields
                key={`claim-${index}-citation-${citationIndex}`}
                path={`${path}.citations[${citationIndex}]`}
                title={`${name}, citação ${citationIndex + 1}`}
                citation={citation}
                sourceKeys={sourceKeys}
                issues={issues}
                onChange={(next) =>
                  updateClaim(index, (current) => ({
                    ...current,
                    citations: replaceAt(current.citations, citationIndex, next),
                  }))
                }
                onRemove={
                  claim.citations.length > 1
                    ? () =>
                        updateClaim(index, (current) => ({
                          ...current,
                          citations: removeAt(current.citations, citationIndex),
                        }))
                    : undefined
                }
              />
            ))}
            <div className="flex flex-wrap gap-1.5">
              {claim.dose && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateClaim(index, (current) => ({ ...current, dose: null }))}
                >
                  <X aria-hidden="true" />
                  Remover a dose
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover a afirmação ${name}`}
                onClick={() => setDraft({ ...draft, claims: removeAt(draft.claims, index) })}
              >
                <Trash aria-hidden="true" />
                Remover afirmação
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:px-0 md:bottom-0">
        <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 sm:flex-none" loading={saving}>
          <FloppyDisk aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
