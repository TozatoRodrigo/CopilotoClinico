"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/layout/user-menu";
import { SealCheck, SealQuestion } from "@phosphor-icons/react";
import Link from "next/link";
import {
  SettingsPane,
  SettingsRow,
  SettingsSection,
} from "../_components/settings-layout";

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
    <SettingsPane
      title="Perfil"
      description="Edite seu nome. E-mail e CRM são fixos por segurança."
    >
      <SettingsSection title="Identificação">
        {/* Cartão de identidade do Notion: avatar + nome + e-mail. */}
        <div className="flex items-center gap-3 py-4">
          <UserAvatar className="size-12 text-base" />
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-foreground">
              {physician?.name ?? "Médico"}
            </p>
            <p className="truncate text-[0.8125rem] text-muted-foreground">
              {physician?.email ?? "—"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 py-4">
          <Label htmlFor="profile-name">Nome</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="profile-name"
              type="text"
              placeholder="Dr. João Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoComplete="name"
              className="sm:max-w-sm"
            />
            <Button type="submit" disabled={loading || !hasChanges} loading={loading}>
              Salvar
            </Button>
          </div>
        </form>
      </SettingsSection>

      {/*
        PI-05 — o médico troca de terminal no hospital; a preferência de
        idioma precisa acompanhar a conta, não ficar presa ao localStorage
        de um dispositivo específico. Afeta a UI e o texto gerado pelo
        copiloto (raciocínio, recomendações, perguntas) — as citações de
        diretriz permanecem sempre em português, ver prompt-builder.ts.
      */}
      <SettingsSection title="Preferências">
        <SettingsRow
          title="Idioma"
          htmlFor="profile-locale"
          description="Interface e texto gerado pelo copiloto. Citações de diretriz continuam em português."
          control={
            <Select
              value={physician?.locale ?? "pt-BR"}
              onValueChange={handleLocaleChange}
              disabled={localeSaving}
            >
              <SelectTrigger id="profile-locale" className="w-full sm:w-52">
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
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Conta"
        description="Somente leitura."
      >
        <SettingsRow
          title="E-mail"
          description="É também o seu nome de usuário para entrar. Não editável."
          control={
            <span className="text-sm text-foreground">{physician?.email ?? "—"}</span>
          }
        />

        {/*
          S24-NAV-01 — role localizada (pt-BR). Antes aparecia como
          PHYSICIAN/COMPLIANCE/ADMIN (slug cru em inglês).
        */}
        <SettingsRow
          title="Papel"
          description="Define o que você vê e pode fazer no Copiloto."
          control={<Badge variant="secondary">{roleLabel(physician?.role)}</Badge>}
        />

        <SettingsRow
          title="CRM"
          description={
            physician?.crmVerified
              ? "Registro ativo confirmado no CFM."
              : "Documentos confirmados antes da verificação ficam marcados como pendentes."
          }
          control={
            <>
              <span className="font-mono text-sm text-foreground">
                {physician ? `${physician.crmUf} ${physician.crmNumber}` : "—"}
              </span>
              {physician?.crmVerified ? (
                <Badge variant="success">
                  <SealCheck weight="fill" aria-hidden="true" />
                  Verificado
                </Badge>
              ) : (
                <Badge variant="warning" asChild>
                  <Link href="/verificacao-crm" className="hover:underline">
                    <SealQuestion weight="fill" aria-hidden="true" />
                    Pendente — verificar
                  </Link>
                </Badge>
              )}
            </>
          }
        />
      </SettingsSection>
    </SettingsPane>
  );
}
