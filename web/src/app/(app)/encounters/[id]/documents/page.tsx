"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  CircleNotch,
  ClockCounterClockwise,
  FileText,
  Plus,
  SealCheck,
  TextAa,
  User,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  useConfirmDocument,
  useEncounterDetail,
  useEncounterDocuments,
  useGenerateDocument,
} from "@/lib/clinical-queries";
import type { Document, Physician } from "@/lib/types";
import { DOCUMENT_TYPES } from "@/lib/document-types";
import { useAuth } from "@/lib/auth-store";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/domain/empty-state";
import { QuickConsultBanner } from "@/components/domain/quick-consult-banner";
import { ConfirmDocumentDialog } from "./_components/confirm-document-dialog";
import { DocStatusBadge, DocTypeBadge } from "./_components/document-badges";
import {
  DOC_TYPE_META,
  contentPreview,
  docTypeLabel,
  formatDateTime,
  formatRelative,
  isConfirmed,
  type DocType,
} from "./_components/document-meta";

interface AiInteractionSummary {
  id: string;
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

// Colunas da "database" de documentos (desktop): título · status · atualizado · autor · ação.
const ROW_GRID =
  "md:grid-cols-[minmax(0,1fr)_7.5rem_8.5rem_10rem_6.5rem] md:gap-4";

/** Quem responde pelo documento, do ponto de vista de quem está olhando. */
function authorLabel(doc: Document, physician: Physician | null): string {
  if (doc.confirmedBy) {
    if (physician && doc.confirmedBy === physician.id) {
      return physician.name ? `Dr(a). ${physician.name}` : "Você";
    }
    return "Outro médico";
  }
  return doc.physicianEdits ? "Copiloto + médico" : "Copiloto (IA)";
}

function GenerateMenu({
  disabled,
  generatingType,
  existingTypes,
  onSelect,
  size = "default",
}: {
  disabled: boolean;
  generatingType: DocType | null;
  existingTypes: Set<DocType>;
  onSelect: (type: DocType) => void;
  size?: "default" | "sm";
}) {
  const generating = generatingType !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} disabled={disabled || generating} className="max-md:flex-1">
          {generating ? (
            <CircleNotch className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus weight="bold" aria-hidden="true" />
          )}
          {generating ? `Gerando ${docTypeLabel(generatingType)}…` : "Gerar documento"}
          {!generating && <CaretDown data-icon="inline-end" aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          A partir da última análise do copiloto
        </DropdownMenuLabel>
        {DOCUMENT_TYPES.map((dt) => (
          <DropdownMenuItem key={dt.type} onSelect={() => onSelect(dt.type)} className="gap-2">
            <span className="flex w-[5.25rem] shrink-0">
              <Badge variant={DOC_TYPE_META[dt.type].tone}>{dt.label}</Badge>
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">
              {DOC_TYPE_META[dt.type].description}
            </span>
            {existingTypes.has(dt.type) && (
              <span className="text-xs text-muted-foreground">já gerado</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentRow({
  doc,
  encounterId,
  physician,
  onConfirm,
}: {
  doc: Document;
  encounterId: string;
  physician: Physician | null;
  onConfirm: (doc: Document) => void;
}) {
  const confirmed = isConfirmed(doc);
  const href = `/encounters/${encounterId}/documents/${doc.id}/edit`;
  const preview = contentPreview(doc.physicianEdits ?? doc.content);
  const updated = formatRelative(doc.updatedAt);
  const author = authorLabel(doc, physician);

  return (
    <li
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2.5 transition-colors duration-75 focus-within:bg-hover/60 hover:bg-hover/60 ${ROW_GRID}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <DocTypeBadge type={doc.type} />
          {/* "Stretched link": o ::after cobre a linha inteira; a ação à
              direita fica acima (z-10) e continua clicável. */}
          <Link
            href={href}
            className="truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40 focus-visible:after:ring-inset md:text-[0.9375rem]"
          >
            <span className="sr-only">Abrir {docTypeLabel(doc.type)}: </span>
            {DOC_TYPE_META[doc.type].description}
          </Link>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted-foreground md:line-clamp-1">
          {preview || "Sem conteúdo"}
        </p>
        {/* Mobile: propriedades empilhadas sob o título. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
          <DocStatusBadge confirmed={confirmed} />
          <span className="text-xs text-muted-foreground">
            {updated} · {author}
          </span>
        </div>
      </div>

      <span className="hidden md:block">
        <DocStatusBadge confirmed={confirmed} />
      </span>
      <span
        className="hidden text-[0.8125rem] text-muted-foreground tabular-nums md:block"
        title={formatDateTime(doc.updatedAt)}
      >
        {updated}
      </span>
      <span className="hidden truncate text-[0.8125rem] text-muted-foreground md:block">
        {author}
      </span>

      <div className="relative z-10 justify-self-end">
        {confirmed ? (
          <span className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground group-hover:text-foreground">
            <SealCheck className="size-3.5 text-tone-green" weight="fill" aria-hidden="true" />
            Ver
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="max-sm:h-10 max-sm:px-3.5"
            onClick={() => onConfirm(doc)}
          >
            Confirmar
          </Button>
        )}
      </div>
    </li>
  );
}

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const { physician } = useAuth();
  const [confirmTarget, setConfirmTarget] = useState<Document | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<DocType | null>(null);
  const documentsQuery = useEncounterDocuments(encounterId);
  const encounterQuery = useEncounterDetail(encounterId);
  const generateDocument = useGenerateDocument(encounterId);
  const confirmDocument = useConfirmDocument(encounterId, confirmTarget?.id ?? "");
  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const loading = documentsQuery.isPending || encounterQuery.isPending;
  const error = documentsQuery.error?.message ?? encounterQuery.error?.message ?? null;
  const latestInteraction = useMemo<AiInteractionSummary | null>(
    () => encounterQuery.data?.aiInteractions?.[0] ?? null,
    [encounterQuery.data?.aiInteractions],
  );
  const hasUncertainInteraction = latestInteraction?.uncertainty ?? false;
  const uncertainReason = latestInteraction?.uncertaintyReason ?? null;
  // S25-QC-02 — mesmo gate de encounters/[id]/result/page.tsx: sem
  // identificação, o backend recusa gerar documento (documents.service.ts);
  // desabilitar aqui evita o médico abrir o diálogo só pra levar o erro.
  const isQuickConsult = encounterQuery.data?.patientRef === null;
  const existingTypes = useMemo(() => new Set(documents.map((d) => d.type)), [documents]);

  async function handleConfirm() {
    setConfirmError(null);
    try {
      await confirmDocument.mutateAsync();
      toast.success("Documento confirmado com sucesso.");
      setConfirmTarget(null);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao confirmar documento.");
    }
  }

  async function handleGenerate(type: DocType) {
    if (!latestInteraction) {
      toast.error("Execute uma análise antes de gerar documentos.");
      return;
    }

    setGeneratingType(type);
    try {
      await generateDocument.mutateAsync({
        type,
        aiInteractionId: latestInteraction.id,
      });
      toast.success("Documento gerado com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar documento.");
    } finally {
      setGeneratingType(null);
    }
  }

  const encounter = encounterQuery.data;
  const caseContext = encounter
    ? [encounter.patientRef ?? "Consulta rápida", encounter.chiefComplaint]
        .filter(Boolean)
        .join(" · ")
    : null;

  const generateMenu = (size: "default" | "sm" = "default") => (
    <GenerateMenu
      size={size}
      disabled={isQuickConsult}
      generatingType={generatingType}
      existingTypes={existingTypes}
      onSelect={(type) => void handleGenerate(type)}
    />
  );

  if (loading) {
    return (
      <Page width="default">
        <div className="flex flex-col gap-3">
          <Skeleton className="size-12" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-3">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <span className="sr-only" role="status">
          Carregando documentos…
        </span>
      </Page>
    );
  }

  if (error) {
    return (
      <Page width="default">
        <PageHeader icon={FileText} title="Documentos" />
        <Alert variant="destructive">
          <Warning weight="fill" />
          <AlertTitle>Não foi possível carregar os documentos</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void documentsQuery.refetch();
                void encounterQuery.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </Page>
    );
  }

  return (
    <Page width="default">
      <PageHeader
        icon={FileText}
        title="Documentos"
        description={caseContext}
        actions={documents.length > 0 ? generateMenu() : undefined}
      />

      {/* S25-QC-02 — sem identificação, nenhum documento pode ser gerado
          ainda (ver isQuickConsult acima). */}
      {isQuickConsult && (
        <QuickConsultBanner
          encounterId={encounterId}
          description="Identifique o paciente para gerar SOAP, SBAR, prescrição, atestado ou alta."
          successMessage="Paciente identificado — já pode gerar os documentos deste caso."
        />
      )}

      {/* Banner de incerteza — visível quando a análise do copiloto sinalizou evidência insuficiente */}
      {hasUncertainInteraction && (
        <Alert variant="warning">
          <Warning weight="fill" />
          <AlertTitle>Análise com evidência insuficiente</AlertTitle>
          <AlertDescription>
            {uncertainReason ??
              "O copiloto sinalizou incerteza na análise deste atendimento. Revise cuidadosamente antes de confirmar qualquer documento."}
          </AlertDescription>
        </Alert>
      )}

      {documents.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            icon={<FileText weight="duotone" />}
            title="Nenhum documento neste caso"
            description="Gere SOAP, SBAR, prescrição, alta ou atestado a partir da análise do copiloto. Tudo nasce como rascunho para você revisar."
            className="pb-4"
          />
          {/* Ação do estado vazio = o mesmo menu de geração do cabeçalho. */}
          <div className="flex justify-center pb-12">{generateMenu("sm")}</div>
        </div>
      ) : (
        <section aria-labelledby="documents-list-title" className="flex flex-col">
          <h2 id="documents-list-title" className="sr-only">
            Documentos do caso
          </h2>
          {/* Cabeçalho da database (só desktop). */}
          <div
            aria-hidden="true"
            className={`hidden h-9 items-center border-b border-border px-2 text-sm text-muted-foreground md:grid ${ROW_GRID}`}
          >
            <span className="flex items-center gap-1.5">
              <TextAa className="size-4" /> Documento
            </span>
            <span className="flex items-center gap-1.5">
              <SealCheck className="size-4" /> Status
            </span>
            <span className="flex items-center gap-1.5">
              <ClockCounterClockwise className="size-4" /> Atualizado
            </span>
            <span className="flex items-center gap-1.5">
              <User className="size-4" /> Autor
            </span>
            <span />
          </div>
          <ul className="divide-y divide-border border-b border-border max-md:border-t">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                encounterId={encounterId}
                physician={physician}
                onConfirm={(target) => {
                  setConfirmError(null);
                  setConfirmTarget(target);
                }}
              />
            ))}
          </ul>
          <p className="px-2 pt-2 text-xs text-muted-foreground tabular-nums">
            {documents.length} documento{documents.length === 1 ? "" : "s"} ·{" "}
            {documents.filter(isConfirmed).length} assinado
            {documents.filter(isConfirmed).length === 1 ? "" : "s"}
          </p>
        </section>
      )}

      <ConfirmDocumentDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmError(null);
          }
        }}
        documentLabel={confirmTarget ? docTypeLabel(confirmTarget.type) : "documento"}
        physician={physician}
        uncertain={hasUncertainInteraction}
        uncertaintyReason={uncertainReason}
        pending={confirmDocument.isPending}
        error={confirmError}
        onConfirm={() => {
          if (confirmTarget) void handleConfirm();
        }}
      />
    </Page>
  );
}
