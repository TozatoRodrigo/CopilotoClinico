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
import { UnderstandingCard } from '@/components/domain/understanding-card';
import type { CaseUnderstanding, CopilotRecommendation } from '@/lib/types';
import { RecommendationItem } from '@/components/domain/case-conversation/analysis-view';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';
import { ShowcaseSection, Specimen } from './showcase';

const GRIPAL_CASE = DEMO_CASE_PRESETS.find((preset) => preset.slug === 'sindrome-gripal');

/**
 * F1 — plano da decisão v2: agora (conhecimento geral, com a linha de "por
 * quê" da CC-601), depende (fonte web), dose sem fonte.
 */
const LAYERED_RECOMMENDATIONS: CopilotRecommendation[] = [
  {
    action: 'TC de crânio sem contraste imediata, com angio-TC de crânio e pescoço',
    rationale: 'Separa isquemia de hemorragia e mostra oclusão de grande vaso.',
    why: 'Só a tomografia separa sangramento de entupimento, e o tratamento de um piora o outro',
    citationChunkId: null,
    confidence: 0.9,
    preliminary: false,
    category: 'diagnostic',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    source: 'Conhecimento geral do modelo',
    sourceVersion: '',
    sourceText: '',
    sourceUrl: '',
    origin: 'model_knowledge',
  },
  {
    action: 'Trombólise com alteplase 0,9 mg/kg (máximo 90 mg)',
    rationale: 'AVC isquêmico dentro de 4,5 h, sem hemorragia na TC.',
    citationChunkId: 'web:1',
    confidence: 0.8,
    preliminary: true,
    preliminaryReason: 'depends_on_data',
    category: 'therapeutic',
    layer: 'depends',
    dependsOn: 'TC de crânio sem contraste sem hemorragia, dentro de 4,5 h',
    basis: 'source',
    source: 'Guidelines for the Early Management of Acute Ischemic Stroke',
    sourceVersion: 'ahajournals.org',
    sourceText: 'Alteplase 0.9 mg/kg within 4.5 hours.',
    sourceUrl: 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211',
    origin: 'web_official',
  },
  {
    action: 'Glicose 50% 40 mL IV se glicemia baixa',
    rationale: 'Hipoglicemia mimetiza AVC.',
    citationChunkId: null,
    confidence: 0.85,
    preliminary: true,
    preliminaryReason: 'unverified_dose',
    category: 'therapeutic',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    source: 'Conhecimento geral do modelo',
    sourceVersion: '',
    sourceText: '',
    sourceUrl: '',
    origin: 'model_knowledge',
  },
];

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

/** F1 — entendimento do caso de AVC sem TC (o caso que motivou a ADR-013). */
const STROKE_UNDERSTANDING: CaseUnderstanding = {
  problemRepresentation:
    'Homem de 68 anos, hipertenso, com hemiparesia direita e afasia de início súbito há 1h30, sem TC.',
  structuredData: {
    age: 68,
    sex: 'M',
    vitals: {
      systolicBp: 182,
      diastolicBp: 104,
      heartRate: 88,
      respiratoryRate: null,
      spo2: 96,
      temperature: null,
      glucose: null,
    },
    onset: 'há 1h30',
    keyFindings: ['hemiparesia direita', 'afasia'],
    relevantContext: ['hipertensão'],
  },
  instability: { present: false, findings: [] },
  syndrome: 'deficit-neurologico-focal',
  syndromeNote: null,
  cannotMiss: [
    {
      hypothesis: 'AVC isquêmico por oclusão de grande vaso',
      whyPlausible: 'Déficit cortical súbito dentro da janela de reperfusão.',
      confirmOrRuleOut: 'Angio-TC de crânio e pescoço.',
    },
    {
      hypothesis: 'Hemorragia intracerebral',
      whyPlausible: 'PA elevada e déficit súbito.',
      confirmOrRuleOut: 'TC de crânio sem contraste.',
    },
    {
      hypothesis: 'Hipoglicemia',
      whyPlausible: 'Mimetiza déficit focal agudo.',
      confirmOrRuleOut: 'Glicemia capilar.',
    },
  ],
  likely: [{ hypothesis: 'AVC isquêmico', why: 'Déficit focal súbito em idoso hipertenso.' }],
  missingDiscriminators: [
    {
      data: 'Resultado da TC de crânio sem contraste',
      separates: ['AVC isquêmico', 'AVC hemorrágico'],
      whyItChangesConduct: 'Trombólise só depois de excluir sangramento.',
    },
    {
      data: 'Glicemia capilar',
      separates: ['Hipoglicemia', 'AVC'],
      whyItChangesConduct: 'Hipoglicemia se corrige com glicose, sem trombólise.',
    },
  ],
  searchQueries: ['manejo inicial do AVC agudo'],
  timeCritical: true,
};

