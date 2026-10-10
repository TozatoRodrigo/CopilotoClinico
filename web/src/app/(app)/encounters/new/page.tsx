"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  FilePlus,
  Flask,
  Microphone,
  Plus,
  ShieldCheck,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getDemoCasePreset } from "@/lib/demo-case-presets";
import { cn } from "@/lib/utils";
import type {
  CreateEncounterRequest,
  CreateEncounterResponse,
  EncounterContext,
} from "@/lib/types";
import { VerticalTag } from "../_components/encounter-tags";

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
    <Page width="narrow">
      <PageHeader
        icon={FilePlus}
        title="Novo caso"
        description="Identifique o paciente e o contexto do atendimento. Em seguida você dita ou digita o caso para o copiloto analisar."
      />

      {demoPreset && (
        <Callout
          tone="purple"
          icon={<Flask weight="duotone" />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Caso piloto: {demoPreset.title}
              <VerticalTag vertical={demoPreset.vertical} />
            </span>
          }
        >
          {demoPreset.summary}
        </Callout>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Label htmlFor="patientRef">
            Referência do paciente
            <span className="font-normal">(opcional)</span>
          </Label>
          <Input
            id="patientRef"
            value={patientRef}
            onChange={(e) => setPatientRef(e.target.value)}
            maxLength={50}
            placeholder="Ex: JSL-Leito04, PRN-2024-00123, SUS-700-0123"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!piiWarning}
            aria-describedby={
              piiWarning ? "pii-warning" : "patientRef-hint"
            }
            className="md:h-9"
          />
          {piiWarning ? (
            <p
              id="pii-warning"
              className="flex items-start gap-1.5 text-[0.8125rem] text-destructive"
              role="alert"
            >
              <Warning className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden="true" />
              <span>
                {piiWarning} — use um identificador opaco (prontuário, leito,
                hash). Dados pessoais não são permitidos (LGPD Art. 13).
              </span>
            </p>
          ) : (
            <p
              id="patientRef-hint"
              className="flex items-start gap-1.5 text-[0.8125rem] text-muted-foreground"
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {/* S25-QC-01 — deixar em branco não bloqueia mais o envio:
                  vira uma consulta rápida, fora do Plantão até você
                  identificar o paciente (dá pra fazer isso depois, na
                  tela do caso). Quando preenchido, use um identificador
                  opaco — nunca nome, CPF ou telefone. */}
              <span>
                Deixe em branco para uma consulta rápida — o caso só entra
                no seu plantão quando você identificar o paciente
                (agora ou depois). Se preencher, use um identificador
                opaco (prontuário, leito, hash), nunca dados pessoais.
              </span>
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[0.8125rem] leading-none font-medium text-muted-foreground">
            Contexto do atendimento
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {CONTEXT_CHIPS.map((chip) => {
              const selected = context[chip.key];
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleContext(chip.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors duration-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 max-sm:h-10 max-sm:px-3",
                    selected
                      ? "border-transparent bg-tone-gray-tag font-medium text-foreground"
                      : "border-dashed border-input text-muted-foreground hover:bg-hover hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <Check className="size-3.5" weight="bold" aria-hidden="true" />
                  ) : (
                    <Plus className="size-3.5" aria-hidden="true" />
                  )}
                  {chip.label}
                </button>
              );
            })}
          </div>
          <p className="text-[0.8125rem] text-muted-foreground">
            Marque os recursos disponíveis agora — a análise leva isso em conta.
          </p>
        </fieldset>

        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden="true" />
            <AlertTitle>Não foi possível criar o caso</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-end">
          {/* S22-NAV-01 — Link em vez de <a href> (evitava reload da página). */}
          <Button variant="ghost" size="lg" asChild>
            <Link href="/dashboard">Cancelar</Link>
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            aria-busy={submitting || undefined}
            className="sm:min-w-44"
          >
            <Microphone weight="fill" aria-hidden="true" />
            {submitting
              ? "Criando..."
              : trimmed.length > 0
                ? "Criar e capturar"
                : "Iniciar consulta rápida"}
          </Button>
        </div>
      </form>
    </Page>
  );
}
