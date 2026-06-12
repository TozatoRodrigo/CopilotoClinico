"use client";

import { use, useMemo, useState } from "react";
import {
  useConfirmDocument,
  useEncounterDetail,
  useEncounterDocuments,
  useGenerateDocument,
} from "@/lib/clinical-queries";
import type { Document } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type DocType = Document["type"];

interface AiInteractionSummary {
  id: string;
  uncertainty: boolean;
  uncertaintyReason: string | null;
}

const TYPE_LABELS: Record<DocType, string> = {
  soap: "SOAP",
  sbar: "SBAR",
  prescricao: "Prescrição",
  alta: "Alta",
  atestado: "Atestado",
};

const TYPE_COLORS: Record<DocType, string> = {
  soap: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  sbar: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  prescricao:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  alta: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  atestado: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function formatContent(content: Record<string, unknown>): string {
  const values = Object.values(content);
  const text = values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: encounterId } = use(params);
  const [confirmTarget, setConfirmTarget] = useState<Document | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateType, setGenerateType] = useState<DocType>("soap");
  const documentsQuery = useEncounterDocuments(encounterId);
  const encounterQuery = useEncounterDetail(encounterId);
  const generateDocument = useGenerateDocument(encounterId);
  const confirmDocument = useConfirmDocument(encounterId, confirmTarget?.id ?? "");
  const documents = documentsQuery.data ?? [];
  const loading = documentsQuery.isPending || encounterQuery.isPending;
  const error = documentsQuery.error?.message ?? encounterQuery.error?.message ?? null;
  const latestInteraction = useMemo<AiInteractionSummary | null>(
    () => encounterQuery.data?.aiInteractions?.[0] ?? null,
    [encounterQuery.data?.aiInteractions],
  );
  const hasUncertainInteraction = latestInteraction?.uncertainty ?? false;
  const uncertainReason = latestInteraction?.uncertaintyReason ?? null;

  async function handleConfirm() {
    try {
      await confirmDocument.mutateAsync();
      toast.success("Documento confirmado com sucesso.");
      setConfirmTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao confirmar documento.",
      );
    }
  }

  async function handleGenerate() {
    if (!latestInteraction) {
      toast.error("Execute uma análise antes de gerar documentos.");
      return;
    }

    try {
      await generateDocument.mutateAsync({
        type: generateType,
        aiInteractionId: latestInteraction.id,
      });
      toast.success("Documento gerado com sucesso.");
      setGenerateOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao gerar documento.",
      );
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
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
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <Button onClick={() => setGenerateOpen(true)}>
          Gerar Novo Documento
        </Button>
      </div>

      {/* Banner de incerteza — visível quando a análise do copiloto sinalizou evidência insuficiente */}
      {hasUncertainInteraction && (
        <Alert className="border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <AlertTitle className="font-semibold">
            ⚠️ Análise com evidência insuficiente
          </AlertTitle>
          <AlertDescription>
            {uncertainReason ??
              "O copiloto sinalizou incerteza na análise deste atendimento. Revise cuidadosamente antes de confirmar qualquer documento."}
          </AlertDescription>
        </Alert>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-muted-foreground">
              Nenhum documento encontrado para este atendimento.
            </p>
            <Button onClick={() => setGenerateOpen(true)}>
              Gerar Primeiro Documento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[doc.type]}`}
                    >
                      {TYPE_LABELS[doc.type]}
                    </span>
                    {doc.confirmedBy ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Confirmado
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        Rascunho
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Criado: {formatDate(doc.createdAt)} · Atualizado:{" "}
                    {formatDate(doc.updatedAt)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  {formatContent(doc.physicianEdits ?? doc.content)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/encounters/${encounterId}/documents/${doc.id}/edit`}
                    >
                      Editar
                    </a>
                  </Button>
                  {!doc.confirmedBy && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmTarget(doc)}
                    >
                      Confirmar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Documento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja confirmar este documento? Esta ação é
              irreversível e ficará registrada na trilha de auditoria.
            </DialogDescription>
          </DialogHeader>

          {/* Aviso de incerteza dentro do dialog de confirmação — CLIN-001 */}
          {hasUncertainInteraction && (
            <Alert className="border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
              <AlertTitle className="text-sm font-semibold">
                ⚠️ Atenção: análise com incerteza
              </AlertTitle>
              <AlertDescription className="text-sm">
                {uncertainReason ??
                  "O copiloto indicou evidência insuficiente para este caso. Ao confirmar, você declara que revisou o documento e assume responsabilidade pelo conteúdo."}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={confirmDocument.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (confirmTarget) void handleConfirm();
              }}
              disabled={confirmDocument.isPending}
            >
              {confirmDocument.isPending ? "Confirmando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Novo Documento</DialogTitle>
            <DialogDescription>
              Selecione o tipo de documento a ser gerado.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={generateType}
            onValueChange={(v) => setGenerateType(v as DocType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soap">SOAP</SelectItem>
              <SelectItem value="sbar">SBAR</SelectItem>
              <SelectItem value="prescricao">Prescrição</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="atestado">Atestado</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateOpen(false)}
              disabled={generateDocument.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleGenerate()}
              disabled={generateDocument.isPending}
            >
              {generateDocument.isPending ? "Gerando…" : "Gerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
