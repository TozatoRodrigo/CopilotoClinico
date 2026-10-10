'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarBlank,
  CheckCircle,
  ClipboardText,
  Copy,
  DotsThree,
  Heartbeat,
  Info,
  Lightbulb,
  MagnifyingGlass,
  Microphone,
  PencilSimple,
  Plus,
  SealCheck,
  Sparkle,
  Stethoscope,
  Tag,
  Trash,
  User,
  Warning,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ui/callout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Disclosure } from '@/components/ui/disclosure';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard, StatStrip } from '@/components/ui/stat-card';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { ChartPaper } from '@/components/ui/chart-paper';
import { Kbd } from '@/components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/domain/empty-state';
import type { Tone } from '@/lib/tone';
import { ShowcaseSection, Specimen, Token } from './showcase';

export function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  return (
    <ShowcaseSection
      id="botoes"
      title="Botões"
      description="Um botão azul por tela (a ação principal). Secundárias em outline, baixa ênfase em ghost. Crescem para 40px no toque."
    >
      <Specimen title="Variantes">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Salvar conduta</Button>
          <Button variant="outline">Cancelar</Button>
          <Button variant="secondary">Reanalisar</Button>
          <Button variant="ghost">Ver trecho</Button>
          <Button variant="destructive">Excluir documento</Button>
          <Button variant="link">Ver citação completa</Button>
        </div>
      </Specimen>
      <Specimen
        title="Tamanhos"
        note={
          <>
            <Token>xs</Token> 24px · <Token>sm</Token> 28px em barras de ferramentas · <Token>default</Token>{' '}
            32px · <Token>lg</Token> 40px só em CTAs de entrada (login, novo caso).
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra pequeno</Button>
          <Button size="sm">Pequeno</Button>
          <Button>Padrão</Button>
          <Button size="lg">
            <Microphone weight="fill" />
            Novo caso por voz
          </Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <Button size="icon-xs" variant="ghost" aria-label="Mais ações (xs)">
            <DotsThree weight="bold" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Mais ações (sm)">
            <DotsThree weight="bold" />
          </Button>
          <Button size="icon" variant="outline" aria-label="Próximo">
            <ArrowRight />
          </Button>
          <Button size="icon-lg" aria-label="Gravar">
            <Microphone weight="fill" />
          </Button>
        </div>
      </Specimen>
      <Specimen title="Com ícone, carregando e desabilitado" note="O loading mantém a largura do botão ao trocar o texto pelo spinner.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <Plus />
            Novo
          </Button>
          <Button size="sm">
            Aprovar
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button loading={loading} onClick={() => setLoading((v) => !v)}>
            {loading ? 'Enviando resposta...' : 'Enviar resposta'}
          </Button>
          <Button disabled>Desabilitado</Button>
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}

export function TagsSection() {
  return (
    <ShowcaseSection
      id="tags"
      title="Tags"
      description="Badge = tag de seleção do Notion: texto normal, sem caixa-alta, fundo pastel com tinta escura (AA ≥ 10:1)."
    >
      <Specimen title="Semânticas" note="Carregam o significado clínico fixo.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">
            <WarningCircle weight="fill" />
            Muda a conduta
          </Badge>
          <Badge variant="success">
            <SealCheck weight="fill" />
            Confirmado
          </Badge>
          <Badge variant="destructive">
            <XCircle weight="fill" />
            Erro de sincronização
          </Badge>
          <Badge variant="default">Em revisão</Badge>
          <Badge variant="secondary">Rascunho</Badge>
        </div>
      </Specimen>
      <Specimen title="Categorias" note="Sem peso clínico: vertical, tipo de documento, fonte, especialidade.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gray">Geral</Badge>
          <Badge variant="brown">Infectologia</Badge>
          <Badge variant="yellow">Protocolo institucional</Badge>
          <Badge variant="purple">Cardíaco</Badge>
          <Badge variant="pink">Pediátrico</Badge>
          <Badge variant="blue">Atestado</Badge>
        </div>
      </Specimen>
      <Specimen title="Utilitárias">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Diretriz pública</Badge>
          <Badge variant="ghost">
            <Tag />
            Sem categoria
          </Badge>
          <Badge variant="link" asChild>
            <a href="#tags">Ver todas</a>
          </Badge>
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}

export function InputsSection() {
  const [value, setValue] = useState('');
  return (
    <ShowcaseSection
      id="campos"
      title="Campos"
      description="Fundo quente e borda sutil; rótulo cinza de 13px acima do campo; erro com texto, não só borda."
    >
      <div className="grid gap-5 md:grid-cols-2">
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
          <p className="text-xs text-muted-foreground">Informe o último valor aferido na admissão.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="spec-pressao">Pressão arterial (mmHg)</Label>
          <Input
            id="spec-pressao"
            aria-invalid
            aria-describedby="spec-pressao-error"
            defaultValue="95 por --"
          />
          <p id="spec-pressao-error" className="flex items-center gap-1 text-xs text-destructive">
            <WarningCircle weight="fill" className="size-3.5" aria-hidden="true" />
            Informe a pressão diastólica para continuar.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="spec-vertical">Vertical</Label>
          <Select defaultValue="cardiac">
            <SelectTrigger id="spec-vertical" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Geral</SelectItem>
              <SelectItem value="cardiac">Cardíaco</SelectItem>
              <SelectItem value="trauma">Trauma</SelectItem>
              <SelectItem value="pediatric">Pediátrico</SelectItem>
              <SelectItem value="neuro">Neuro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="spec-busca">Busca em database</Label>
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input id="spec-busca" type="search" placeholder="Buscar casos, pacientes, diretrizes" className="pl-8" />
          </div>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="spec-resumo">Resumo do caso</Label>
          <Textarea
            id="spec-resumo"
            defaultValue="Paciente de 58 anos com dor torácica súbita em aperto há 40 minutos, irradiando para braço esquerdo, associada a sudorese e náusea."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="spec-disabled">Campo desabilitado</Label>
          <Input id="spec-disabled" disabled value="Bloqueado para edição" readOnly />
        </div>
      </div>
    </ShowcaseSection>
  );
}

const CALLOUTS: { tone: Tone; icon: ReactNode; title: string; body: string }[] = [
  { tone: 'gray', icon: <Info />, title: 'Nota', body: 'Bloco neutro para observações e contexto sem peso clínico.' },
  { tone: 'blue', icon: <Sparkle />, title: 'Resumo do copiloto', body: 'Informação do sistema ou da IA — síndrome gripal sem sinais de SRAG.' },
  { tone: 'orange', icon: <WarningCircle weight="fill" />, title: 'Muda a conduta', body: 'Confirme o uso de imunossupressor antes de decidir pelo antiviral.' },
  { tone: 'green', icon: <SealCheck weight="fill" />, title: 'Conduta confirmada', body: 'Documento assinado às 09:16 por Dra. Ana Souza.' },
  { tone: 'red', icon: <XCircle weight="fill" />, title: 'Risco / erro', body: 'Não foi possível sincronizar. A resposta será reenviada ao voltar online.' },
  { tone: 'yellow', icon: <Lightbulb />, title: 'Dica', body: 'Use ⌘K para buscar casos, diretrizes e ações de qualquer tela.' },
  { tone: 'purple', icon: <Stethoscope />, title: 'Caso piloto', body: 'Caso de treino para conhecer o fluxo completo.' },
  { tone: 'brown', icon: <BookOpen />, title: 'Fonte', body: 'Diretriz Influenza — Ministério da Saúde, v3.' },
  { tone: 'pink', icon: <Heartbeat />, title: 'Pediatria', body: 'Doses ajustadas por peso nesta vertical.' },
];

export function CalloutsSection() {
  return (
    <ShowcaseSection
      id="callouts"
      title="Callouts"
      description="Bloco de destaque estático com ícone. Para mensagens que surgem após uma ação e precisam ser anunciadas, use Alert."
    >
      <div className="grid gap-2.5 md:grid-cols-2">
        {CALLOUTS.map((c) => (
          <Callout key={c.tone} tone={c.tone} icon={c.icon} title={c.title}>
            {c.body}
          </Callout>
        ))}
      </div>
    </ShowcaseSection>
  );
}

export function AlertsSection() {
  return (
    <ShowcaseSection
      id="alertas"
      title="Alertas"
      description={
        <>
          Mesmo visual do callout, com <Token>role=&quot;alert&quot;</Token> (anunciado por leitor de tela).
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Alert>
          <Info />
          <AlertTitle>Diretriz atualizada</AlertTitle>
          <AlertDescription>A diretriz de síndrome gripal foi atualizada para a versão v3.</AlertDescription>
        </Alert>
        <Alert variant="info">
          <Sparkle />
          <AlertTitle>Análise pronta</AlertTitle>
          <AlertDescription>O copiloto terminou a análise com 3 citações.</AlertDescription>
        </Alert>
        <Alert variant="warning">
          <Warning />
          <AlertTitle>Incerteza na análise</AlertTitle>
          <AlertDescription>
            Faltam dados para confirmar grupo de risco. Responda as perguntas do copiloto antes de prosseguir.
          </AlertDescription>
        </Alert>
        <Alert variant="success">
          <CheckCircle />
          <AlertTitle>CRM aprovado</AlertTitle>
          <AlertDescription>O médico já pode usar o Copiloto Clínico.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Erro ao reanalisar</AlertTitle>
          <AlertDescription>
            Não foi possível enviar a resposta. Tentando novamente quando voltar a ficar online.
          </AlertDescription>
        </Alert>
        <Alert variant="outline">
          <Info />
          <AlertTitle>Contorno</AlertTitle>
          <AlertDescription>Variante neutra com borda, para áreas já coloridas.</AlertDescription>
        </Alert>
      </div>
    </ShowcaseSection>
  );
}

export function BlocksSection() {
  return (
    <ShowcaseSection
      id="blocos"
      title="Toggle e propriedades"
      description="Blocos do Notion: toggle (▸) para detalhes secundários e lista de propriedades logo abaixo do título."
    >
      <Specimen title="Disclosure (toggle)" note="Raciocínio da IA, metadados técnicos, detalhes longos.">
        <div className="flex flex-col gap-1">
          <Disclosure title="Raciocínio do copiloto" meta="3 passos" defaultOpen>
            <ol className="list-decimal space-y-1 pl-4 text-[0.9375rem] text-foreground">
              <li>Síndrome gripal há 3 dias, sem sinais de SRAG.</li>
              <li>Antecedente de doença autoimune — possível grupo de risco.</li>
              <li>Uso de imunossupressor muda a indicação de oseltamivir após 48 horas.</li>
            </ol>
          </Disclosure>
          <Disclosure title="Metadados técnicos" meta="modelo, latência">
            <p className="font-mono text-[0.8125rem] text-muted-foreground">claude-sonnet-4-5 · 8.120 ms · 3 citações</p>
          </Disclosure>
        </div>
      </Specimen>
      <Specimen title="PropertyList" note="Metadados da página: paciente, vertical, status, datas.">
        <PropertyList>
          <PropertyRow icon={User} label="Paciente">
            Leito 4 · JMS
          </PropertyRow>
          <PropertyRow icon={Stethoscope} label="Vertical">
            <Badge variant="purple">Cardíaco</Badge>
          </PropertyRow>
          <PropertyRow icon={Sparkle} label="Status">
            <Badge variant="default">Em revisão</Badge>
          </PropertyRow>
          <PropertyRow icon={CalendarBlank} label="Criado em">
            10/10/2026, 09:12
          </PropertyRow>
          <PropertyRow icon={SealCheck} label="Responsável">
            Dra. Ana Souza <span className="font-mono text-[0.8125rem] text-muted-foreground">CRM-SP 123456</span>
          </PropertyRow>
        </PropertyList>
      </Specimen>
    </ShowcaseSection>
  );
}

interface SampleCase {
  id: string;
  complaint: string;
  patient: string;
  vertical: { label: string; variant: 'purple' | 'gray' | 'pink' | 'brown' };
  status: { label: string; variant: 'default' | 'secondary' | 'success' };
  updated: string;
}

const SAMPLE_CASES: SampleCase[] = [
  { id: 'c1', complaint: 'Dor torácica em aperto há 40 min', patient: 'Leito 4 · JMS', vertical: { label: 'Cardíaco', variant: 'purple' }, status: { label: 'Em revisão', variant: 'default' }, updated: 'há 12 min' },
  { id: 'c2', complaint: 'Síndrome gripal há 3 dias', patient: 'Leito 7 · ACR', vertical: { label: 'Geral', variant: 'gray' }, status: { label: 'Sem análise', variant: 'secondary' }, updated: 'há 25 min' },
  { id: 'c3', complaint: 'Febre e irritabilidade', patient: 'Box 2 · RPS', vertical: { label: 'Pediátrico', variant: 'pink' }, status: { label: 'Assinado', variant: 'success' }, updated: 'há 3 h' },
];

const SAMPLE_COLUMNS: DataTableColumn<SampleCase>[] = [
  {
    key: 'complaint',
    header: 'Queixa',
    cardLabel: null,
    cell: (c) => <span className="block text-left font-medium text-foreground">{c.complaint}</span>,
  },
  { key: 'patient', header: 'Paciente', cell: (c) => c.patient },
  { key: 'vertical', header: 'Vertical', cell: (c) => <Badge variant={c.vertical.variant}>{c.vertical.label}</Badge> },
  { key: 'status', header: 'Status', cell: (c) => <Badge variant={c.status.variant}>{c.status.label}</Badge> },
  { key: 'updated', header: 'Atualizado', hideOnMobile: true, className: 'text-muted-foreground', cell: (c) => c.updated },
];

export function DatabaseSection() {
  return (
    <ShowcaseSection
      id="database"
      title="Database"
      description="Tabela do Notion: linhas finas, cabeçalho cinza sem caixa-alta, linha inteira clicável. No mobile vira lista com divisórias."
    >
      <Specimen title="Barra de view + DataTable" bare>
        <Tabs defaultValue="todos" className="gap-0">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:border-b sm:border-border">
            <TabsList className="max-sm:w-full sm:border-b-0">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="revisao">Em revisão</TabsTrigger>
              <TabsTrigger value="assinados">Assinados</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5 sm:pb-1">
              <Input type="search" placeholder="Buscar" aria-label="Buscar casos" className="h-7 text-[0.8125rem] sm:w-48 md:text-[0.8125rem]" />
              <Button size="sm">
                <Plus />
                Novo
              </Button>
            </div>
          </div>
          <TabsContent value="todos" className="pt-3">
            <DataTable columns={SAMPLE_COLUMNS} rows={SAMPLE_CASES} getRowId={(c) => c.id} ariaLabel="Casos de exemplo" />
          </TabsContent>
          <TabsContent value="revisao" className="pt-3">
            <DataTable
              columns={SAMPLE_COLUMNS}
              rows={SAMPLE_CASES.filter((c) => c.status.label === 'Em revisão')}
              getRowId={(c) => c.id}
              ariaLabel="Casos em revisão"
            />
          </TabsContent>
          <TabsContent value="assinados" className="pt-3">
            <DataTable columns={SAMPLE_COLUMNS} rows={[]} getRowId={(c) => c.id} emptyTitle="Nenhum caso assinado hoje" emptyDescription="Casos confirmados aparecem aqui." />
          </TabsContent>
        </Tabs>
      </Specimen>
      <Specimen title="Carregando" bare>
        <DataTable columns={SAMPLE_COLUMNS} rows={[]} getRowId={(c) => c.id} loading loadingRows={2} />
      </Specimen>
    </ShowcaseSection>
  );
}

export function TabsSection() {
  return (
    <ShowcaseSection id="abas" title="Abas" description="Sublinhadas para views; segmentadas para alternâncias curtas.">
      <div className="grid gap-5 md:grid-cols-2">
        <Specimen title="default (sublinhada)">
          <Tabs defaultValue="analise">
            <TabsList>
              <TabsTrigger value="analise">Análise</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="analise" className="text-muted-foreground">Hipóteses e conduta sugerida.</TabsContent>
            <TabsContent value="documentos" className="text-muted-foreground">Prescrição, atestado, evolução.</TabsContent>
            <TabsContent value="historico" className="text-muted-foreground">Linha do tempo do caso.</TabsContent>
          </Tabs>
        </Specimen>
        <Specimen title="segmented">
          <Tabs defaultValue="voz">
            <TabsList variant="segmented">
              <TabsTrigger value="voz">
                <Microphone />
                Voz
              </TabsTrigger>
              <TabsTrigger value="texto">
                <PencilSimple />
                Texto
              </TabsTrigger>
            </TabsList>
            <TabsContent value="voz" className="text-muted-foreground">Ditado com transcrição ao vivo.</TabsContent>
            <TabsContent value="texto" className="text-muted-foreground">Digite ou cole o caso.</TabsContent>
          </Tabs>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}

export function MetricsSection() {
  return (
    <ShowcaseSection
      id="metricas"
      title="Métricas e progresso"
      description="StatCard em destaque azul só para a métrica que pede ação; StatStrip para o resto. ProgressSteps é a trilha Captura / Análise / Documento."
    >
      <Specimen title="StatCard / StatStrip" bare>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
            <StatCard label="Aguardando sua revisão" value={4} sublabel="casos no plantão" variant="highlight" />
            <StatStrip
              items={[
                { label: 'Casos hoje', value: 11 },
                { label: 'Rascunhos', value: 2 },
                { label: 'Confirmados', value: 8 },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard label="Documentos assinados" value={8} sublabel="cadeia de auditoria íntegra" variant="success" />
            <StatCard label="Tempo médio até conduta" value="6 min" sublabel="últimos 7 dias" />
          </div>
        </div>
      </Specimen>
      <Specimen title="ProgressSteps">
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((current) => (
            <ProgressSteps key={current} steps={['Captura', 'Análise', 'Documento']} currentStep={current} />
          ))}
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}

export function ChartPaperSection() {
  return (
    <ShowcaseSection
      id="papel"
      title="Chart paper"
      description="Folha de documento clínico (evolução, prescrição) com cabeçalho e rodapé de hash da auditoria."
    >
      <ChartPaper
        title="Evolução — Leito 4"
        metadata="Dra. Ana Souza · CRM-SP 123456 · 10/10/2026 09:16"
        headerSlot={
          <Badge variant="success">
            <SealCheck weight="fill" />
            Assinado
          </Badge>
        }
        hash="9f2a7c1e8b4d6f3a0c5e7b1d2f4a6c8e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a"
      >
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-foreground">
          <p>
            <span className="font-semibold">S:</span> Dor torácica em aperto há 40 minutos, irradiando para membro
            superior esquerdo, com sudorese.
          </p>
          <p>
            <span className="font-semibold">A:</span> Síndrome coronariana aguda até prova em contrário.
          </p>
          <p>
            <span className="font-semibold">P:</span> ECG seriado, troponina 0/1h, AAS 300 mg.
          </p>
        </div>
      </ChartPaper>
    </ShowcaseSection>
  );
}

export function OverlaysSection() {
  return (
    <ShowcaseSection
      id="sobreposicoes"
      title="Dialog, menu, sheet e tooltip"
      description="Popovers com a sombra em camadas do Notion, sem borda. Itens de menu de 28px."
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-4 sm:p-5">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Confirmar conduta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle variant="brand">Confirmar conduta clínica</DialogTitle>
              <DialogDescription>
                Você está confirmando a conduta &ldquo;Iniciar antibioticoterapia empírica e coletar lactato&rdquo;. Esta
                ação é registrada com hash de auditoria e assinatura do médico responsável.
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Ações do caso
              <DotsThree weight="bold" data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Leito 4 · JMS</DropdownMenuLabel>
            <DropdownMenuItem>
              <ClipboardText />
              Abrir caso
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash />
              Cancelar caso
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <BookOpen />
              Consultar diretriz
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Consulta de diretrizes</SheetTitle>
              <SheetDescription>Painel lateral para buscar na base sem sair do caso.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">Confiança: 82%</Button>
          </TooltipTrigger>
          <TooltipContent>Calculada a partir da concordância entre as diretrizes citadas.</TooltipContent>
        </Tooltip>
      </div>
      <Specimen title="Kbd" note="Atalhos do teclado na UI e no command palette.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> Buscar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>\</Kbd> Recolher sidebar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> Abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> Fechar
          </span>
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}

export function EmptyStateSection() {
  return (
    <ShowcaseSection id="vazio" title="Estado vazio" description="Ícone cinza, título, uma frase e uma ação.">
      <div className="rounded-lg border border-border">
        <EmptyState
          icon={<ClipboardText />}
          title="Nenhum atendimento encontrado"
          description="Os atendimentos que você criar aparecerão aqui."
          actionLabel="Novo atendimento"
          actionHref="/encounters/new"
        />
      </div>
    </ShowcaseSection>
  );
}
