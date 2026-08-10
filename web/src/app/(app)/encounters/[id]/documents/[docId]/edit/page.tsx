'use client';

import { use, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useConfirmDocument,
  useEncounterDocument,
  useEncounterDocuments,
  useGenerateDocument,
  useUpdateDocument,
} from '@/lib/clinical-queries';
import type { Document } from '@/lib/types';
import { DOCUMENT_TYPES } from '@/lib/document-types';
import { ChartPaper } from '@/components/ui/chart-paper';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ArrowLeft,
  SealCheck,
  Robot,
  FilePdf,
  FloppyDisk,
  CheckCircle,
  PencilSimple,
  Info,
  CircleNotch,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import { API_BASE_URL } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ConfirmedSeal } from '@/components/domain/confirmed-seal';
import { AuditHash } from '@/components/domain/audit-hash';

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

const SOAP_LETTERS: Record<string, string> = {
  subjective: 'S',
  objective: 'O',
  assessment: 'A',
  plan: 'P',
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

function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--amber-bg)] px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.04em] text-[var(--amber-foreground)]"
      style={{ borderColor: 'rgba(180,83,9,0.4)' }}
    >
      <Robot className="size-3" /> Rascunho da IA
    </span>
  );
}

function ConfirmedStamp({ confirmedAt }: { confirmedAt: string }) {
  return (
    <div
      className="rotate-[-6deg] rounded-[10px] border-[2.5px] px-3.5 py-2 text-center"
      style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
    >
      <p className="text-[0.8rem] font-extrabold uppercase tracking-[0.14em]">Confirmado</p>
      <p className="mt-0.5 font-mono text-[0.6rem]">{confirmedAt}</p>
    </div>
  );
}

/**
 * RD-E7 — abas SOAP/SBAR/Prescrição/Alta/Atestado do redesign
 * (Redesign.dc.html): trocar de aba navega para o documento já gerado
 * desse tipo (useEncounterDocuments já trouxe a lista) ou gera um novo sob
 * demanda (useGenerateDocument, sem aiInteractionId — o backend resolve
 * pela interação mais recente do encontro e é idempotente por tipo, então
 * clicar duas vezes na mesma aba nunca duplica).
 */
