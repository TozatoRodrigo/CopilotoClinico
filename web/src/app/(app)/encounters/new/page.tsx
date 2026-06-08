"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EncounterContext {
  hasCT: boolean;
  isSus: boolean;
  hasLab: boolean;
  hasICU: boolean;
}

interface CreateEncounterBody {
  patientRef: string;
  vertical: string;
  context: EncounterContext;
}

interface CreateEncounterResponse {
  id: string;
}

interface ContextChip {
  key: keyof EncounterContext;
  label: string;
}

const VERTICALS = [
  { value: "trauma", label: "Trauma" },
  { value: "cardiac", label: "Cardíaco" },
  { value: "pediatric", label: "Pediátrico" },
  { value: "neuro", label: "Neuro" },
  { value: "general", label: "Geral" },
];

const CONTEXT_CHIPS: ContextChip[] = [
  { key: "hasCT", label: "TC" },
  { key: "isSus", label: "SUS" },
  { key: "hasLab", label: "Laboratório" },
  { key: "hasICU", label: "UTI" },
];

export default function NewEncounterPage() {
  const router = useRouter();
  const [patientRef, setPatientRef] = useState("");
  const [vertical, setVertical] = useState("trauma");
  const [context, setContext] = useState<EncounterContext>({
    hasCT: false,
    isSus: false,
    hasLab: false,
    hasICU: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleContext(key: keyof EncounterContext) {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientRef.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: CreateEncounterBody = {
        patientRef: patientRef.trim(),
        vertical,
        context,
      };
      const response = await apiClient.post<CreateEncounterResponse>("/encounters", body);
      router.push(`/encounters/${response.id}/capture`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erro ao criar atendimento.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Novo Atendimento">
        <Button variant="outline" asChild>
          <a href="/dashboard">Voltar</a>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="patientRef">Referência do Paciente</Label>
              <Input
                id="patientRef"
                value={patientRef}
                onChange={(e) => setPatientRef(e.target.value)}
                maxLength={50}
                placeholder="Nome ou identificação do paciente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Vertical</Label>
              <Select value={vertical} onValueChange={setVertical}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERTICALS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Contexto</Label>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => toggleContext(chip.key)}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                  >
                    <Badge variant={context[chip.key] ? "default" : "outline"}>
                      {chip.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting || !patientRef.trim()} className="w-full">
              {submitting ? "Criando..." : "Iniciar Atendimento"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
