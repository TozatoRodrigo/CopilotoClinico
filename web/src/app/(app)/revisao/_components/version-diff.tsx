'use client';

import { diffWords, type FieldChange } from '../_lib/card-diff';

function DiffText({ before, after }: { before: string; after: string }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {diffWords(before, after).map((segment, index) => {
        if (segment.kind === 'same') return <span key={index}>{segment.text}</span>;
        if (segment.kind === 'removed') {
          return (
            <del key={index} className="text-muted-foreground line-through">
              <span className="sr-only">removido: </span>
              {segment.text}
            </del>
          );
        }
        return (
          <ins key={index} className="rounded-sm bg-tone-blue-bg text-tone-blue-ink no-underline">
            <span className="sr-only">incluído: </span>
            {segment.text}
          </ins>
        );
      })}
    </p>
  );
}

/**
 * CC-404, critério 2 — o que a correção mudou. Removido riscado em cinza,
 * incluído em azul (cor de "em revisão"), e o leitor de tela ouve
 * "removido"/"incluído": a mudança nunca é só cor.
 */
export function VersionDiff({ changes }: { changes: readonly FieldChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">O conteúdo não mudou.</p>;
  }
  return (
    <ul aria-label="Mudanças da correção" className="flex flex-col gap-3">
      {changes.map((change) => (
        <li key={change.label} className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{change.label}</p>
          <DiffText before={change.before} after={change.after} />
        </li>
      ))}
    </ul>
  );
}
