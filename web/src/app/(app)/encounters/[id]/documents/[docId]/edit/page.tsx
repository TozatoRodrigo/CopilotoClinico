'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarBlank,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  Copy,
  DotsThree,
  FilePdf,
  Files,
  FileText,
  FloppyDisk,
  Hash,
  Info,
  LockSimple,
  PencilSimple,
  Plus,
  Robot,
  SealCheck,
  ShieldCheck,
  Signature,
  Tag,
  User,
  Warning,
} from '@phosphor-icons/react';
import {
  useConfirmDocument,
  useEncounterDetail,
  useEncounterDocument,
  useEncounterDocuments,
  useGenerateDocument,
  useUpdateDocument,
} from '@/lib/clinical-queries';
import type { Document, EncounterDetail } from '@/lib/types';
import { DOCUMENT_TYPES } from '@/lib/document-types';
import { useAuth } from '@/lib/auth-store';
import { API_BASE_URL } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { ChartPaper } from '@/components/ui/chart-paper';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmedSeal } from '@/components/domain/confirmed-seal';
import { AuditHash } from '@/components/domain/audit-hash';
import { ConfirmDocumentDialog } from '../../_components/confirm-document-dialog';
import { DocStatusBadge, DocTypeBadge } from '../../_components/document-badges';
import {
  DOC_TYPE_META,
  aiUseRecordOf,
  docTypeLabel,
  extractString,
  formatDateTime,
  isConfirmed,
  type DocType,
} from '../../_components/document-meta';

interface FieldDef {
  key: string;
  label: string;
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
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'orientacoes', label: 'Orientações', rows: 5 },
  ],
  alta: [
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'resumo', label: 'Resumo', rows: 4 },
    { key: 'condicaoNaAlta', label: 'Condição na Alta' },
    { key: 'retorno', label: 'Retorno' },
  ],
  atestado: [
    { key: 'paciente', label: 'Paciente', rows: 1 },
    { key: 'data', label: 'Data', rows: 1 },
    { key: 'descricao', label: 'Descrição', rows: 4 },
    { key: 'assinaturaPlaceholder', label: 'Assinatura', rows: 3 },
  ],
};

/** SOAP e SBAR: a letra da seção vira um marcador discreto ao lado do título. */
const SECTION_LETTERS: Partial<Record<DocType, Record<string, string>>> = {
  soap: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
  sbar: { situation: 'S', background: 'B', assessment: 'A', recommendation: 'R' },
};

/**
 * Listas (medicamentos da prescrição, diagnósticos da alta): editadas como
 * texto, um item por linha, gravadas em `<campo>_raw` nas edições do médico.
 */
interface ListFieldDef {
  id: string;
  source: string;
  label: string;
  hint: string;
  minRows: number;
}

const LIST_FIELDS: Partial<Record<DocType, ListFieldDef>> = {
  prescricao: {
    id: 'medicamentos_raw',
    source: 'medicamentos',
    label: 'Medicamentos',
    hint: 'Um por linha — medicamento, dosagem, via, frequência, duração',
    minRows: 3,
  },
  alta: {
    id: 'diagnosticos_raw',
    source: 'diagnosticos',
    label: 'Diagnósticos',
    hint: 'Um por linha',
    minRows: 2,
  },
};

type Content = Record<string, unknown>;

function flattenContent(content: Content): Content {
  const flat: Content = {};
  for (const [k, v] of Object.entries(content)) flat[k] = extractString(v);
  return flat;
}

/** Diferença entre o conteúdo local e o último salvo (indicador "Salvo"). */
function changedKeys(local: Content, reference: Content): string[] {
  return Object.keys(local).filter(
    (key) => String(local[key] ?? '') !== extractString(reference[key]),
  );
}

function listAiValue(aiContent: Content, list: ListFieldDef): string {
  const items = aiContent[list.source];
  return (Array.isArray(items) ? items : []).map((item) => extractString(item)).join('\n');
}

/** Seções cujo texto difere do rascunho original da IA. */
function editedSections(
  type: DocType,
  fields: FieldDef[],
  content: Content,
  aiContent: Content,
): string[] {
  const edited = fields
    .filter((f) => String(content[f.key] ?? '') !== extractString(aiContent[f.key]))
    .map((f) => f.key);
  const list = LIST_FIELDS[type];
  if (list) {
    const raw = content[list.id];
    if (typeof raw === 'string' && raw !== listAiValue(aiContent, list)) edited.push(list.id);
  }
  return edited;
}

