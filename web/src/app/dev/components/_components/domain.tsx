'use client';

import { Button } from '@/components/ui/button';
import { DecisionThread, type DecisionThreadItem } from '@/components/domain/decision-thread';
import { CitationFootnote, CitationFootnoteSkeleton } from '@/components/domain/citation-footnote';
import { BlockerQuestionCard } from '@/components/domain/blocker-question-card';
import { UncertaintyBanner } from '@/components/domain/uncertainty-banner';
import { CoverageBanner } from '@/components/domain/coverage-banner';
import { SourceOriginBadge } from '@/components/domain/source-origin-badge';
import { ConfirmedSeal } from '@/components/domain/confirmed-seal';
import { AuditHash } from '@/components/domain/audit-hash';
import { ConnectionStatus } from '@/components/domain/connection-status';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';
import { ShowcaseSection, Specimen } from './showcase';

const GRIPAL_CASE = DEMO_CASE_PRESETS.find((preset) => preset.slug === 'sindrome-gripal');

const DECISION_THREAD_ITEMS: DecisionThreadItem[] = [
  {
    id: '1',
    state: 'analysis',
    title: 'Análise inicial gerada',
    description: 'Síndrome gripal há 3 dias, sem sinais de SRAG.',
    timestamp: '09:12',
  },
  {
    id: '2',
    state: 'question',
    title: 'Pergunta enviada: uso de imunossupressor?',
    description: 'Resposta muda a indicação de antiviral após 48 horas.',
    timestamp: '09:13',
  },
  {
    id: '3',
    state: 'conduct',
    title: 'Conduta atualizada: iniciar oseltamivir',
    description: 'Paciente confirmado em grupo de risco (uso de imunossupressor).',
    timestamp: '09:15',
    current: true,
  },
  {
    id: '4',
    state: 'document',
    title: 'Documento gerado e assinado',
    timestamp: '09:16',
  },
];

export function DomainSection() {
  return (
    <ShowcaseSection
      id="dominio"
      title="Componentes clínicos"
      description={
        <>
          Componentes de domínio com o caso piloto &ldquo;{GRIPAL_CASE?.title ?? 'Síndrome gripal'}&rdquo;. A cor
          segue a semântica clínica: laranja pergunta/muda a conduta, verde confirma, vermelho é erro.
        </>
      }
    >
      <Specimen title="DecisionThread" note="Linha do tempo das decisões do caso — modo ativo, histórico, carregando e vazio.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Modo ativo</p>
            <DecisionThread items={DECISION_THREAD_ITEMS} mode="active" />
          </div>
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Modo histórico</p>
            <DecisionThread items={DECISION_THREAD_ITEMS} mode="history" />
          </div>
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Carregando</p>
            <DecisionThread items={[]} loading />
          </div>
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Vazio</p>
            <DecisionThread items={[]} />
          </div>
        </div>
      </Specimen>

      <Specimen title="CitationFootnote e origem da fonte" note="Toda recomendação cita a fonte e diz se ela foi revisada pela equipe clínica.">
        <div className="space-y-4">
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
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Carregando</p>
            <CitationFootnoteSkeleton />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <SourceOriginBadge origin="public" />
            <SourceOriginBadge origin="institutional" />
            <SourceOriginBadge origin="official_unreviewed" />
            <SourceOriginBadge origin="physician_attachment" />
          </div>
        </div>
      </Specimen>

      <Specimen title="BlockerQuestionCard" note="Pergunta que muda a conduta — laranja, com o porquê e a fonte." bare>
        <BlockerQuestionCard
          question="Paciente faz uso atual de imunossupressor?"
          why="A resposta muda a indicação de antiviral: pacientes em grupo de risco mantêm indicação de oseltamivir mesmo após 48 horas do início dos sintomas."
          citation={{
            source: 'Diretriz Influenza',
            sourceVersion: '3',
            origin: 'public',
          }}
        >
          <div role="group" aria-label="Paciente faz uso atual de imunossupressor?" className="flex flex-wrap gap-2">
            <Button type="button" size="lg">
              Sim
            </Button>
            <Button type="button" variant="outline" size="lg">
              Não
            </Button>
            <Button type="button" variant="outline" size="lg">
              Não sei
            </Button>
          </div>
        </BlockerQuestionCard>
      </Specimen>

      <Specimen title="UncertaintyBanner e CoverageBanner" note="Incerteza fala do raciocínio; cobertura fala do que a base contém." bare>
        <div className="space-y-2.5">
          <UncertaintyBanner reason="Faltam dados sobre uso de imunossupressor para confirmar grupo de risco e indicação de antiviral." />
          <UncertaintyBanner />
          <CoverageBanner coverage="partial" />
          <CoverageBanner coverage="none" />
        </div>
      </Specimen>

      <Specimen title="ConfirmedSeal" note="Selo de conduta assinada, pendente e com erro." bare>
        <div className="space-y-2.5">
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
      </Specimen>

      <div className="grid gap-5 md:grid-cols-2">
        <Specimen title="AuditHash">
          <div className="flex flex-wrap items-center gap-3">
            <AuditHash hash="9f2a7c1e8b4d6f3a0c5e7b1d2f4a6c8e" href="/audit" />
            <AuditHash status="loading" />
            <AuditHash status="error" />
          </div>
        </Specimen>
        <Specimen title="ConnectionStatus">
          <div className="flex flex-wrap items-center gap-3">
            <ConnectionStatus status="online" />
            <ConnectionStatus status="offline" />
            <ConnectionStatus status="syncing" />
          </div>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}
