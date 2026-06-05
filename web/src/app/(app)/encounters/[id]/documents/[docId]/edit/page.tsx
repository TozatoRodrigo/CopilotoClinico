"use client";

import { use, useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { Document } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const SOAP_FIELDS = [
  { key: "subjetivo", label: "Subjetivo" },
  { key: "objetivo", label: "Objetivo" },
  { key: "avaliacao", label: "Avaliação" },
  { key: "plano", label: "Plano" },
] as const;

const SBAR_FIELDS = [
  { key: "situacao", label: "Situação" },
  { key: "background", label: "Background" },
  { key: "avaliacao", label: "Avaliação" },
  { key: "recomendacao", label: "Recomendação" },
] as const;

function isConfirmed(doc: Document): boolean {
  return doc.confirmedBy !== null;
}

export default function DocumentEditPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: encounterId, docId } = use(params);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, unknown>>(
    {},
  );
  const [rawJson, setRawJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const docs = await apiClient.get<Document[]>(
          `/encounters/${encounterId}/documents`,
        );
        const doc = docs.find((d) => d.id === docId) ?? null;
        if (!doc) {
          setError("Documento não encontrado.");
          return;
        }
        setDocument(doc);
        const content = doc.physicianEdits ?? doc.content;
        setEditedContent(content);
        setRawJson(JSON.stringify(content, null, 2));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar documento.",
        );
      } finally {
        setLoading(false);
      }
    }
    refreshRef.current = fetchData;
    void fetchData();
  }, [encounterId, docId]);

  async function handleSave() {
    if (!document) return;
    setSaving(true);
    try {
      const contentToSave =
        document.type === "soap" || document.type === "sbar"
          ? editedContent
          : JSON.parse(rawJson);
      await apiClient.patch(
        `/encounters/${encounterId}/documents/${docId}`,
        { physicianEdits: contentToSave },
      );
      toast.success("Alterações salvas com sucesso.");
      await refreshRef.current();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar alterações.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      await apiClient.post(
        `/encounters/${encounterId}/documents/${docId}/confirm`,
      );
      toast.success("Documento confirmado com sucesso.");
      setConfirmOpen(false);
      await refreshRef.current();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao confirmar documento.",
      );
    } finally {
      setConfirming(false);
    }
  }

  function updateField(key: string, value: string) {
    setEditedContent((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>{error ?? "Documento não encontrado."}</AlertDescription>
      </Alert>
    );
  }

  const locked = isConfirmed(document);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <a href={`/encounters/${encounterId}/documents`}>← Voltar</a>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {TYPE_LABELS[document.type]}
          </h1>
          {locked ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              Confirmado
            </Badge>
          ) : (
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              Rascunho
            </Badge>
          )}
        </div>
        {!locked && (
          <Button onClick={() => setConfirmOpen(true)}>
            Confirmar Documento
          </Button>
        )}
      </div>

      {locked && (
        <Alert>
          <AlertTitle>Documento bloqueado</AlertTitle>
          <AlertDescription>
            Este documento já foi confirmado e não pode mais ser editado.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {document.type === "soap" && (
          <div className="space-y-4">
            {SOAP_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Textarea
                  id={field.key}
                  value={String(editedContent[field.key] ?? "")}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  disabled={locked}
                  rows={4}
                />
              </div>
            ))}
          </div>
        )}

        {document.type === "sbar" && (
          <div className="space-y-4">
            {SBAR_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Textarea
                  id={field.key}
                  value={String(editedContent[field.key] ?? "")}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  disabled={locked}
                  rows={4}
                />
              </div>
            ))}
          </div>
        )}

        {document.type !== "soap" && document.type !== "sbar" && (
          <div className="space-y-2">
            <Label htmlFor="raw-json">Conteúdo JSON</Label>
            <Textarea
              id="raw-json"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              disabled={locked}
              rows={16}
              className="font-mono text-sm"
            />
          </div>
        )}
      </div>

      {!locked && (
        <div className="flex gap-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar Alterações"}
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
              onClick={() => setConfirmOpen(false)}
              disabled={confirming}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={confirming}
            >
              {confirming ? "Confirmando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