// Campo editável como bloco de texto do Notion: sem caixa, cresce com o
// conteúdo, fundo sutil no hover e no foco (com anel visível no teclado).
const EDITABLE_CLASS =
  '-mx-2 min-h-9 w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 py-1.5 text-[0.9375rem] leading-7 text-foreground shadow-none hover:bg-hover focus-visible:border-transparent focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring/25 md:text-[0.9375rem]';

const READ_CLASS = 'whitespace-pre-wrap text-[0.9375rem] leading-7 text-foreground';

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
  onBeforeLeave,
}: {
  encounterId: string;
  currentType: DocType;
  /** Salva edições pendentes antes de sair; `false` cancela a troca. */
  onBeforeLeave: () => Promise<boolean>;
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
    if (!(await onBeforeLeave())) return;
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
    <div className="flex flex-col gap-2">
      {/* Mesmo desenho das abas de view (Tabs `default`). O sublinhado fica
          dentro da área rolável: um offset abaixo da borda seria cortado
          pelo overflow-x. */}
      <nav
        aria-label="Documentos do caso"
        className="flex h-10 items-stretch gap-1 overflow-x-auto border-b border-border max-sm:h-12"
      >
        {DOCUMENT_TYPES.map((dt) => {
          const active = dt.type === currentType;
          const isLoading = switchingTo === dt.type;
          const existing = latestByType.get(dt.type);
          const signed = existing ? isConfirmed(existing) : false;
          const stateLabel = active
            ? ''
            : !existing
              ? ' (gerar)'
              : signed
                ? ' (assinado)'
                : ' (rascunho)';
          return (
            <button
              key={dt.type}
              type="button"
              disabled={switchingTo !== null}
              aria-current={active ? 'page' : undefined}
              title={!existing && !active ? `Gerar ${dt.label}` : undefined}
              onClick={() => void handleTabClick(dt.type)}
              className={cn(
                'relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm font-medium whitespace-nowrap transition-colors duration-100 outline-none hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset disabled:opacity-60',
                'after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground',
                active
                  ? 'text-foreground after:opacity-100'
                  : 'text-muted-foreground after:opacity-0 hover:text-foreground',
              )}
            >
              {isLoading ? (
                <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
              ) : !existing && !active ? (
                <Plus className="size-3.5" aria-hidden="true" />
              ) : signed ? (
                <SealCheck className="size-3.5 text-tone-green" weight="fill" aria-hidden="true" />
              ) : null}
              {dt.label}
              <span className="sr-only">{stateLabel}</span>
            </button>
          );
        })}
      </nav>
      {switchError && (
        <Alert variant="destructive">
          <Warning weight="fill" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
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

function EditorSkeleton() {
  return (
    <Page width="narrow" className="gap-6">
      <div className="flex h-12 items-center justify-between border-b border-border">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="size-12" />
        <Skeleton className="h-10 w-2/3" />
        <div className="flex flex-col gap-2 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-1/2" />
          ))}
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
      <span className="sr-only" role="status">
        Carregando documento…
      </span>
    </Page>
  );
}

