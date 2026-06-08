"use client";

import { useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { apiClient } from "@/lib/api-client";
import type { AuthResponse } from "@/lib/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRM_UF_OPTIONS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
];

interface FormState {
  name: string;
  email: string;
  password: string;
  crmUf: string;
  crmNumber: string;
}

function getPasswordStrength(password: string): {
  score: number;
  label: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Fraca" };
  if (score <= 3) return { score, label: "Média" };
  return { score, label: "Forte" };
}

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    crmUf: "",
    crmNumber: "",
  });
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);
  const strengthPercent = (strength.score / 5) * 100;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.email) return "E-mail é obrigatório.";
    if (!EMAIL_REGEX.test(form.email)) return "Formato de e-mail inválido.";
    if (!form.password) return "Senha é obrigatória.";
    if (form.password.length < 8) return "Senha deve ter no mínimo 8 caracteres.";
    if (!/[A-Z]/.test(form.password)) return "Senha deve conter ao menos uma letra maiúscula.";
    if (!/[a-z]/.test(form.password)) return "Senha deve conter ao menos uma letra minúscula.";
    if (!/\d/.test(form.password)) return "Senha deve conter ao menos um dígito.";
    if (!/[^A-Za-z0-9]/.test(form.password)) return "Senha deve conter ao menos um caractere especial.";
    if (!form.crmUf) return "Estado do CRM é obrigatório.";
    if (!form.crmNumber) return "Número do CRM é obrigatório.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setLoading(true);
    try {
      const data = await apiClient.post<AuthResponse>("/auth/register", {
        name: form.name || undefined,
        email: form.email,
        password: form.password,
        crmUf: form.crmUf,
        crmNumber: form.crmNumber,
      });
      login(data.physician);
      toast.success("Cadastro realizado com sucesso!");
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao criar conta.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Criar Conta</CardTitle>
        <CardDescription>
          Cadastre-se para usar o Copiloto Clínico
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome (opcional)</Label>
            <Input
              id="name"
              type="text"
              placeholder="Dr. João Silva"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              autoComplete="name"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              autoComplete="new-password"
              disabled={loading}
            />
            {form.password && (
              <div className="space-y-1">
                <Progress value={strengthPercent} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Força: {strength.label}
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>CRM UF</Label>
              <Select
                value={form.crmUf}
                onValueChange={(value) => updateField("crmUf", value)}
                disabled={loading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="crmNumber">Número do CRM</Label>
              <Input
                id="crmNumber"
                type="text"
                placeholder="12345"
                value={form.crmNumber}
                onChange={(e) => updateField("crmNumber", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando conta..." : "Cadastrar"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Faça login
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
