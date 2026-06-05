"use client";

import { use, useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { CopilotAnalysis, Document } from "@/lib/types";
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
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Document | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateType, setGenerateType] = useState<DocType>("soap");
  const [generating, setGenerating] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const docs = await apiClient.get<Document[]>(
          `/encounters/${encounterId}/documents`,
        );
        setDocuments(docs);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar documentos.",
        );
      } finally {
        setLoading(false);
      }
    }
    refreshRef.current = fetchData;
    void fetchData();
  }, [encounterId]);

  async function handleConfirm(doc: Document) {
    setConfirming(true);
    try {
      await apiClient.post(
        `/encounters/${encounterId}/documents/${doc.id}/confirm`,
      );
      toast.success("Documento confirmado com sucesso.");
      setConfirmTarget(null);
      await refreshRef.current();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao confirmar documento.",
      );
    } finally {
      setConfirming(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await apiClient.get<CopilotAnalysis | null>(
        `/encounters/${encounterId}/copilot/result`,
      );
      if (!result?.interactionId) {
        toast.error("Execute uma análise do copiloto antes de gerar documentos.");
        return;
      }
      await apiClient.post(`/encounters/${encounterId}/documents`, {
        type: generateType,
        aiInteractionId: result.interactionId,
      });
      toast.success("Documento gerado com sucesso.");
      setGenerateOpen(false);
      await refreshRef.current();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao gerar documento.",
      );
    } finally {
      setGenerating(false);
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
        <AlertDescription>{error}</AlertDescription>
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
              irreversível.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={confirming}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (confirmTarget) void handleConfirm(confirmTarget);
              }}
              disabled={confirming}
            >
              {confirming ? "Confirmando…" : "Confirmar"}
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
              disabled={generating}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? "Gerando…" : "Gerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
