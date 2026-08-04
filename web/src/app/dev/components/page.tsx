"use client";

import { useState } from "react";
import { Warning, Info, ArrowRight, ClipboardText } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatCard, StatStrip } from "@/components/ui/stat-card";
import { DecisionThread, type DecisionThreadItem } from "@/components/domain/decision-thread";
import { CitationFootnote, CitationFootnoteSkeleton } from "@/components/domain/citation-footnote";
import { BlockerQuestionCard } from "@/components/domain/blocker-question-card";
import { UncertaintyBanner } from "@/components/domain/uncertainty-banner";
import { ConfirmedSeal } from "@/components/domain/confirmed-seal";
import { AuditHash } from "@/components/domain/audit-hash";
import { EmptyState } from "@/components/domain/empty-state";
import { ConnectionStatus } from "@/components/domain/connection-status";
import { DEMO_CASE_PRESETS } from "@/lib/demo-case-presets";

const GRIPAL_CASE = DEMO_CASE_PRESETS.find((preset) => preset.slug === "sindrome-gripal")!;

const DECISION_THREAD_ITEMS: DecisionThreadItem[] = [
  {
    id: "1",
    state: "analysis",
    title: "Análise inicial gerada",
    description: "Síndrome gripal há 3 dias, sem sinais de SRAG.",
    timestamp: "09:12",
  },
  {
    id: "2",
    state: "question",
    title: "Pergunta enviada: uso de imunossupressor?",
    description: "Resposta muda a indicação de antiviral após 48 horas.",
    timestamp: "09:13",
  },
  {
    id: "3",
    state: "conduct",
    title: "Conduta atualizada: iniciar oseltamivir",
    description: "Paciente confirmado em grupo de risco (uso de imunossupressor).",
    timestamp: "09:15",
    current: true,
  },
  {
    id: "4",
    state: "document",
    title: "Documento gerado e assinado",
    timestamp: "09:16",
  },
];

