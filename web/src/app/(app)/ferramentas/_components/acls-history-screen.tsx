'use client';

import { useState } from 'react';
import { ClockCounterClockwise, Trash } from '@phosphor-icons/react';
import { ACLS_HISTORY_LIMIT, type AclsHistoryRecord } from '@clinical-tools/acls/history';
import { formatElapsed } from '@clinical-tools/acls/session';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Disclosure } from '@/components/ui/disclosure';
import { useAclsHistory } from '@/lib/acls/history-storage';

/** Botão que apaga só depois de confirmar: apagar do aparelho não tem volta. */
function ConfirmDelete({
  label,
  title,
  description,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="min-h-11"
      >
        <Trash aria-hidden="true" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

function RecordItem({ record, onDelete }: { record: AclsHistoryRecord; onDelete: () => void }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[0.9375rem] font-semibold text-foreground">
          Atendimento #{record.number}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {record.date} · {record.startTime}–{record.endTime}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{record.outcome}</span> ·{' '}
        {formatElapsed(record.durationSeconds)} · {count(record.cycles, 'ciclo', 'ciclos')} ·{' '}
        {count(record.shocks, 'choque', 'choques')} · {record.initialRhythm}
      </p>
      <Disclosure title="Relatório">
        <div className="flex flex-col gap-2">
          <pre className="max-h-80 overflow-y-auto rounded-md bg-surface-subtle px-3 py-2 font-sans text-sm whitespace-pre-wrap text-foreground">
            {record.report}
          </pre>
          <div className="flex flex-wrap items-start gap-2">
            <CopyToChartButton text={record.report} />
            <ConfirmDelete
              label="Apagar"
              title={`Apagar o atendimento #${record.number}?`}
              description="O relatório sai deste aparelho e não pode ser recuperado."
              onConfirm={onDelete}
            />
          </div>
        </div>
      </Disclosure>
    </li>
  );
}

/**
 * /ferramentas/acls/historico (CC-314): paradas encerradas neste aparelho,
 * mais recentes primeiro, com o relatório para copiar e a opção de apagar.
 */
export function AclsHistoryScreen() {
  const { records, remove, clear } = useAclsHistory();
  const newestFirst = [...records].reverse();

  return (
    <Page width="narrow" className="gap-6">
      <PageHeader
        icon={ClockCounterClockwise}
        iconTone="blue"
        title="Atendimentos salvos"
        description="Relatórios das paradas registradas no ACLS."
      />
      <Callout>
        Ficam só neste aparelho, sem identificação do paciente; nada é enviado ao servidor. Até{' '}
        {ACLS_HISTORY_LIMIT} atendimentos: passando disso, o mais antigo sai.
      </Callout>

      {newestFirst.length === 0 ? (
        <EmptyState
          icon={<ClockCounterClockwise />}
          title="Nenhum atendimento salvo"
          description="Cada parada encerrada no ACLS aparece aqui com o relatório."
          actionLabel="Abrir o ACLS"
          actionHref="/ferramentas/acls"
        />
      ) : (
        <>
          <ul aria-label="Atendimentos" className="flex flex-col">
            {newestFirst.map((record) => (
              <RecordItem key={record.id} record={record} onDelete={() => remove(record.id)} />
            ))}
          </ul>
          <div>
            <ConfirmDelete
              label="Apagar todo o histórico"
              title="Apagar todos os atendimentos?"
              description={`Os ${newestFirst.length} relatórios saem deste aparelho e não podem ser recuperados.`}
              onConfirm={clear}
            />
          </div>
        </>
      )}
    </Page>
  );
}
