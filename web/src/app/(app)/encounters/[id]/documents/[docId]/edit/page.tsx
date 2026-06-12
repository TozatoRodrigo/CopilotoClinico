'use client';

import { use, useState, useMemo } from 'react';
import {
  useConfirmDocument,
  useEncounterDocument,
  useUpdateDocument,
} from '@/lib/clinical-queries';
import type { Document } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmedSeal } from '@/components/domain/confirmed-seal';
import { AuditHash } from '@/components/domain/audit-hash';
import { toast } from 'sonner';
import { ArrowLeft, FloppyDisk, SealCheck, Robot } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

type DocType = Document['type'];

const TYPE_LABELS: Record<DocType, string> = {
  soap: 'SOAP',
  sbar: 'SBAR',
  prescricao: 'Prescrição',
  alta: 'Alta',
  atestado: 'Atestado',
};

interface FieldDef {
  key: string;
  label: string;
  mono?: boolean;
  rows?: number;
}

const SECTION_FIELDS: Record<string, FieldDef[]> = {
  soap: [
    { key: 'subjective', label: 'Subjetivo' },
    { key: 'objective', label: 'Objetivo' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'plan', label: 'Plano' },
  ],
  sbar: [
    { key: 'situation', label: 'Situação' },
    { key: 'background', label: 'Background' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'recommendation', label: 'Recomendação' },
  ],
  prescricao: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'orientacoes', label: 'Orientações', rows: 5 },
  ],
  alta: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'resumo', label: 'Resumo', rows: 4 },
    { key: 'condicaoNaAlta', label: 'Condição na Alta' },
    { key: 'retorno', label: 'Retorno' },
  ],
  atestado: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'descricao', label: 'Descrição', rows: 4 },
    { key: 'assinaturaPlaceholder', label: 'Assinatura', rows: 3 },
  ],
};

function isConfirmed(doc: Document): boolean {
  return doc.confirmedBy !== null;
}

function extractString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

