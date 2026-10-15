'use client';

import type { ReactNode } from 'react';
import type { ResultTone } from '@clinical-tools/tone';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Badge } from '@/components/ui/badge';
import { toneBg, toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Peças comuns aos protocolos de heparina e insulina (CC-312): o bloco da
 * diluição, a tabela com a linha atual e o par de resultados no tom da faixa.
 */

export function DilutionBlock({
  preparation,
  concentration,
  note,
}: {
  preparation: string;
  concentration: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle px-3 py-2.5">
      <span className="text-[0.8125rem] font-medium text-muted-foreground">Diluição</span>
      <p className="text-sm text-foreground">{preparation}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">{concentration}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export interface ProtocolTableProps {
  caption: string;
  headers: readonly string[];
  rows: readonly { id: string; cells: readonly string[] }[];
  /** Linha da faixa atual; destacada com cor e com o selo "Atual". */
  currentId: string | null;
}

/** Tabela do protocolo (nomograma, glicemia) com a linha atual marcada. */
export function ProtocolTable({ caption, headers, rows, currentId }: ProtocolTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-surface-subtle text-left text-[0.8125rem] text-muted-foreground">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const current = row.id === currentId;
            return (
              <tr
                key={row.id}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'border-t border-border',
                  current ? 'bg-tone-blue-bg font-semibold text-tone-blue-ink' : 'text-foreground',
                )}
              >
                {row.cells.map((cell, index) => (
                  <td key={index} className="px-3 py-2 tabular-nums">
                    {cell}
                    {current && index === 0 ? (
                      <Badge variant="blue" className="ml-2">
                        Atual
                      </Badge>
                    ) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface ResultItem {
  label: string;
  value: string;
  unit?: string;
}

/**
 * Resultado do protocolo: dois valores grandes no tom da faixa e uma linha de
 * situação anunciada ao leitor de tela. Sem resultado, só a mensagem.
 */
export function ResultPair({
  tone,
  items,
  status,
  pending,
}: {
  tone: ResultTone;
  items: readonly ResultItem[] | null;
  /** Rótulo da faixa e frase de apoio. */
  status: { label: string; text?: ReactNode } | null;
  pending: string;
}) {
  const designTone = items ? RESULT_TONE[tone] : 'gray';
  return (
    <div
      data-slot="protocol-result"
      data-tone={designTone}
      className={cn('flex flex-col gap-3 rounded-lg px-3 py-3', toneBg[designTone])}
    >
      {items ? (
        <dl className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[0.8125rem] font-medium text-muted-foreground">{item.label}</dt>
              <dd className="text-xl font-semibold text-pretty text-foreground tabular-nums">
                {item.value}
                {item.unit ? (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {item.unit}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
        {items && status ? (
          <>
            <span className={cn('rounded-[3px] px-1.5 py-0.5 font-medium', toneTag[designTone])}>
              {status.label}
            </span>
            {status.text ? <span className="text-foreground">{status.text}</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">{pending}</span>
        )}
      </p>
    </div>
  );
}
