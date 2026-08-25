"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Warning } from "@phosphor-icons/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getDemoCasePreset } from "@/lib/demo-case-presets";
import type {
  CreateEncounterRequest,
  CreateEncounterResponse,
  EncounterContext,
} from "@/lib/types";

interface ContextChip {
  key: keyof EncounterContext;
  label: string;
}

const CONTEXT_CHIPS: ContextChip[] = [
  { key: "hasCT", label: "TC" },
  { key: "isSus", label: "SUS" },
  { key: "hasLab", label: "Laboratório" },
  { key: "hasICU", label: "UTI" },
];

const DEFAULT_CONTEXT: EncounterContext = {
  hasCT: false,
  isSus: false,
  hasLab: false,
  hasICU: false,
};

const CPF_UNFORMATTED = /^\d{11}$/;
const CPF_FORMATTED = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const PHONE_PATTERN = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;
const FULL_NAME_PATTERN =
  /\b[A-ZÁÀÂÃÉÈÊÍÏÓÕÔÚÜÇÑ][a-záàâãéèêíïóõôúüçñ]{1,}(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÀÂÃÉÈÊÍÏÓÕÔÚÜÇÑ][a-záàâãéèêíïóõôúüçñ]{1,})+\b/;

function detectPII(value: string): string | null {
  if (CPF_UNFORMATTED.test(value)) return "CPF detectado";
  if (CPF_FORMATTED.test(value)) return "CPF detectado";
  if (PHONE_PATTERN.test(value)) return "Telefone detectado";
  if (FULL_NAME_PATTERN.test(value)) return "Nome completo detectado";
  return null;
}

export default function NewEncounterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoCaseSlug = searchParams.get("demoCase");
  const demoPreset = getDemoCasePreset(demoCaseSlug);

  const [patientRef, setPatientRef] = useState(
    () => demoPreset?.patientRef ?? "",
  );
  // UX-04 — vertical não é mais um campo que o médico precisa escolher antes
  // de analisar: o texto do caso já carrega essa classificação (foi o que os
  // dois médicos pilotos questionaram na reunião — "a depender do contexto
  // do caso clínico... talvez aquela seleção ali seja redundante"). Default
  // silencioso para "general"; presets de demo ainda podem sobrescrever.
  // O médico confirma/corrige depois, na tela do caso (chip editável).
  const [vertical] = useState<CreateEncounterRequest["vertical"]>(
    () =>
      (demoPreset?.vertical as CreateEncounterRequest["vertical"] | undefined) ??
      "general",
  );
  const [context, setContext] = useState<EncounterContext>(
    () => demoPreset?.context ?? DEFAULT_CONTEXT,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const piiWarning = useMemo(() => detectPII(patientRef), [patientRef]);
  const trimmed = patientRef.trim();
  // S25-QC-01 — identificação deixou de ser obrigatória: sem ela, o médico
  // ainda consegue enviar e o caso nasce como consulta rápida (fora do
  // Plantão até ser identificado depois). Só o aviso de PII continua
  // bloqueando — nunca aceitar CPF/nome mesmo num campo agora opcional.
  const canSubmit = !piiWarning && !submitting;

  function toggleContext(key: keyof EncounterContext) {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: CreateEncounterRequest = {
        // S25-QC-01 — omitido (não string vazia) quando o médico não
        // preencheu: o backend trata a ausência do campo como consulta
        // rápida. Enviar '' seria tratado como valor inválido (min 1 char).
        patientRef: trimmed.length > 0 ? trimmed : undefined,
        vertical,
        context,
      };
      const response = await apiClient.post<CreateEncounterResponse>(
        "/encounters",
        body,
      );
      const captureUrl = demoPreset
        ? `/encounters/${response.id}/capture?demoCase=${demoPreset.slug}`
        : `/encounters/${response.id}/capture`;
      router.push(captureUrl);
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Novo Atendimento">
        {/* S22-NAV-01 — Link em vez de <a href> (evitava reload da página). */}
        <Button variant="outline" asChild>
          <Link href="/dashboard">Voltar</Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {demoPreset && (
              <Alert>
                <AlertTitle>{demoPreset.title}</AlertTitle>
                <AlertDescription>{demoPreset.summary}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="patientRef">
                Referência do Paciente{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Input
                id="patientRef"
                value={patientRef}
                onChange={(e) => setPatientRef(e.target.value)}
                maxLength={50}
                placeholder="Ex: JSL-Leito04, PRN-2024-00123, SUS-700-0123"
                aria-invalid={!!piiWarning}
                aria-describedby={
                  piiWarning ? "pii-warning" : "patientRef-hint"
                }
              />
              {piiWarning ? (
                <p
                  id="pii-warning"
                  className="flex items-center gap-1.5 text-sm text-destructive"
                  role="alert"
                >
                  <Warning className="size-4 shrink-0" />
                  {piiWarning} — use um identificador opaco (prontuário, leito,
                  hash). Dados pessoais não são permitidos (LGPD Art. 13).
                </p>
              ) : (
                <p id="patientRef-hint" className="text-xs text-muted-foreground">
                  <ShieldCheck className="mr-1 inline size-3" />
                  {/* S25-QC-01 — deixar em branco não bloqueia mais o envio:
                      vira uma consulta rápida, fora do Plantão até você
                      identificar o paciente (dá pra fazer isso depois, na
                      tela do caso). Quando preenchido, use um identificador
                      opaco — nunca nome, CPF ou telefone. */}
                  Deixe em branco para uma consulta rápida — o caso só entra
                  no seu plantão quando você identificar o paciente
                  (agora ou depois). Se preencher, use um identificador
                  opaco (prontuário, leito, hash), nunca dados pessoais.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Contexto</Label>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => toggleContext(chip.key)}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Badge variant={context[chip.key] ? "default" : "outline"}>
                      {chip.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting
                ? "Criando..."
                : trimmed.length > 0
                  ? "Criar e capturar"
                  : "Iniciar consulta rápida"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
