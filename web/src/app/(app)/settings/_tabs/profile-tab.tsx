"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-store";
import type { Physician } from "@/lib/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SealCheck,
  SealQuestion,
  IdentificationCard,
  UserCircle,
  ShieldCheck,
  Translate,
} from "@phosphor-icons/react";
import Link from "next/link";

/**
 * PI-05 — locales com dicionário embarcado (ver web/src/lib/messages).
 * Lista fechada de propósito: um valor fora daqui nunca deve ser oferecido
 * na UI, mesmo que o backend aceite (defesa em profundidade com o enum do
 * updateProfileSchema no backend).
 */
const LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es", label: "Español" },
];

/**
 * S24-NAV-01 — localização de role (antes era exibida em inglês cru:
 * PHYSICIAN/COMPLIANCE/ADMIN).
 */
const ROLE_LABELS: Record<string, string> = {
  PHYSICIAN: "Médico",
  COMPLIANCE: "Compliance",
  ADMIN: "Administrador",
};

function roleLabel(role?: string): string {
  if (!role) return "Médico";
  return ROLE_LABELS[role] ?? role;
}

export function ProfileTab({ physician }: { physician: Physician | null }) {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const [name, setName] = useState(physician?.name ?? "");
  const [loading, setLoading] = useState(false);
  // PI-05 — preferência de idioma persistida na conta (não localStorage do
  // dispositivo), ver Physician.locale. Salva imediatamente ao trocar — é
  // uma preferência de exibição, não um dado que justifique um botão
  // "Salvar" separado como o nome.
  const [localeSaving, setLocaleSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setLoading(true);
    try {
      const updated = await apiClient.patch<Physician>("/auth/me", {
        name: name.trim(),
      });
      login(updated);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Perfil atualizado com sucesso.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Erro ao atualizar perfil.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleLocaleChange(locale: string) {
    setLocaleSaving(true);
    try {
      const updated = await apiClient.patch<Physician>("/auth/me", { locale });
      login(updated);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Idioma atualizado.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Erro ao atualizar idioma.";
      toast.error(msg);
    } finally {
      setLocaleSaving(false);
    }
  }

  const hasChanges = name.trim() !== (physician?.name ?? "").trim();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-clinical-line bg-clinical-paper p-5">
        <h2 className="text-sm font-semibold text-clinical-ink">
          Identificação
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Edite seu nome. E-mail e CRM são fixos por segurança.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            type="text"
            placeholder="Dr. João Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            autoComplete="name"
          />
        </div>
        <Button type="submit" disabled={loading || !hasChanges}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </form>

      {/*
        PI-05 — o médico troca de terminal no hospital; a preferência de
        idioma precisa acompanhar a conta, não ficar presa ao localStorage
        de um dispositivo específico. Afeta a UI e o texto gerado pelo
        copiloto (raciocínio, recomendações, perguntas) — as citações de
        diretriz permanecem sempre em português, ver prompt-builder.ts.
      */}
      <div className="space-y-2">
        <Label htmlFor="profile-locale">Idioma</Label>
        <div className="flex items-center gap-2">
          <Translate className="size-5 shrink-0 text-muted-foreground" />
          <Select
            value={physician?.locale ?? "pt-BR"}
            onValueChange={handleLocaleChange}
            disabled={localeSaving}
          >
            <SelectTrigger id="profile-locale" className="w-full max-w-xs">
              <SelectValue placeholder="Idioma" />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Somente leitura
        </h3>

        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <UserCircle className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Nome de usuário</p>
            <p className="text-sm font-medium text-clinical-ink">
              {physician?.email ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <IdentificationCard className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm font-medium text-clinical-ink">
              {physician?.email ?? "—"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Não editável</span>
        </div>

        {/*
          S24-NAV-01 — role localizada (pt-BR). Antes aparecia como
          PHYSICIAN/COMPLIANCE/ADMIN (slug cru em inglês).
        */}
        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Papel</p>
            <p className="text-sm font-medium text-clinical-ink">
              {roleLabel(physician?.role)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-clinical-line bg-white px-4 py-3">
          {physician?.crmVerified ? (
            <SealCheck className="size-5 shrink-0 text-clinical-green" />
          ) : (
            <SealQuestion className="size-5 shrink-0 text-clinical-amber" />
          )}
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">CRM</p>
            <p className="text-sm font-medium text-clinical-ink">
              {physician ? `${physician.crmUf} ${physician.crmNumber}` : "—"}
            </p>
          </div>
          {physician?.crmVerified ? (
            <span className="rounded-full bg-clinical-green-bg px-2 py-0.5 text-xs font-medium text-clinical-green-foreground">
              Verificado
            </span>
          ) : (
            <Link
              href="/verificacao-crm"
              className="rounded-full bg-clinical-amber-bg px-2 py-0.5 text-xs font-medium text-clinical-amber-foreground hover:underline"
            >
              Pendente — verificar
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
