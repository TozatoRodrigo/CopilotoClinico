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
  SealCheck,
  SealQuestion,
  IdentificationCard,
  UserCircle,
} from "@phosphor-icons/react";
import Link from "next/link";

export function ProfileTab({ physician }: { physician: Physician | null }) {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const [name, setName] = useState(physician?.name ?? "");
  const [loading, setLoading] = useState(false);

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