export default function ComponentsSpecimenPage() {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");

  return (
    <div className="container mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl text-foreground">Primitivos</h1>
        <p className="text-sm text-muted-foreground">
          /dev/components — specimen dos primitivos shadcn descaracterizados
          (A3), em todos os estados, com conteúdo clínico real.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Button</h2>
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Salvar conduta</Button>
              <Button variant="outline">Cancelar</Button>
              <Button variant="secondary">Reanalisar</Button>
              <Button variant="ghost">Ver trecho</Button>
              <Button variant="destructive">Excluir documento</Button>
              <Button variant="link">Ver citação completa</Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Pequeno</Button>
              <Button>Padrão (40px / 44px no mobile)</Button>
              <Button size="lg">Grande (44px)</Button>
              <Button size="icon" aria-label="Próximo">
                <ArrowRight />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button loading={loading} onClick={() => setLoading((v) => !v)}>
                {loading ? "Enviando resposta..." : "Enviar resposta"}
              </Button>
              <Button disabled>Desabilitado</Button>
              <p className="text-sm text-muted-foreground">
                O botão de loading mantém a largura ao alternar para o
                spinner.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Input &amp; Textarea
        </h2>
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="spec-saturacao">Saturação em ar ambiente (%)</Label>
              <Input
                id="spec-saturacao"
                type="number"
                inputMode="numeric"
                placeholder="Ex.: 96"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <p className="min-h-4 text-xs text-muted-foreground">
                Informe o último valor aferido na admissão.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spec-pressao">Pressão arterial (mmHg)</Label>
              <Input
                id="spec-pressao"
                aria-invalid
                aria-describedby="spec-pressao-error"
                defaultValue="95 por --"
              />
              <p
                id="spec-pressao-error"
                className="min-h-4 text-xs text-destructive"
              >
                Informe a pressão diastólica para continuar.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spec-resumo">Resumo do caso</Label>
              <Textarea
                id="spec-resumo"
                defaultValue="Paciente de 58 anos com dor torácica súbita em aperto há 40 minutos, irradiando para braço esquerdo, associada a sudorese e náusea."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spec-disabled">Campo desabilitado</Label>
              <Input id="spec-disabled" disabled value="Bloqueado para edição" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Badge</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Preliminar</Badge>
            <Badge variant="success">Confirmado</Badge>
            <Badge variant="warning">Muda a conduta</Badge>
            <Badge variant="outline">Diretriz pública</Badge>
            <Badge variant="secondary">Protocolo institucional</Badge>
            <Badge variant="default">Confiança: 82%</Badge>
            <Badge variant="destructive">Erro de sincronização</Badge>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Card</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hipótese considerada</CardTitle>
              <CardDescription>
                Cartão informativo — borda visível e sombra única, sem
                elevação ao passar o mouse.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Síndrome coronariana aguda permanece no topo dos diagnósticos
              diferenciais até ECG seriado e troponina.
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            className="cursor-pointer transition-shadow hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <CardHeader>
              <CardTitle className="text-base">Ver documento gerado</CardTitle>
              <CardDescription>
                Cartão clicável — elevação reservada para ações.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Abre o prontuário com a conduta registrada e o hash de
              auditoria.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          StatCard / StatStrip
        </h2>
        <div className="grid gap-3.5 md:grid-cols-[1.4fr_1fr]">
          <StatCard
            label="Aguardando sua revisão"
            value={4}
            sublabel="casos no plantão"
            variant="highlight"
          />
          <StatStrip
            items={[
              { label: "Casos hoje", value: 11 },
              { label: "Rascunhos", value: 2 },
              { label: "Confirmados", value: 8 },
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Alert</h2>
        <div className="space-y-3">
          <Alert>
            <Info />
            <AlertTitle>Diretriz atualizada</AlertTitle>
            <AlertDescription>
              A diretriz de síndrome gripal foi atualizada para a versão v3.
            </AlertDescription>
          </Alert>

          <Alert className="border-clinical-amber/40 bg-clinical-amber-bg text-clinical-amber-foreground">
            <Warning />
            <AlertTitle>Incerteza na análise</AlertTitle>
            <AlertDescription>
              Faltam dados para confirmar grupo de risco. Responda as
              perguntas do copiloto antes de prosseguir.
            </AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <Warning />
            <AlertTitle>Erro ao reanalisar</AlertTitle>
            <AlertDescription>
              Não foi possível enviar a resposta. Tentando novamente quando
              voltar a ficar online.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Dialog</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Confirmar conduta</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle variant="brand">
                    Confirmar conduta clínica
                  </DialogTitle>
                  <DialogDescription>
                    Você está confirmando a conduta &ldquo;Iniciar
                    antibioticoterapia empírica e coletar lactato&rdquo;. Esta
                    ação é registrada com hash de auditoria e assinatura do
                    médico responsável.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Voltar</Button>
                  </DialogClose>
                  <Button>Confirmar e assinar conduta</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Tooltip</h2>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Confiança: 82%</Button>
              </TooltipTrigger>
              <TooltipContent>
                Calculada a partir da concordância entre as diretrizes
                citadas (abre após 300ms).
              </TooltipContent>
            </Tooltip>
            <p className="text-sm text-muted-foreground">
              Passe o mouse e aguarde 300ms para abrir.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="space-y-1 pt-6">
        <h1 className="font-display text-3xl text-foreground">
          Componentes de domínio
        </h1>
        <p className="text-sm text-muted-foreground">
          /dev/components — specimen dos componentes de domínio (A4), usando
          o caso piloto &ldquo;{GRIPAL_CASE.title}&rdquo;.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">DecisionThread</h2>
        <Card>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Modo ativo</p>
              <DecisionThread items={DECISION_THREAD_ITEMS} mode="active" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Modo histórico</p>
              <DecisionThread items={DECISION_THREAD_ITEMS} mode="history" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Carregando</p>
              <DecisionThread items={[]} loading />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Vazio</p>
              <DecisionThread items={[]} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">CitationFootnote</h2>
        <Card>
          <CardContent className="space-y-4">
            <CitationFootnote
              source="Diretriz Influenza"
              sourceVersion="3"
              text="Pacientes com síndrome gripal e comorbidades imunossupressoras devem receber oseltamivir mesmo após 48 horas do início dos sintomas."
              evidenceLevel="A"
              origin="public"
              href="https://example.com/diretriz"
            />
            <CitationFootnote
              source="Protocolo institucional — Síndrome gripal"
              sourceVersion="2"
              text="Reavaliar grupo de risco em pacientes com doença autoimune em uso de imunossupressor."
              origin="institutional"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Carregando</p>
              <CitationFootnoteSkeleton />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">BlockerQuestionCard</h2>
        <BlockerQuestionCard
          question="Paciente faz uso atual de imunossupressor?"
          why="A resposta muda a indicação de antiviral: pacientes em grupo de risco mantêm indicação de oseltamivir mesmo após 48 horas do início dos sintomas."
          citation={{
            source: "Diretriz Influenza",
            sourceVersion: "3",
            origin: "public",
          }}
        >
          <div role="group" aria-label="Paciente faz uso atual de imunossupressor?" className="flex flex-wrap gap-2">
            <Button type="button" className="h-11 px-4">Sim</Button>
            <Button type="button" variant="outline" className="h-11 px-4">Não</Button>
            <Button type="button" variant="outline" className="h-11 px-4">Não sei</Button>
          </div>
        </BlockerQuestionCard>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">UncertaintyBanner</h2>
        <div className="space-y-3">
          <UncertaintyBanner reason="Faltam dados sobre uso de imunossupressor para confirmar grupo de risco e indicação de antiviral." />
          <UncertaintyBanner />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">ConfirmedSeal</h2>
        <div className="space-y-3">
          <ConfirmedSeal
            status="confirmed"
            confirmedAt="2026-06-12T09:16:00-03:00"
            physicianName="Dra. Ana Souza"
            crm="CRM-SP 123456"
            hash="9f2a7c1e8b4d6f3a0c5e7b1d2f4a6c8e"
          />
          <ConfirmedSeal status="pending" />
          <ConfirmedSeal status="error" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">AuditHash</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <AuditHash hash="9f2a7c1e8b4d6f3a0c5e7b1d2f4a6c8e" href="/audit" />
            <AuditHash status="loading" />
            <AuditHash status="error" />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">EmptyState</h2>
        <Card>
          <CardContent className="py-2">
            <EmptyState
              icon={<ClipboardText className="size-8" />}
              title="Nenhum atendimento encontrado"
              description="Os atendimentos que você criar aparecerão aqui."
              actionLabel="Novo Atendimento"
              actionHref="/encounters/new"
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">ConnectionStatus</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <ConnectionStatus status="online" />
            <ConnectionStatus status="offline" />
            <ConnectionStatus status="syncing" />
          </CardContent>
        </Card>
      </section>

      {/* Tech debt cleanup: DataMetric component was removed (dead code). */}
    </div>
  );
}