function DocumentTypeTabs({
  encounterId,
  currentType,
}: {
  encounterId: string;
  currentType: DocType;
}) {
  const router = useRouter();
  const documentsQuery = useEncounterDocuments(encounterId);
  const generateDocument = useGenerateDocument(encounterId);
  const [switchingTo, setSwitchingTo] = useState<DocType | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const latestByType = new Map<DocType, Document>();
  for (const doc of documentsQuery.data ?? []) {
    const current = latestByType.get(doc.type);
    if (!current || doc.createdAt > current.createdAt) {
      latestByType.set(doc.type, doc);
    }
  }

  async function handleTabClick(type: DocType) {
    if (type === currentType) return;
    const existing = latestByType.get(type);
    if (existing) {
      router.push(`/encounters/${encounterId}/documents/${existing.id}/edit`);
      return;
    }

    setSwitchingTo(type);
    setSwitchError(null);
    try {
      const doc = await generateDocument.mutateAsync({ type });
      router.push(`/encounters/${encounterId}/documents/${doc.id}/edit`);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : 'Erro ao gerar documento.');
      setSwitchingTo(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <div className="flex gap-1.5 rounded-2xl bg-clinical-line p-1.5">
        {DOCUMENT_TYPES.map((dt) => {
          const active = dt.type === currentType;
          const isLoading = switchingTo === dt.type;
          return (
            <button
              key={dt.type}
              type="button"
              disabled={isLoading}
              aria-current={active ? 'page' : undefined}
              onClick={() => void handleTabClick(dt.type)}
              className={cn(
                'flex-1 rounded-xl px-2 py-2 text-[0.8rem] font-bold transition-colors disabled:opacity-60',
                active
                  ? 'bg-card text-clinical-ink shadow-sm'
                  : 'text-clinical-ink-soft hover:text-clinical-ink',
              )}
            >
              {isLoading ? (
                <CircleNotch className="mx-auto size-4 animate-spin" />
              ) : (
                dt.label
              )}
            </button>
          );
        })}
      </div>
      {switchError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{switchError}</span>
            <Button variant="outline" size="sm" onClick={() => setSwitchError(null)}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function DocumentEditPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: encounterId, docId } = use(params);
  const documentQuery = useEncounterDocument(encounterId, docId);
  const updateDocument = useUpdateDocument(encounterId, docId);
  const confirmDocument = useConfirmDocument(encounterId, docId);
  const document = documentQuery.data;
  const loading = documentQuery.isPending;
  const error = documentQuery.error?.message ?? null;

  const { physician } = useAuth();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleConfirm() {
    setConfirmError(null);
    try {
      await confirmDocument.mutateAsync();
      toast.success('Documento confirmado com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao confirmar documento.';
      setConfirmError(message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-clinical-paper">
        <div className="border-b border-clinical-line bg-card">
          <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-6">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-6 w-64 rounded" />
          </div>
        </div>
        <div className="mx-auto max-w-[1180px] px-6 py-8">
          <Skeleton className="mx-auto h-[420px] w-full max-w-[680px] rounded-lg" />
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
  const confirmedAtStr = document.confirmedAt
    ? new Date(document.confirmedAt).toLocaleString('pt-BR')
    : '';

  return (
    <div className="min-h-screen bg-clinical-paper">
      <header className="flex h-16 items-center justify-between border-b border-clinical-line bg-white px-6">
        <div className="flex items-center gap-3">
          <a
            href={`/encounters/${encounterId}/result`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-clinical-ink-soft transition-colors hover:text-clinical-ink"
          >
            <ArrowLeft className="size-4" />
            Análise
          </a>
          <span className="h-4 w-px bg-clinical-line" />
          <span className="font-mono text-xs text-clinical-ink-soft">{docId}</span>
        </div>
        <ProgressSteps steps={['Captura', 'Análise', 'Documento']} currentStep={2} />
      </header>

      <div className="mx-auto max-w-[1180px] px-6 pt-8">
        <h1 className="font-display text-[1.75rem] leading-tight text-clinical-ink">
          Revise antes de assinar
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-clinical-ink-soft">
          Escrito a partir do seu ditado e das condutas que você adotou. Toque em qualquer trecho
          para corrigir.
        </p>
      </div>

      <div className="mx-auto max-w-[1180px] px-6 pt-6">
        <DocumentTypeTabs encounterId={encounterId} currentType={document.type} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div className="px-6 py-8">
          <DocumentEditor
            key={`${document.id}:${document.updatedAt}`}
            document={document}
            locked={locked}
            isSaving={updateDocument.isPending}
            confirmedAtStr={confirmedAtStr}
            onSave={async (physicianEdits) => {
              try {
                await updateDocument.mutateAsync({ physicianEdits });
                toast.success('Alterações salvas.');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
              }
            }}
          />
        </div>

        <aside className="flex flex-col gap-4 border-l border-clinical-line bg-card p-7">
          {!locked ? (
            <>
              <div
                className="rounded-[10px] border p-4"
                style={{
                  borderColor: 'rgba(180,83,9,0.4)',
                  background: 'var(--amber-bg)',
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Robot className="size-5" style={{ color: 'var(--amber-foreground)' }} />
                  <p
                    className="text-sm font-bold"
                    style={{ color: 'var(--amber-foreground)' }}
                  >
                    Rascunho da IA
                  </p>
                </div>
                <p
                  className="text-[0.8rem] leading-relaxed"
                  style={{ color: 'var(--amber-foreground)' }}
                >
                  Conteúdo gerado pela IA. Revise cada seção antes de confirmar — ao assinar, o
                  documento é bloqueado e registrado na trilha de auditoria.
                </p>
              </div>

              <ReviewStats document={document} />

              {physician && (
                <div
                  className="rounded-[10px] border p-4"
                  style={{
                    borderColor: 'rgba(13,148,136,0.3)',
                    background: 'var(--teal-tint, rgba(13,148,136,0.06))',
                  }}
                >
                  <p className="text-sm font-semibold text-clinical-teal-deep">
                    Dr(a). {physician.name ?? '—'}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-clinical-teal-deep/80">
                    CRM {physician.crmUf}-{physician.crmNumber}
                    {!physician.crmVerified && (
                      <span className="ml-2 text-clinical-amber">CRM pendente de verificação</span>
                    )}
                  </p>
                  <p className="mt-2 text-[0.72rem] leading-relaxed text-clinical-ink-soft">
                    Ao confirmar, você assume este documento como conteúdo próprio. Esta ação é{' '}
                    <span className="font-semibold text-clinical-ink">irreversível</span> — o
                    documento será bloqueado e assinado com hash criptográfico.
                  </p>
                </div>
              )}

              {confirmError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {confirmError.includes('already confirmed')
                      ? 'Este documento já foi confirmado.'
                      : confirmError}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={() => void handleConfirm()}
                disabled={confirmDocument.isPending}
                loading={confirmDocument.isPending}
                className="h-13 w-full bg-clinical-teal text-white hover:bg-clinical-teal/90"
              >
                {!confirmDocument.isPending && <SealCheck className="size-4" />}
                {confirmDocument.isPending ? 'Confirmando…' : 'Confirmar e assinar'}
              </Button>
            </>
          ) : (
            <>
              <ConfirmedSeal
                status="confirmed"
                confirmedAt={document.confirmedAt ?? undefined}
                physicianName={physician?.name ?? undefined}
                crm={physician ? `CRM ${physician.crmUf}-${physician.crmNumber}` : undefined}
              />

              {document.contentHash && (
                <div className="rounded-[10px] border border-clinical-line bg-white/60 p-4">
                  <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-clinical-ink-soft">
                    Integridade
                  </p>
                  <div className="mt-2">
                    <AuditHash hash={document.contentHash} />
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-clinical-green-foreground">
                    <CheckCircle className="size-3" style={{ color: 'var(--green)' }} />
                    Verificado na cadeia
                  </p>
                </div>
              )}

              <a
                href={`${API_BASE_URL}/encounters/${encounterId}/documents/${docId}/download`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-clinical-line bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-clinical-teal hover:text-clinical-teal"
              >
                <FilePdf className="size-4" />
                Baixar PDF assinado
              </a>

              <a
                href={`/encounters/${encounterId}?tab=audit&entity=Document&entityId=${docId}`}
                className="text-center text-sm font-medium text-clinical-teal transition-colors hover:text-clinical-teal-deep"
              >
                Ver na trilha de auditoria →
              </a>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReviewStats({ document }: { document: Document }) {
  const aiContent = document.content;
  const initialContent = document.physicianEdits ?? document.content;
  const editedCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(initialContent)) {
      const ai = extractString(aiContent[key]);
      const edited = extractString(initialContent[key]);
      if (ai !== edited) count++;
    }
    return count;
  }, [aiContent, initialContent]);
  const fields = SECTION_FIELDS[document.type] ?? [];
  const sectionsCount = fields.length || Object.keys(initialContent).length;

  return (
    <div className="rounded-[10px] border border-clinical-line bg-white/60 p-4">
      <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-clinical-ink-soft">
        Revisão
      </p>
      <ul className="mt-3 space-y-2.5">
        <li className="flex items-center justify-between text-sm">
          <span className="text-clinical-ink-soft">Seções revisadas</span>
          <span className="font-semibold text-clinical-ink">{sectionsCount}</span>
        </li>
        <li className="flex items-center justify-between text-sm">
          <span className="text-clinical-ink-soft">Seção editada</span>
          <span className="font-semibold text-clinical-ink">{editedCount}</span>
        </li>
        <li className="flex items-center justify-between text-sm">
          <span className="text-clinical-ink-soft">Condutas adotadas</span>
          <span className="font-semibold text-clinical-ink">{editedCount}</span>
        </li>
      </ul>
    </div>
  );
}

function DocumentEditor({
  document,
  locked,
  isSaving,
  confirmedAtStr,
  onSave,
}: {
  document: Document;
  locked: boolean;
  isSaving: boolean;
  confirmedAtStr: string;
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

  const editedSectionCount = useMemo(() => {
    return Object.keys(editedContent).filter((key) => {
      const original = extractString(aiContent[key]);
      const edited = String(editedContent[key] ?? '');
      return original !== edited;
    }).length;
  }, [editedContent, aiContent]);

  const metadata = `${document.encounterId.slice(0, 12)} · ${new Date(document.createdAt).toLocaleString('pt-BR')}`;
  const hashFooter = document.contentHash
    ? `sha-256 ${document.contentHash.slice(0, 16)}…`
    : undefined;

  return (
    <>
      <ChartPaper
        title={TYPE_LABELS[document.type]}
        metadata={metadata}
        headerSlot={locked ? <ConfirmedStamp confirmedAt={confirmedAtStr} /> : <DraftBadge />}
        hashFooter={hashFooter}
      >
        {fields.length === 0 ? (
          <pre className="overflow-auto rounded-lg border border-clinical-line bg-white/60 p-4 font-mono text-sm">
            {JSON.stringify(initialContent, null, 2)}
          </pre>
        ) : document.type === 'soap' ? (
          <div className="grid grid-cols-[56px_1fr] gap-x-5">
            {fields.map((field) => {
              const aiValue = extractString(aiContent[field.key]);
              const editedValue = String(editedContent[field.key] ?? '');
              const changed = aiValue !== editedValue;
              const letter = SOAP_LETTERS[field.key] ?? field.key.charAt(0).toUpperCase();

              return (
                <div key={field.key} className="contents">
                  <div
                    className="pt-5 font-display text-[2.1rem] leading-none"
                    style={{ color: 'var(--line)' }}
                  >
                    {letter}
                  </div>
                  <div className="border-b border-clinical-line py-5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-clinical-ink-soft">
                        {field.label}
                      </p>
                      {changed && !locked && (
                        <Badge
                          variant="outline"
                          className="border-clinical-teal/40 px-1.5 py-0 font-mono text-[0.55rem] uppercase tracking-wider text-clinical-teal"
                        >
                          <PencilSimple className="size-2.5" /> editado
                        </Badge>
                      )}
                    </div>
                    {changed && !locked && (
                      <details className="mb-2 rounded border border-dashed border-clinical-line px-3 py-2">
                        <summary className="cursor-pointer select-none font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                          Original da IA
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-[0.78rem] text-muted-foreground">
                          {aiValue}
                        </p>
                      </details>
                    )}
                    {locked ? (
                      <p className="whitespace-pre-wrap text-[0.9rem] leading-[1.65] text-clinical-ink">
                        {editedValue}
                      </p>
                    ) : (
                      <Textarea
                        id={field.key}
                        value={editedValue}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        disabled={locked}
                        rows={field.rows ?? 4}
                        className={cn(
                          'border-0 bg-transparent px-0 py-1 text-[0.9rem] leading-[1.65] text-clinical-ink shadow-none focus-visible:border-0 focus-visible:ring-0',
                          changed && 'border-l-[3px] !border-clinical-teal pl-3',
                        )}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {fields.map((field) => {
              const aiValue = extractString(aiContent[field.key]);
              const editedValue = String(editedContent[field.key] ?? '');
              const changed = aiValue !== editedValue;

              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.key} className="text-sm font-medium">
                      {field.label}
                    </Label>
                    {changed && !locked && (
                      <Badge
                        variant="outline"
                        className="border-clinical-teal/40 px-1.5 py-0 font-mono text-[0.55rem] uppercase tracking-wider text-clinical-teal"
                      >
                        <PencilSimple className="size-2.5" /> editado
                      </Badge>
                    )}
                  </div>
                  {changed && !locked && (
                    <details className="rounded border border-dashed border-clinical-line px-3 py-2">
                      <summary className="cursor-pointer select-none font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                        Original da IA
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap text-[0.78rem] text-muted-foreground">
                        {aiValue}
                      </p>
                    </details>
                  )}
                  {locked ? (
                    <p className="whitespace-pre-wrap text-[0.9rem] leading-[1.65] text-clinical-ink">
                      {editedValue}
                    </p>
                  ) : (
                    <Textarea
                      id={field.key}
                      value={editedValue}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      disabled={locked}
                      rows={field.rows ?? 3}
                      className={cn(
                        field.mono && 'font-mono text-sm',
                        changed && 'border-l-[3px] !border-clinical-teal pl-3',
                      )}
                    />
                  )}
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
          </div>
        )}
      </ChartPaper>

      {!locked && (
        <div className="mx-auto mt-6 flex w-full max-w-[680px] items-start gap-2.5 rounded-lg border border-clinical-line bg-card px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-clinical-ink-soft" />
          <p className="text-[0.78rem] leading-relaxed text-clinical-ink-soft">
            Ao assinar você declara que revisou o conteúdo e assume a responsabilidade clínica. A
            IA é assistiva (Resolução CFM 2.314/2022). O texto e o hash ficam gravados de forma
            imutável.
          </p>
        </div>
      )}

      {!locked && fields.length > 0 && (
        <div className="mx-auto mt-6 flex w-full max-w-[680px] items-center gap-3">
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving}
            loading={isSaving}
            variant="outline"
            className="h-11"
          >
            {!isSaving && <FloppyDisk className="size-4" />}
            {isSaving ? 'Salvando…' : 'Salvar rascunho'}
          </Button>
          {hasEdits && (
            <span className="font-mono text-[0.68rem] text-muted-foreground">
              {editedSectionCount} seção{editedSectionCount !== 1 ? 'ões' : ''} editada
              {editedSectionCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </>
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