export default function DocumentEditPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: encounterId, docId } = use(params);
  const documentQuery = useEncounterDocument(encounterId, docId);
  // Mesmo cache que a trilha da barra superior usa (RouteBreadcrumbs).
  const encounterQuery = useEncounterDetail(encounterId);
  const document = documentQuery.data;
  const error = documentQuery.error?.message ?? null;

  if (documentQuery.isPending) return <EditorSkeleton />;

  if (error || !document) {
    return (
      <Page width="narrow">
        <Alert variant="destructive">
          <Warning weight="fill" />
          <AlertTitle>Não foi possível abrir o documento</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? 'Documento não encontrado.'}</span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void documentQuery.refetch()}>
                Tentar novamente
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/encounters/${encounterId}/documents`}>Ver documentos do caso</Link>
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      </Page>
    );
  }

  // `key` por documento: trocar de aba (outro documento) reinicia as edições
  // locais; salvar/confirmar o mesmo documento não.
  return (
    <DocumentWorkspace
      key={document.id}
      encounterId={encounterId}
      document={document}
      encounter={encounterQuery.data ?? null}
      encounterLoading={encounterQuery.isPending}
    />
  );
}

function SaveStatus({ saving, dirty }: { saving: boolean; dirty: boolean }) {
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-muted-foreground"
    >
      {saving ? (
        <>
          <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
          Salvando…
        </>
      ) : dirty ? (
        <>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground" />
          <span className="max-sm:hidden">Alterações não salvas</span>
          <span className="sm:hidden">Não salvo</span>
        </>
      ) : (
        <>
          <Check className="size-3.5" aria-hidden="true" />
          Salvo
        </>
      )}
    </span>
  );
}

function DocumentWorkspace({
  encounterId,
  document,
  encounter,
  encounterLoading,
}: {
  encounterId: string;
  document: Document;
  encounter: EncounterDetail | null;
  encounterLoading: boolean;
}) {
  const docId = document.id;
  const { physician } = useAuth();
  const updateDocument = useUpdateDocument(encounterId, docId);
  const confirmDocument = useConfirmDocument(encounterId, docId);
  const saveMutation = updateDocument.mutateAsync;

  const locked = isConfirmed(document);
  const aiContent = document.content;
  // Último conteúdo salvo no servidor — referência do indicador "Salvo".
  const savedContent = useMemo(
    () => flattenContent(document.physicianEdits ?? document.content),
    [document.physicianEdits, document.content],
  );
  const [editedContent, setEditedContent] = useState<Content>(savedContent);

  const dirty = !locked && changedKeys(editedContent, savedContent).length > 0;
  const isSaving = updateDocument.isPending;
  // Documento assinado mostra sempre o conteúdo do servidor (o que foi selado).
  const displayContent = locked ? savedContent : editedContent;
  const fields = SECTION_FIELDS[document.type] ?? [];
  const editedKeys = editedSections(document.type, fields, displayContent, aiContent);
  const totalSections = fields.length + (LIST_FIELDS[document.type] ? 1 : 0);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    try {
      await saveMutation({ physicianEdits: editedContent });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
      return false;
    }
  }, [saveMutation, editedContent]);

  const handleSave = useCallback(async () => {
    if (await save()) toast.success('Alterações salvas.');
  }, [save]);

  // ⌘S / Ctrl+S salva o rascunho (como num editor de texto).
  useEffect(() => {
    if (locked) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !isSaving) void handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [locked, dirty, isSaving, handleSave]);

  // Fechar a aba com edições não salvas pede confirmação do navegador.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  async function handleConfirm() {
    setConfirmError(null);
    try {
      // Assina exatamente o que está na tela: edições pendentes são salvas
      // antes (o backend sela physicianEdits ?? content).
      if (dirty) await saveMutation({ physicianEdits: editedContent });
      await confirmDocument.mutateAsync();
      setConfirmOpen(false);
      toast.success('Documento confirmado com sucesso.');
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Erro ao confirmar documento.');
    }
  }

  async function copyToClipboard(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  const typeLabel = docTypeLabel(document.type);
  const patient = encounter ? (encounter.patientRef ?? 'Consulta rápida') : null;
  const title = patient ? `${typeLabel} — ${patient}` : typeLabel;
  const latestInteraction = encounter?.aiInteractions?.[0] ?? null;
  // O selo só nomeia o médico logado quando foi ele quem assinou (cobertura
  // de plantão permite outro médico da instituição confirmar).
  const signedByMe = locked && physician !== null && document.confirmedBy === physician.id;
  const signerName = signedByMe ? `Dr(a). ${physician?.name ?? '—'}` : undefined;
  const signerCrm =
    signedByMe && physician ? `CRM ${physician.crmUf}-${physician.crmNumber}` : undefined;

  const pdfHref = `${API_BASE_URL}/encounters/${encounterId}/documents/${docId}/download`;
  const auditHref = `/encounters/${encounterId}?tab=audit&entity=Document&entityId=${docId}`;

  const versionLabel = locked
    ? document.physicianEdits
      ? 'Editada pelo médico e assinada'
      : 'Original da IA, assinada sem edições'
    : editedKeys.length > 0
      ? `Editada · ${editedKeys.length} de ${totalSections} seções alterada${editedKeys.length === 1 ? '' : 's'}`
      : 'Original da IA · nenhuma seção alterada';

  const body = (
    <DocumentBody
      document={document}
      fields={fields}
      aiContent={aiContent}
      content={displayContent}
      locked={locked}
      onChange={setEditedContent}
    />
  );

  return (
    <Page width="narrow" className="gap-6">
      {/* Barra de ações do documento (fixa abaixo da barra superior do shell). */}
      <div className="sticky top-11 z-20 -mx-2 -mt-2 flex h-12 items-center gap-1.5 border-b border-border bg-background px-2 md:-mt-6">
        {/* Com a trilha de etapas visível (lg+) a seta basta; abaixo disso
            ela leva o rótulo "Análise". */}
        <Button asChild variant="ghost" className="-ml-1 px-2 text-muted-foreground">
          <Link
            href={`/encounters/${encounterId}/conversation`}
            aria-label="Voltar para a análise"
            title="Voltar para a análise"
          >
            <ArrowLeft />
            <span className="max-sm:hidden lg:hidden">Análise</span>
          </Link>
        </Button>
        <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-border lg:block" />
        <ProgressSteps
          steps={['Captura', 'Análise', 'Documento']}
          currentStep={2}
          className="hidden text-[0.8125rem] lg:flex"
        />
        <span className="flex-1" />

        {locked ? (
          <span className="flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-muted-foreground">
            <LockSimple className="size-3.5" aria-hidden="true" />
            <span className="max-sm:hidden">Somente leitura</span>
          </span>
        ) : (
          <SaveStatus saving={isSaving} dirty={dirty} />
        )}

        {dirty && !isSaving && (
          <Button variant="outline" onClick={() => void handleSave()} className="ml-1">
            Salvar
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações do documento">
              <DotsThree weight="bold" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {!locked && (
              <DropdownMenuItem disabled={!dirty || isSaving} onSelect={() => void handleSave()}>
                <FloppyDisk />
                Salvar rascunho
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            {locked && (
              <DropdownMenuItem asChild>
                <a href={pdfHref} target="_blank" rel="noreferrer">
                  <FilePdf />
                  Baixar PDF assinado
                </a>
              </DropdownMenuItem>
            )}
            {locked && (
              <DropdownMenuItem asChild>
                <Link href={auditHref}>
                  <ShieldCheck />
                  Ver na trilha de auditoria
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/encounters/${encounterId}/documents`}>
                <Files />
                Todos os documentos do caso
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/encounters/${encounterId}/conversation`}>
                <ArrowLeft />
                Voltar para a análise
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void copyToClipboard(docId, 'ID do documento copiado.')}
            >
              <Copy />
              Copiar ID do documento
            </DropdownMenuItem>
            {locked && document.contentHash && (
              <DropdownMenuItem
                onSelect={() => void copyToClipboard(document.contentHash ?? '', 'Hash copiado.')}
              >
                <Hash />
                Copiar hash SHA-256
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {locked ? (
          <Button asChild variant="outline">
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <FilePdf />
              <span className="max-sm:sr-only">Baixar PDF</span>
            </a>
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)}>
            <SealCheck weight="fill" />
            Confirmar
          </Button>
        )}
      </div>

      <PageHeader
        icon={FileText}
        iconTone={locked ? 'green' : 'gray'}
        title={title}
        properties={
          <PropertyList>
            <PropertyRow icon={Tag} label="Tipo">
              <span className="flex flex-wrap items-center gap-2">
                <DocTypeBadge type={document.type} />
                <span className="text-muted-foreground">
                  {DOC_TYPE_META[document.type].description}
                </span>
              </span>
            </PropertyRow>
            <PropertyRow icon={locked ? SealCheck : Robot} label="Status">
              <DocStatusBadge confirmed={locked} size="long" />
            </PropertyRow>
            <PropertyRow icon={User} label="Paciente">
              {encounterLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : patient ? (
                <span className="block min-w-0">
                  <Link
                    href={`/encounters/${encounterId}`}
                    className="rounded-sm underline decoration-border underline-offset-4 hover:decoration-foreground"
                  >
                    {patient}
                  </Link>
                  {encounter?.chiefComplaint && (
                    <span className="text-muted-foreground"> · {encounter.chiefComplaint}</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </PropertyRow>
            <PropertyRow icon={CalendarBlank} label="Gerado em">
              <span className="tabular-nums">{formatDateTime(document.createdAt)}</span>
            </PropertyRow>
            <PropertyRow icon={ClockCounterClockwise} label="Versão">
              {versionLabel}
            </PropertyRow>
            {locked && (
              <PropertyRow icon={Signature} label="Assinado">
                <span className="tabular-nums">
                  {document.confirmedAt ? formatDateTime(document.confirmedAt) : '—'}
                  {signerName && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {signerName}
                      {signerCrm && <span className="font-mono text-xs"> · {signerCrm}</span>}
                    </span>
                  )}
                </span>
              </PropertyRow>
            )}
            {locked && document.contentHash && (
              <PropertyRow icon={Hash} label="Hash">
                <AuditHash hash={document.contentHash} />
              </PropertyRow>
            )}
          </PropertyList>
        }
      />

      <DocumentTypeTabs
        encounterId={encounterId}
        currentType={document.type}
        onBeforeLeave={() => (dirty ? save() : Promise.resolve(true))}
      />

      {locked ? (
        <ConfirmedSeal
          status="confirmed"
          confirmedAt={document.confirmedAt ?? undefined}
          physicianName={signerName}
          crm={signerCrm}
        />
      ) : (
        <Callout
          tone="blue"
          icon={<Robot weight="duotone" />}
          title="Rascunho da IA — revise antes de assinar"
        >
          Escrito a partir do seu ditado e das condutas que você adotou. Toque em qualquer trecho
          para corrigir; ao confirmar, o documento é bloqueado e registrado na trilha de auditoria.
        </Callout>
      )}

      {locked ? (
        <ChartPaper hash={document.contentHash}>{body}</ChartPaper>
      ) : (
        <div className="pt-1">{body}</div>
      )}

      {locked ? (
        <Link
          href={auditHref}
          className="-mt-2 inline-flex w-fit items-center gap-1.5 rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          Ver na trilha de auditoria →
        </Link>
      ) : (
        <Callout tone="gray" icon={<Info />} className="text-[0.8125rem]">
          Ao assinar você declara que revisou o conteúdo e assume a responsabilidade clínica. A IA é
          assistiva (Resolução CFM 2.314/2022). O texto e o hash ficam gravados de forma imutável.
        </Callout>
      )}

      {!locked && (
        <ConfirmDocumentDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setConfirmError(null);
          }}
          documentLabel={typeLabel}
          physician={physician}
          uncertain={latestInteraction?.uncertainty ?? false}
          uncertaintyReason={latestInteraction?.uncertaintyReason}
          hasUnsavedEdits={dirty}
          pending={isSaving || confirmDocument.isPending}
          error={confirmError}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </Page>
  );
}

function SectionBlock({
  id,
  label,
  letter,
  hint,
  value,
  aiValue,
  edited,
  locked,
  rows,
  onChange,
}: {
  id: string;
  label: string;
  letter?: string;
  hint?: string;
  value: string;
  aiValue?: string;
  edited: boolean;
  locked: boolean;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-1">
      <div className="flex min-h-7 items-center gap-2">
        {letter && (
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-tone-gray-bg text-xs font-semibold text-muted-foreground"
          >
            {letter}
          </span>
        )}
        <h3 id={`${id}-heading`} className="text-base font-semibold text-foreground">
          {locked ? label : <label htmlFor={id}>{label}</label>}
        </h3>
        {edited && !locked && (
          <Badge variant="secondary">
            <PencilSimple aria-hidden="true" />
            Editado
          </Badge>
        )}
      </div>
      {hint && !locked && <p className="text-xs text-muted-foreground">{hint}</p>}
      {locked ? (
        <p className={READ_CLASS}>{value || <span className="text-muted-foreground">—</span>}</p>
      ) : (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={EDITABLE_CLASS}
        />
      )}
      {edited && !locked && aiValue !== undefined && (
        <Disclosure
          title={
            <span className="text-[0.8125rem] font-normal text-muted-foreground">
              Original da IA
            </span>
          }
        >
          <p className="text-[0.8125rem] leading-6 whitespace-pre-wrap text-muted-foreground">
            {aiValue || '—'}
          </p>
        </Disclosure>
      )}
    </section>
  );
}

function InlineField({
  id,
  label,
  value,
  aiValue,
  edited,
  locked,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  aiValue: string;
  edited: boolean;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  const showEdited = edited && !locked;
  return (
    <div className="grid min-h-[34px] grid-cols-[minmax(6.5rem,8rem)_1fr] items-start gap-2 sm:grid-cols-[10rem_1fr]">
      <dt className="flex min-w-0 items-center gap-1.5 py-1.5 text-muted-foreground">
        {locked ? label : <label htmlFor={id}>{label}</label>}
        {showEdited && (
          <span title={`Editado — original da IA: ${aiValue || '—'}`} className="flex">
            <PencilSimple className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(editado)</span>
          </span>
        )}
      </dt>
      <dd className="min-w-0">
        {locked ? (
          <p className="py-1.5 text-[0.9375rem] whitespace-pre-wrap text-foreground">
            {value || <span className="text-muted-foreground">—</span>}
          </p>
        ) : (
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={1}
            className="-mx-1.5 min-h-8 w-[calc(100%+0.75rem)] resize-none border-transparent bg-transparent px-1.5 py-1 text-[0.9375rem] leading-6 text-foreground shadow-none hover:bg-hover focus-visible:border-transparent focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring/25 md:text-[0.9375rem]"
          />
        )}
      </dd>
    </div>
  );
}

function DocumentBody({
  document,
  fields,
  aiContent,
  content,
  locked,
  onChange,
}: {
  document: Document;
  fields: FieldDef[];
  aiContent: Content;
  content: Content;
  locked: boolean;
  onChange: (updater: (prev: Content) => Content) => void;
}) {
  if (fields.length === 0) {
    return (
      <pre className="overflow-auto rounded-md bg-tone-gray-bg p-4 font-mono text-[0.8125rem]">
        {JSON.stringify(document.physicianEdits ?? document.content, null, 2)}
      </pre>
    );
  }

  const letters = SECTION_LETTERS[document.type];
  const list = LIST_FIELDS[document.type];
  // Campos de uma linha (paciente, data) viram um bloco de propriedades no
  // topo do documento; os demais são seções com título.
  const inlineFields = fields.filter((field) => field.rows === 1);
  const sectionFields = fields.filter((field) => field.rows !== 1);

  return (
    <div className="flex flex-col gap-7">
      {inlineFields.length > 0 && (
        <dl className="flex flex-col gap-0.5 text-sm">
          {inlineFields.map((field) => {
            const aiValue = extractString(aiContent[field.key]);
            const value = String(content[field.key] ?? '');
            return (
              <InlineField
                key={field.key}
                id={field.key}
                label={field.label}
                value={value}
                aiValue={aiValue}
                edited={aiValue !== value}
                locked={locked}
                onChange={(next) => onChange((prev) => ({ ...prev, [field.key]: next }))}
              />
            );
          })}
        </dl>
      )}

      {sectionFields.map((field) => {
        const aiValue = extractString(aiContent[field.key]);
        const value = String(content[field.key] ?? '');
        return (
          <SectionBlock
            key={field.key}
            id={field.key}
            label={field.label}
            letter={letters?.[field.key]}
            value={value}
            aiValue={aiValue}
            edited={aiValue !== value}
            locked={locked}
            rows={field.rows ?? 3}
            onChange={(next) => onChange((prev) => ({ ...prev, [field.key]: next }))}
          />
        );
      })}

      {list && (
        <ListBlock list={list} aiContent={aiContent} content={content} locked={locked} onChange={onChange} />
      )}

      <AiUseRecordNote record={aiUseRecordOf(content)} />
    </div>
  );
}

/**
 * F0-D — Res. CFM 2.454/2026: o registro de uso de IA faz parte do documento
 * assinado (e do PDF), mas não é editável — o servidor sempre mantém o texto
 * da geração. Aparece aqui para o médico ver exatamente o que vai assinar.
 */
function AiUseRecordNote({ record }: { record: string | null }) {
  if (!record) return null;
  return (
    <section aria-labelledby="ai-use-record-title" className="flex flex-col gap-1 border-t border-border pt-3">
      <h3
        id="ai-use-record-title"
        className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground"
      >
        <Robot className="size-4" aria-hidden="true" />
        Registro de uso de IA{' '}
        <span className="font-normal">· não editável</span>
      </h3>
      <p className="text-[0.8125rem] text-pretty text-muted-foreground">{record}</p>
    </section>
  );
}

function ListBlock({
  list,
  aiContent,
  content,
  locked,
  onChange,
}: {
  list: ListFieldDef;
  aiContent: Content;
  content: Content;
  locked: boolean;
  onChange: (updater: (prev: Content) => Content) => void;
}) {
  const items = aiContent[list.source];
  const aiValue = listAiValue(aiContent, list);
  const raw = content[list.id];
  const value = typeof raw === 'string' ? raw : aiValue;

  return (
    <SectionBlock
      id={list.id}
      label={list.label}
      hint={list.hint}
      value={value}
      aiValue={aiValue}
      edited={typeof raw === 'string' && raw !== aiValue}
      locked={locked}
      rows={Math.max(list.minRows, (Array.isArray(items) ? items.length : 0) + 1)}
      onChange={(next) => onChange((prev) => ({ ...prev, [list.id]: next }))}
    />
  );
}
