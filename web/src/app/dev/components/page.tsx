"use client";

import { useState } from "react";
import { Warning, Info, ArrowRight } from "@phosphor-icons/react";

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
    </div>
  );
}
