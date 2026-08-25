"use client";

import { useState } from "react";
import { IdentificationCard } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIdentifyEncounterPatient } from "@/lib/clinical-queries";

/**
 * S25-QC-01/QC-02 — banner reutilizável para o estado "consulta rápida"
 * (encounter sem patientRef). Usado em três telas que precisam do mesmo
 * fluxo de identificar o paciente inline, sem sair da página:
 * - encounters/[id]/page.tsx (o caso ainda não está no plantão)
 * - encounters/[id]/result/page.tsx (bloqueia gerar documento)
 * - encounters/[id]/documents/page.tsx (idem)
 *
 * Cada tela passa sua própria `description` porque o motivo de identificar
 * muda por contexto (entrar no plantão vs. poder gerar documento), mas o
 * formulário inline e a mutation são os mesmos — centralizados aqui para
 * não duplicar a lógica de identificação em três lugares.
 */
export function QuickConsultBanner({
  encounterId,
  description,
  successMessage = "Paciente identificado — o caso agora está no seu plantão.",
}: {
  encounterId: string;
  description: string;
  successMessage?: string;
}) {
  const identifyPatient = useIdentifyEncounterPatient(encounterId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await identifyPatient.mutateAsync(trimmed);
      toast.success(successMessage);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao identificar o paciente.");
    }
  }

  return (
    <Alert className="mb-6">
      <IdentificationCard className="size-4" />
      <AlertTitle>Consulta rápida</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{description}</p>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={50}
            placeholder="Ex: JSL-Leito04, PRN-2024-00123"
            aria-label="Identificador do paciente"
            aria-invalid={!!error}
            className="h-9 max-w-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!value.trim() || identifyPatient.isPending}
            loading={identifyPatient.isPending}
          >
            Identificar paciente
          </Button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