export default function DocumentEditPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: encounterId, docId } = use(params);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const documentQuery = useEncounterDocument(encounterId, docId);
  const updateDocument = useUpdateDocument(encounterId, docId);
  const confirmDocument = useConfirmDocument(encounterId, docId);
  const document = documentQuery.data;
  const loading = documentQuery.isPending;
  const error = documentQuery.error?.message ?? null;

  async function handleConfirm() {
    try {
      await confirmDocument.mutateAsync();
      toast.success('Documento confirmado com sucesso.');
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao confirmar documento.');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Alert variant="destructive">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error ?? 'Documento não encontrado.'}</span>
              <Button variant="outline" size="sm" onClick={() => void documentQuery.refetch()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const locked = isConfirmed(document);

  return (
    <div className="min-h-screen bg-clinical-paper">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="flex items-center justify-between pb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-9">
              <a href={`/encounters/${encounterId}`}>
                <ArrowLeft className="mr-1 size-4" />
                Atendimento
              </a>
            </Button>
            <h1 className="font-display text-2xl tracking-tight text-clinical-ink">
              {TYPE_LABELS[document.type]}
            </h1>
            {locked ? (
              <Badge variant="success">Confirmado</Badge>
            ) : (
              <Badge variant="warning">Rascunho da IA</Badge>
            )}
          </div>
          {!locked && (
            <Button onClick={() => setConfirmOpen(true)} className="h-11">
              <SealCheck className="mr-2 size-4" />
              Confirmar
            </Button>
          )}
        </header>

        {locked && (
          <div className="space-y-3 pb-6">
            <ConfirmedSeal
              confirmedAt={document.confirmedAt ?? undefined}
              hash={document.contentHash ?? undefined}
            />
            {document.contentHash && (
              <AuditHash
                hash={document.contentHash}
                href={`/encounters/${encounterId}?tab=audit&entity=Document&entityId=${docId}`}
              />
            )}
          </div>
        )}

        {!locked && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-clinical-amber/30 bg-clinical-amber-bg px-4 py-2">
            <Robot className="size-4 text-clinical-amber" />
            <p className="text-sm text-clinical-amber-foreground">
              Conteúdo gerado pela IA. Revise e edite antes de confirmar. Alterações são registradas
              na trilha de auditoria.
            </p>
          </div>
        )}

        <DocumentEditor
          key={`${document.id}:${document.updatedAt}`}
          document={document}
          locked={locked}
          isSaving={updateDocument.isPending}
          onSave={async (physicianEdits) => {
            try {
              await updateDocument.mutateAsync({ physicianEdits });
              toast.success('Alterações salvas.');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
            }
          }}
        />

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Documento</DialogTitle>
              <DialogDescription>
                Ao confirmar, você assume este documento como conteúdo próprio. Esta ação é
                irreversível e fica registrada na trilha de auditoria.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={confirmDocument.isPending}
              >
                Cancelar
              </Button>
              <Button onClick={() => void handleConfirm()} disabled={confirmDocument.isPending}>
                {confirmDocument.isPending ? 'Confirmando…' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function DocumentEditor({
  document,
  locked,
  isSaving,
  onSave,
}: {
  document: Document;
  locked: boolean;
  isSaving: boolean;
  onSave: (physicianEdits: Record<string, unknown>) => Promise<void>;
}) {
  const aiContent = document.content;
  const initialContent = document.physicianEdits ?? document.content;
  const [editedContent, setEditedContent] = useState<Record<string, unknown>>(() => {
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(initialContent)) {
      flat[k] = extractString(v);
    }
    return flat;
  });

  const hasEdits = useMemo(() => {
    return Object.keys(editedContent).some((key) => {
      const original = extractString(aiContent[key]);
      const edited = String(editedContent[key] ?? '');
      return original !== edited;
    });
  }, [editedContent, aiContent]);

  const fields = SECTION_FIELDS[document.type] ?? [];

  function updateField(key: string, value: string) {
    setEditedContent((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    await onSave(editedContent);
  }

  if (fields.length === 0) {
    return (
      <div className="space-y-4">
        <Label>Conteúdo JSON</Label>
        <pre className="overflow-auto rounded-lg border border-clinical-line bg-white/60 p-4 font-mono text-sm">
          {JSON.stringify(initialContent, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const aiValue = extractString(aiContent[field.key]);
        const editedValue = String(editedContent[field.key] ?? '');
        const changed = aiValue !== editedValue;

        return (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
              </Label>
              {changed && !locked && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-clinical-teal">
                  editado
                </span>
              )}
            </div>

            {changed && !locked && (
              <details className="rounded border border-dashed border-clinical-line px-3 py-2">
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Original da IA
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{aiValue}</p>
              </details>
            )}

            <Textarea
              id={field.key}
              value={editedValue}
              onChange={(e) => updateField(field.key, e.target.value)}
              disabled={locked}
              rows={field.rows ?? 3}
              className={cn(
                field.mono && 'font-mono text-sm',
                changed && !locked && 'border-clinical-teal/40',
              )}
            />
          </div>
        );
      })}

      {document.type === 'prescricao' && (
        <MedicamentosSection
          medicamentos={aiContent.medicamentos}
          editedContent={editedContent}
          locked={locked}
          onChange={setEditedContent}
        />
      )}

      {document.type === 'alta' && (
        <ListSection
          title="Diagnósticos"
          fieldKey="diagnosticos"
          items={aiContent.diagnosticos}
          editedContent={editedContent}
          locked={locked}
          onChange={setEditedContent}
        />
      )}

      {!locked && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => void handleSave()} disabled={isSaving} className="h-11">
            <FloppyDisk className="mr-2 size-4" />
            {isSaving ? 'Salvando…' : 'Salvar Alterações'}
          </Button>
          {hasEdits && (
            <span className="font-mono text-xs text-muted-foreground">
              {
                Object.keys(editedContent).filter((key) => {
                  const original = extractString(aiContent[key]);
                  const edited = String(editedContent[key] ?? '');
                  return original !== edited;
                }).length
              }{' '}
              seção
              {Object.keys(editedContent).filter((key) => {
                const original = extractString(aiContent[key]);
                const edited = String(editedContent[key] ?? '');
                return original !== edited;
              }).length !== 1
                ? 'ões'
                : ''}{' '}
              editada
              {Object.keys(editedContent).filter((key) => {
                const original = extractString(aiContent[key]);
                const edited = String(editedContent[key] ?? '');
                return original !== edited;
              }).length !== 1
                ? 's'
                : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MedicamentosSection({
  medicamentos,
  editedContent,
  locked,
  onChange,
}: {
  medicamentos: unknown;
  editedContent: Record<string, unknown>;
  locked: boolean;
  onChange: (val: Record<string, unknown>) => void;
}) {
  const meds = Array.isArray(medicamentos) ? medicamentos : [];
  const editedMedsRaw = editedContent['medicamentos_raw'] as string | undefined;
  const editedMeds = editedMedsRaw ?? meds.map((m) => extractString(m)).join('\n');

  return (
    <div className="space-y-1.5">
      <Label htmlFor="medicamentos_raw" className="text-sm font-medium">
        Medicamentos
      </Label>
      <p className="text-xs text-muted-foreground">
        Um por linha — medicamento, dosagem, via, frequência, duração
      </p>
      <Textarea
        id="medicamentos_raw"
        value={editedMeds}
        onChange={(e) => onChange({ ...editedContent, medicamentos_raw: e.target.value })}
        disabled={locked}
        rows={Math.max(3, meds.length + 1)}
        className="font-mono text-sm"
      />
    </div>
  );
}

function ListSection({
  title,
  fieldKey,
  items,
  editedContent,
  locked,
  onChange,
}: {
  title: string;
  fieldKey: string;
  items: unknown;
  editedContent: Record<string, unknown>;
  locked: boolean;
  onChange: (val: Record<string, unknown>) => void;
}) {
  const list = Array.isArray(items) ? items : [];
  const editedRaw =
    (editedContent[`${fieldKey}_raw`] as string | undefined) ??
    list.map((i) => extractString(i)).join('\n');

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${fieldKey}_raw`} className="text-sm font-medium">
        {title}
      </Label>
      <p className="text-xs text-muted-foreground">Um por linha</p>
      <Textarea
        id={`${fieldKey}_raw`}
        value={editedRaw}
        onChange={(e) => onChange({ ...editedContent, [`${fieldKey}_raw`]: e.target.value })}
        disabled={locked}
        rows={Math.max(2, list.length)}
        className="font-mono text-sm"
      />
    </div>
  );
}