const UNSTABLE_UNDERSTANDING: CaseUnderstanding = {
  ...STROKE_UNDERSTANDING,
  problemRepresentation: 'Mulher de 34 anos com urticária, rouquidão e hipotensão após camarão.',
  structuredData: {
    ...STROKE_UNDERSTANDING.structuredData,
    age: 34,
    sex: 'F',
    vitals: {
      ...STROKE_UNDERSTANDING.structuredData.vitals,
      systolicBp: 84,
      diastolicBp: 50,
      heartRate: 128,
      spo2: 91,
    },
    onset: 'há 20 minutos',
    keyFindings: ['urticária difusa', 'rouquidão', 'sibilos'],
    relevantContext: [],
  },
  instability: { present: true, findings: ['PA 84x50', 'SpO₂ 91%', 'rouquidão'] },
  syndrome: 'reacao-alergica',
  cannotMiss: [
    {
      hypothesis: 'Anafilaxia com comprometimento de via aérea',
      whyPlausible: 'Pele, via aérea e hipotensão após exposição alimentar.',
      confirmOrRuleOut: 'Critério clínico; reavaliar via aérea a cada minuto.',
    },
  ],
  likely: [{ hypothesis: 'Anafilaxia alimentar', why: 'Exposição a camarão minutos antes.' }],
  missingDiscriminators: [],
};

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
            <SourceOriginBadge origin="curated_unsigned" />
            <SourceOriginBadge origin="physician_attachment" />
            <SourceOriginBadge origin="model_knowledge" />
            <SourceOriginBadge origin="web_official" domain="ahajournals.org" />
          </div>
        </div>
      </Specimen>

      <Specimen
        title="UnderstandingCard"
        note="“O que eu entendi” (ADR-013): antes do plano. Vermelho para ameaça imediata e o que não pode perder; laranja só no que falta saber, porque muda a conduta."
        bare
      >
        <div className="space-y-4">
          <UnderstandingCard
            understanding={STROKE_UNDERSTANDING}
            correction={{ onSubmit: async () => true, submitting: false }}
          />
          <UnderstandingCard
            understanding={UNSTABLE_UNDERSTANDING}
            footnote="Montando o plano a partir deste entendimento…"
          />
        </div>
      </Specimen>

      <Specimen
        title="RecommendationItem (decisão v2)"
        note="Conduta em duas camadas (ADR-013): o que depende diz de quê; a origem aparece como rótulo — conhecimento geral do modelo em azul, fonte oficial externa com link para a página."
        bare
      >
        <ul className="divide-y divide-border">
          {LAYERED_RECOMMENDATIONS.map((rec, index) => (
            <li key={rec.action}>
              <RecommendationItem
                rec={rec}
                index={index}
                footnote={rec.citationChunkId === null ? null : index + 1}
                decision={undefined}
                onAdopt={() => {}}
                onReject={() => {}}
                onNote={() => {}}
              />
            </li>
          ))}
        </ul>
      </Specimen>

      <Specimen title="BlockerQuestionCard" note="Pergunta que muda a conduta — laranja, com o porquê e a fonte." bare>
        <BlockerQuestionCard
          question="Paciente faz uso atual de imunossupressor?"
          separates="Separa: Indicação de oseltamivir × Sem indicação após 48 h"
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
