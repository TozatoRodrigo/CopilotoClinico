'use client';

import { useState } from 'react';
import { useGenerateDocument, useEncounterDetail } from '@/lib/clinical-queries';
import { QuickConsultBanner } from '@/components/domain/quick-consult-banner';
import {
  useRecommendationDecisions,
  type DecisionsSyncStatus,
  type RecommendationDecisionState,
} from '@/hooks/use-recommendation-decisions';
import { DOCUMENT_TYPES } from '@/lib/document-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { UncertaintyBanner } from '@/components/domain/uncertainty-banner';
import { CoverageBanner } from '@/components/domain/coverage-banner';
import { CopilotFeedback } from '@/components/domain/copilot-feedback';
import {
  UnderstandingCard,
  type UnderstandingCorrection,
} from '@/components/domain/understanding-card';
import { CitationFootnote } from '@/components/domain/citation-footnote';
import { GuidelineConsultSheet } from '@/components/domain/guideline-consult';
import { SourceOriginBadge, isUnreviewedOrigin } from '@/components/domain/source-origin-badge';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  BookOpen,
  Books,
  Check,
  CheckCircle,
  CircleNotch,
  CloudSlash,
  Eye,
  Hourglass,
  FileText,
  Info,
  Lightning,
  ListChecks,
  LockSimple,
  PencilSimple,
  PhoneCall,
  SealCheck,
  Siren,
  Sparkle,
  Warning,
  WarningCircle,
  WarningOctagon,
  X,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import type {
  Citation,
  ConversationTurn,
  CopilotAnalysis,
  CopilotRecommendation,
  DocumentType,
  PreliminaryReason,
  RecommendationLayer,
  RedFlagSeverity,
} from '@/lib/types';

// UX — 3 baldes fixos do redesign (Redesign.dc.html): AGORA (estabilização
// imediata), EM SEGUIDA (conduta terapêutica) e SE PIORAR (o que observar /
// diagnóstico de acompanhamento). "diagnostic"/"verify" e qualquer categoria
// não mapeada caem em SE PIORAR — mesmo comportamento de fallback que a
// railFor() anterior já tinha para category desconhecida.
type Bucket = 'now' | 'next' | 'watch';

const BUCKET_DEFS: Record<Bucket, { label: string; hint: string; icon: Icon }> = {
  now: { label: 'Agora', hint: 'primeiros 10 minutos', icon: Lightning },
  next: { label: 'Em seguida', hint: 'confirma e encaminha', icon: ArrowRight },
  watch: { label: 'Se piorar', hint: 'o que observar e quando pedir ajuda', icon: Eye },
};

function bucketFor(category?: string): Bucket {
  if (category === 'stabilization') return 'now';
  if (category === 'therapeutic') return 'next';
  return 'watch';
}

/**
 * F1 — decisão v2 (ADR-013): o plano se divide pela camada, não pela
 * categoria — "Fazer agora" é seguro em toda hipótese aberta; "Depende de…"
 * espera o dado que decide. Análises v1 e antigas não têm camada e continuam
 * nos três baldes de sempre.
 */
const LAYER_ICONS: Record<RecommendationLayer, Icon> = { now: Lightning, depends: Hourglass };
const LAYERS: readonly RecommendationLayer[] = ['now', 'depends'];

function isLayeredPlan(recommendations: CopilotRecommendation[]): boolean {
  return recommendations.some((rec) => rec.layer !== undefined);
}

interface PlanGroup {
  key: string;
  label: string;
  hint: string;
  icon: Icon;
  items: { rec: CopilotRecommendation; index: number }[];
}

export function planGroups(recommendations: CopilotRecommendation[], messages: Messages): PlanGroup[] {
  const indexed = recommendations.map((rec, index) => ({ rec, index }));
  if (isLayeredPlan(recommendations)) {
    return LAYERS.map((layer) => ({
      key: layer,
      ...messages.recommendation.layers[layer],
      icon: LAYER_ICONS[layer],
      // Inalcançável na v2 (o schema exige a camada); na dúvida, esperar o dado.
      items: indexed.filter(({ rec }) => (rec.layer ?? 'depends') === layer),
    }));
  }
  return (['now', 'next', 'watch'] as const).map((key) => ({
    key,
    ...BUCKET_DEFS[key],
    items: indexed.filter(({ rec }) => bucketFor(rec.category) === key),
  }));
}

/** No celular a coluna de rótulos encolhe para sobrar espaço às tags. */
const PROPERTY_ROW = 'max-sm:grid-cols-[8.5rem_1fr]';

const SEVERITY_RANK: Record<RedFlagSeverity, number> = { critical: 3, high: 2, moderate: 1 };

/**
 * Tag de red flag: cor clínica fixa (vermelho = crítico, laranja = muda a
 * conduta, cinza = moderado) + ícone de forma diferente por severidade e o
 * rótulo da severidade para leitor de tela — nunca só a cor.
 */
const RED_FLAG_TAG: Record<
  RedFlagSeverity,
  { variant: 'destructive' | 'warning' | 'secondary'; icon: Icon }
> = {
  critical: { variant: 'destructive', icon: WarningOctagon },
  high: { variant: 'warning', icon: Warning },
  moderate: { variant: 'secondary', icon: Info },
};

/**
 * F0-C — tom da tag "Preliminar" pelo motivo. Laranja só quando um dado ainda
 * pode MUDAR A CONDUTA (perguntas em aberto, subtipo indefinido). Fonte não
 * revisada por médico é informação, não mudança de conduta: cinza.
 */
const PRELIMINARY_TONE: Record<
  PreliminaryReason,
  { variant: 'warning' | 'secondary'; markerClassName: string }
> = {
  pending_questions: { variant: 'warning', markerClassName: 'text-tone-orange' },
  subtype_ambiguity: { variant: 'warning', markerClassName: 'text-tone-orange' },
  unreviewed_source: { variant: 'secondary', markerClassName: 'text-muted-foreground' },
  // F1 — o dado que falta muda a conduta; dose sem fonte precisa ser
  // conferida antes de seguir: os dois em laranja.
  depends_on_data: { variant: 'warning', markerClassName: 'text-tone-orange' },
  unverified_dose: { variant: 'warning', markerClassName: 'text-tone-orange' },
  // Verificação com fonte: a fonte oficial diverge da conduta — pode mudá-la.
  source_conflict: { variant: 'warning', markerClassName: 'text-tone-orange' },
};

/**
 * Análises gravadas antes do campo não têm `preliminaryReason`: o preliminar
 * delas era sempre o declarado pelo modelo, o rótulo de sempre.
 */
function preliminaryReasonOf(rec: CopilotRecommendation): PreliminaryReason | null {
  if (!rec.preliminary) return null;
  return rec.preliminaryReason ?? 'pending_questions';
}

function preliminaryLabel(reason: PreliminaryReason, messages: Messages): string {
  const badge = messages.recommendation.preliminaryBadge;
  if (reason === 'pending_questions') return badge;
  return `${badge} · ${messages.recommendation.preliminaryReason[reason]}`;
}

interface Footnote {
  key: string;
  number: number;
  rec: CopilotRecommendation;
  citation: Citation | undefined;
}

interface AnalysisViewProps {
  encounterId: string;
  turn: ConversationTurn;
  maxTurns: number;
  /**
   * A rodada mais recente da conversa: só ela gera documento, recebe
   * feedback e corrige o entendimento. Rodadas anteriores ficam para leitura.
   */
  current: boolean;
  /** Pergunta do Copiloto que muda a conduta ainda sem resposta — avisa antes do documento. */
  hasPendingQuestion: boolean;
  correction?: UnderstandingCorrection;
}

/**
 * O plano de uma rodada da conversa do caso (ADR-014): hipótese, "O que eu
 * entendi", plano por camada, raciocínio, fontes, feedback e documentos. As
 * perguntas do Copiloto não ficam aqui: a conversa as faz uma por vez,
 * abaixo do plano.
 */
export function AnalysisView({
  encounterId,
  turn,
  maxTurns,
  current,
  hasPendingQuestion,
  correction,
}: AnalysisViewProps) {
  const messages = useMessages();
  const analysis: CopilotAnalysis = {
    ...turn.output,
    citations: turn.citations,
    uncertainty: turn.uncertainty,
    uncertaintyReason: turn.uncertaintyReason,
  };
  const { interactionId, turnIndex, retrievalCoverage } = turn;
  const { decisions, setDecision, setNote, syncStatus, retryPending } = useRecommendationDecisions(
    encounterId,
    interactionId,
    analysis.recommendations.length,
  );
  const generateDocument = useGenerateDocument(encounterId);
  // S25-QC-02 — precisa saber se o caso está identificado para
  // desabilitar/explicar os botões de gerar documento (o backend já
  // bloqueia isto de qualquer forma — ver documents.service.ts — mas
  // avisar antes de deixar o médico clicar é melhor do que um erro depois).
  const encounterQuery = useEncounterDetail(encounterId);
  const isQuickConsult = encounterQuery.data?.patientRef === null;
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  // Consulta de diretrizes dentro do caso (painel lateral) — ver
  // guideline-consult.tsx. Nunca navegar para fora da conversa.
  const [consultOpen, setConsultOpen] = useState(false);
  const openConsult = () => setConsultOpen(true);

  async function handleGenerateDocument(type: DocumentType) {
    if (isQuickConsult) return;
    setGeneratingDoc(type);
    setDocError(null);

    try {
      const doc = await generateDocument.mutateAsync({ type, aiInteractionId: interactionId });
      window.open(
        `/encounters/${encounterId}/documents/${doc.id}/edit`,
        '_blank',
        'noopener,noreferrer',
      );
      const { toast } = await import('sonner');
      toast.success(messages.documents.generated(type));
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.documents.errorGenerate;
      setDocError(message);
    } finally {
      setGeneratingDoc(null);
    }
  }

  const recommendations = analysis.recommendations;
  const layered = isLayeredPlan(recommendations);
  const definitiveCount = recommendations.filter((r) => !r.preliminary).length;
  const preliminaryCount = recommendations.length - definitiveCount;
  const dependsCount = recommendations.filter((r) => r.layer === 'depends').length;
  // F1 — fontes citadas: conhecimento geral do modelo não tem trecho.
  const sourcedRecommendations = recommendations.filter(
    (rec): rec is CopilotRecommendation & { citationChunkId: string } =>
      rec.citationChunkId !== null,
  );

  // Red flags da mais grave para a menos grave: a urgência real do caso é a
  // primeira coisa lida nas propriedades (cor com significado fixo, nunca
  // decorativa).
  const redFlags = [...analysis.redFlags].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
  const topHypothesis = analysis.differentials[0]?.hypothesis;
  const otherDifferentials = analysis.differentials.slice(1);
  const hasCannotMiss = otherDifferentials.some((d) => d.cannotMiss);

  const groups = planGroups(recommendations, messages);

  // Notas de rodapé na ordem de leitura do plano; recomendações que citam o
  // mesmo trecho compartilham o número (como num artigo). F1 — conhecimento
  // geral do modelo não tem fonte: fica sem nota. O prefixo da rodada evita
  // âncoras repetidas quando a conversa mostra mais de um plano.
  const anchor = (number: number) => `fonte-${turnIndex + 1}-${number}`;
  const footnotes: Footnote[] = [];
  const footnoteByRec = new Map<number, number>();
  for (const { rec, index } of groups.flatMap((group) => group.items)) {
    if (rec.citationChunkId === null) continue;
    const key = rec.citationChunkId || `${rec.source}@${rec.sourceVersion}`;
    let footnote = footnotes.find((f) => f.key === key);
    if (!footnote) {
      footnote = {
        key,
        number: footnotes.length + 1,
        rec,
        citation: analysis.citations.find((c) => c.chunkId === rec.citationChunkId),
      };
      footnotes.push(footnote);
    }
    footnoteByRec.set(index, footnote.number);
  }

  return (
    <article className="flex flex-col gap-8" aria-label={messages.copilot.progress.round(turnIndex + 1, maxTurns)}>
      <PageHeader
        size="compact"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Sparkle className="size-3.5 text-primary" weight="fill" aria-hidden="true" />
            Hipótese principal do copiloto
          </span>
        }
        title={topHypothesis ?? 'Avaliação clínica em andamento'}
        actions={
          current ? (
            <Button type="button" size="sm" variant="outline" onClick={openConsult}>
              <BookOpen weight="duotone" />
              Consultar diretrizes
            </Button>
          ) : undefined
        }
        properties={
          <PropertyList>
            <PropertyRow icon={Siren} label={messages.redFlags.heading} className={PROPERTY_ROW}>
              {redFlags.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {redFlags.map((flag, i) => (
                    <li key={`${flag.finding}-${i}`}>
                      <RedFlagTag
                        finding={flag.finding}
                        severity={flag.severity}
                        messages={messages}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">Nenhum identificado</span>
              )}
            </PropertyRow>
            <PropertyRow icon={ListChecks} label="Plano" className={PROPERTY_ROW}>
              <span>
                {messages.copilot.result.recommendationsCount(recommendations.length)}
                <span className="text-muted-foreground">
                  {' · '}
                  {layered
                    ? messages.copilot.result.layersSummary(
                        recommendations.length - dependsCount,
                        dependsCount,
                      )
                    : messages.copilot.result.preliminarySummary(definitiveCount, preliminaryCount)}
                </span>
              </span>
            </PropertyRow>
            {footnotes.length > 0 && (
              <PropertyRow icon={Books} label="Fontes" className={PROPERTY_ROW}>
                <a
                  href={`#${anchor(0)}`}
                  className="rounded-sm underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                >
                  {footnotes.length} {footnotes.length === 1 ? 'fonte citada' : 'fontes citadas'}
                </a>
              </PropertyRow>
            )}
            <PropertyRow icon={ArrowsClockwise} label="Análise" className={PROPERTY_ROW}>
              {messages.copilot.progress.round(turnIndex + 1, maxTurns)}
            </PropertyRow>
          </PropertyList>
        }
      />

      {current && (
        <GuidelineConsultSheet
          open={consultOpen}
          onOpenChange={setConsultOpen}
          caseText={turn.caseText ?? encounterQuery.data?.chiefComplaint ?? null}
          citedChunkIds={sourcedRecommendations.map((rec) => rec.citationChunkId)}
          citedSources={sourcedRecommendations.map((rec) => rec.source)}
        />
      )}

      {/* F1 — "O que eu entendi" (ADR-013): antes do plano, para o médico
          conferir o entendimento do caso e corrigi-lo. Some no legacy e nas
          análises antigas, que não têm entendimento. */}
      <UnderstandingCard understanding={analysis.understanding} correction={correction} />

      {/* O que fazer: plano em camadas, cada recomendação como uma linha de
          decisão (adotar / rejeitar / anotar). Os avisos de cobertura e
          incerteza qualificam o plano — ficam logo acima dele. */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Plano sugerido"
          count={recommendations.length}
          description="Decida cada conduta — adotar, rejeitar ou anotar. O número sobrescrito leva à fonte."
        />

        <DecisionsSyncNote status={syncStatus} onRetry={retryPending} />

        <CoverageBanner coverage={retrievalCoverage} onSearchGuidelines={openConsult} />

        {analysis.uncertainty && (
          <UncertaintyBanner reason={analysis.uncertaintyReason} onSearchGuidelines={openConsult} />
        )}

        {recommendations.length === 0 ? (
          <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
            Nenhuma conduta sugerida nesta rodada — responda as perguntas abaixo ou consulte as
            diretrizes.
          </p>
        ) : (
          groups.map((group) => {
            if (group.items.length === 0) return null;
            const GroupIcon = group.icon;
            return (
              <div key={group.key} className="flex flex-col">
                <h3 className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1.5 text-sm font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5 self-center">
                    <GroupIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {group.label}
                  </span>
                  <span className="text-[0.8125rem] font-normal text-muted-foreground">
                    {group.hint}
                  </span>
                </h3>
                <ul className="divide-y divide-border">
                  {group.items.map(({ rec, index }) => {
                    const recId = String(index);
                    const footnote = rec.citationChunkId === null ? null : footnoteByRec.get(index);
                    return (
                      <li key={recId}>
                        <RecommendationItem
                          rec={rec}
                          index={index}
                          footnote={footnote}
                          footnoteHref={footnote ? `#${anchor(footnote)}` : undefined}
                          decision={decisions[recId]}
                          onAdopt={() => setDecision(recId, 'adopted')}
                          onReject={() => setDecision(recId, 'rejected')}
                          onNote={(note) => setNote(recId, note)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {/* Evidência: raciocínio e diferenciais em toggles, fontes como notas
          de rodapé numeradas (os sobrescritos do plano apontam aqui). */}
      <section className="flex flex-col gap-1">
        <SectionHeader title="Raciocínio" className="mb-1" />
        <Disclosure title="Por que o copiloto chegou a esta hipótese">
          <p className="text-[0.9375rem] leading-relaxed text-pretty text-foreground">
            {analysis.reasoning}
          </p>
        </Disclosure>
        {otherDifferentials.length > 0 && (
          <Disclosure
            title={messages.copilot.differentials.heading}
            meta={`${otherDifferentials.length} ${otherDifferentials.length === 1 ? 'hipótese' : 'hipóteses'}`}
            defaultOpen={hasCannotMiss}
          >
            <ul className="flex flex-col gap-3 pt-1">
              {otherDifferentials.map((d, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold text-foreground">{d.hypothesis}</p>
                    {/* PI-03 — "não pode perder": mesmo critério de um red
                        flag crítico, por isso a tag vermelha. */}
                    {d.cannotMiss && (
                      <Badge variant="destructive">
                        <WarningOctagon weight="fill" aria-hidden="true" />
                        {messages.copilot.differentials.cannotMiss}
                        {d.timeToHarm ? ` · dano em ${d.timeToHarm}` : ''}
                      </Badge>
                    )}
                  </div>
                  {d.whatDistinguishes && (
                    <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                      <span className="text-foreground">
                        {messages.copilot.differentials.whatDistinguishes}
                      </span>{' '}
                      {d.whatDistinguishes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </section>

      {footnotes.length > 0 && (
        <section id={anchor(0)} className="flex scroll-mt-16 flex-col gap-3">
          <SectionHeader
            title="Fontes"
            count={footnotes.length}
            description="Toda recomendação cita a fonte; a tag diz de onde ela veio e se passou pela equipe clínica."
          />
          <ol className="flex flex-col gap-4">
            {footnotes.map((footnote) => (
              <li key={footnote.key}>
                <CitationFootnote
                  id={anchor(footnote.number)}
                  number={footnote.number}
                  source={footnote.citation?.source ?? footnote.rec.source}
                  sourceVersion={footnote.citation?.sourceVersion ?? footnote.rec.sourceVersion}
                  text={footnote.citation?.text ?? footnote.rec.sourceText}
                  origin={footnote.citation?.origin ?? footnote.rec.origin}
                  evidenceFigure={footnote.citation?.evidenceFigure}
                  evidenceTable={footnote.citation?.evidenceTable}
                  href={footnote.rec.sourceUrl || undefined}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {current && (
        <>
          {/* F7 — o reporte de erro clínico nasce aqui, com o interactionId e
              os chunks recuperados anexados pelo backend. */}
          <CopilotFeedback
            encounterId={encounterId}
            interactionId={interactionId}
            className="border-t border-border pt-4"
          />

          {/* Próximo passo: documento. */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={messages.documents.generateHeading}
              description="Abre em nova aba para você revisar, editar e assinar."
            />
            {hasPendingQuestion && (
              <Callout tone="orange" icon={<WarningCircle weight="fill" />}>
                Há uma pergunta que muda a conduta ainda sem resposta — o documento gerado agora
                não vai refletir essa informação.
              </Callout>
            )}
            {/* S25-QC-02 — gerar documento formal exige paciente
                identificado; o backend (documents.service.ts) já recusa isto
                de qualquer forma — desabilitar aqui evita o médico clicar
                para só então descobrir pelo erro. */}
            {isQuickConsult && (
              <QuickConsultBanner
                encounterId={encounterId}
                description="Identifique o paciente para gerar SOAP, SBAR, prescrição, atestado ou alta."
                successMessage="Paciente identificado — já pode gerar os documentos deste caso."
              />
            )}
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_TYPES.map((dt) => {
                const isThisGenerating = generatingDoc === dt.type;
                // Com pergunta que muda a conduta em aberto, o SOAP deixa de
                // ser a ação azul: o plano ainda pode mudar.
                const isPrimary = dt.primary && !hasPendingQuestion && !isThisGenerating;
                return (
                  <Button
                    key={dt.type}
                    onClick={() => handleGenerateDocument(dt.type)}
                    disabled={isThisGenerating || isQuickConsult}
                    variant={isPrimary ? 'default' : 'outline'}
                  >
                    {isThisGenerating ? <CircleNotch className="animate-spin" /> : <FileText />}
                    {isThisGenerating ? messages.documents.generating : dt.label}
                  </Button>
                );
              })}
            </div>
            {docError && (
              <Alert variant="destructive">
                <WarningCircle weight="fill" />
                <AlertTitle>{messages.documents.errorTitle}</AlertTitle>
                <AlertDescription>{docError}</AlertDescription>
              </Alert>
            )}

            {/* S25-QC-02 — segunda opinião pressupõe um caso rastreável para o
                handoff; sem identificação o bloco some. */}
            {!isQuickConsult && (
              <div className="mt-2 flex flex-col gap-3 rounded-md bg-tone-gray-bg px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <PhoneCall
                    className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-semibold text-foreground">Quer segunda opinião?</p>
                    <p className="text-pretty text-muted-foreground">
                      Manda o resumo SBAR pronto para o plantonista sênior ou para a hemodinâmica.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 max-sm:ml-[30px] max-sm:h-10 max-sm:self-start"
                  onClick={() => handleGenerateDocument('sbar')}
                  disabled={generatingDoc === 'sbar'}
                >
                  {generatingDoc === 'sbar' ? (
                    <CircleNotch className="animate-spin" />
                  ) : (
                    <FileText />
                  )}
                  Gerar SBAR
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </article>
  );
}

/**
 * F0-D — as decisões vão para o servidor; quando a rede falha ficam neste
 * dispositivo e são reenviadas. O médico precisa saber que ainda não subiram.
 */
function DecisionsSyncNote({
  status,
  onRetry,
}: {
  status: DecisionsSyncStatus;
  onRetry: () => void;
}) {
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {status === 'saving' && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
          Salvando decisões…
        </p>
      )}
      {status === 'offline' && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
          <CloudSlash className="size-4 shrink-0 text-tone-orange" aria-hidden="true" />
          Sem conexão — as decisões ficaram neste dispositivo e serão enviadas quando a conexão
          voltar.
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onRetry}>
            Tentar agora
          </Button>
        </p>
      )}
    </div>
  );
}

function RedFlagTag({
  finding,
  severity,
  messages,
}: {
  finding: string;
  severity: RedFlagSeverity;
  messages: Messages;
}) {
  const { variant, icon: SeverityIcon } = RED_FLAG_TAG[severity];
  const severityLabel = messages.redFlags.severity[severity];
  return (
    <Badge
      variant={variant}
      title={`${severityLabel}: ${finding}`}
      className="h-auto min-h-5 max-w-full py-0.5 whitespace-normal text-left leading-snug"
    >
      <SeverityIcon weight="fill" aria-hidden="true" />
      <span className="sr-only">{severityLabel}: </span>
      {finding}
    </Badge>
  );
}

/**
 * UX-09 — bug relatado ao vivo por um médico do piloto: só "Adotar"
 * funcionava. "Rejeitar" na verdade chamava setDecision('rejected')
 * corretamente, mas a UI não dava NENHUM feedback visual (sem badge, sem
 * diferença nos botões) — parecia não ter feito nada. "Anotar" não tinha
 * onClick nenhum — não fazia literalmente nada, apesar do hook
 * useRecommendationDecisions já suportar setNote() de ponta a ponta.
 * Extraído em componente próprio (em vez de inline no .map()) porque cada
 * item precisa do seu próprio estado local de "nota está expandida" — não
 * dá para usar useState dentro de um .map() do componente pai.
 *
 * Visual: linha de to-do do Notion — marcador de estado à esquerda, ação em
 * destaque com a nota de rodapé sobrescrita, justificativa em cinza e os
 * controles de decisão discretos embaixo.
 */
export function RecommendationItem({
  rec,
  index,
  footnote = index + 1,
  footnoteHref = footnote === null ? undefined : `#fonte-${footnote}`,
  decision,
  onAdopt,
  onReject,
  onNote,
}: {
  rec: CopilotRecommendation;
  index: number;
  /**
   * Número da nota de rodapé da fonte (compartilhado entre recomendações da
   * mesma fonte). `null`: conhecimento geral do modelo, sem fonte (F1).
   */
  footnote?: number | null;
  /** Âncora da nota de rodapé; a conversa prefixa com a rodada. */
  footnoteHref?: string;
  decision: RecommendationDecisionState | undefined;
  onAdopt: () => void;
  onReject: () => void;
  onNote: (note: string) => void;
}) {
  const messages = useMessages();
  const [showNote, setShowNote] = useState(false);
  // F0-D — `modified` é adoção com ajuste (Adotar + nota): mesma aparência de
  // adotada, com o rótulo dizendo que houve ajuste.
  const isModified = decision?.decision === 'modified';
  const isAdopted = decision?.decision === 'adopted' || isModified;
  const isRejected = decision?.decision === 'rejected';
  const preliminaryReason = preliminaryReasonOf(rec);
  // F1 — "Depende de: <dado>" diz mais que a tag "Preliminar · depende de
  // dado"; a tag fica para os outros motivos.
  const waitsForData = rec.layer === 'depends';
  const showPreliminaryBadge =
    preliminaryReason !== null && !(waitsForData && preliminaryReason === 'depends_on_data');
  const isModelKnowledge = rec.origin === 'model_knowledge';

  return (
    <div className="flex gap-3 py-3">
      <span aria-hidden="true" className="flex h-6 w-[18px] shrink-0 items-center justify-center">
        {isAdopted ? (
          <CheckCircle className="size-[18px] text-tone-green" weight="fill" />
        ) : isRejected ? (
          <XCircle className="size-[18px] text-muted-foreground" weight="fill" />
        ) : preliminaryReason ? (
          <LockSimple
            className={cn('size-4', PRELIMINARY_TONE[preliminaryReason].markerClassName)}
            weight="fill"
          />
        ) : (
          <span className="size-1.5 rounded-full bg-foreground/45" />
        )}
      </span>

      <div className={cn('min-w-0 flex-1', isRejected && 'opacity-70')}>
        <h4
          className={cn(
            'text-[0.9375rem] leading-6 font-medium text-pretty text-foreground',
            isRejected && 'text-muted-foreground line-through',
          )}
        >
          {rec.action}
          {footnote !== null && (
            <sup className="ml-0.5">
              <a
                href={footnoteHref}
                aria-label={`Fonte ${footnote}: ${rec.source}`}
                className="rounded-sm px-0.5 text-[0.6875rem] font-medium text-link no-underline hover:bg-hover"
              >
                {footnote}
              </a>
            </sup>
          )}
        </h4>

        <p className="mt-0.5 text-sm leading-relaxed text-pretty text-muted-foreground">
          {rec.rationale}
        </p>

        {waitsForData && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] font-medium text-tone-orange-ink">
            <Hourglass className="mt-0.5 size-3.5 shrink-0 text-tone-orange" weight="fill" aria-hidden="true" />
            {rec.dependsOn
              ? messages.recommendation.dependsOn(rec.dependsOn)
              : messages.recommendation.dependsOnMissing}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showPreliminaryBadge && preliminaryReason && (
            <Badge
              variant={PRELIMINARY_TONE[preliminaryReason].variant}
              className="h-auto min-h-5 max-w-full py-0.5 whitespace-normal text-left leading-snug"
            >
              <LockSimple weight="fill" aria-hidden="true" />
              {preliminaryLabel(preliminaryReason, messages)}
            </Badge>
          )}
          {isAdopted && (
            <Badge variant="success">
              <SealCheck weight="fill" aria-hidden="true" />
              {isModified ? 'Adotada com ajuste' : 'Adotada'}
            </Badge>
          )}
          {isRejected && (
            <Badge variant="secondary">
              <XCircle weight="fill" aria-hidden="true" />
              Rejeitada
            </Badge>
          )}
          {!isModelKnowledge && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{rec.source}</span>
            </span>
          )}
        </div>

        {/* F4 / ADR-010 / ADR-012 — fonte que nenhum médico assinou: diz de
            onde veio e, no caso da base oficial, leva ao PDF do Ministério. */}
        {isUnreviewedOrigin(rec.origin) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <SourceOriginBadge
              origin={rec.origin}
              domain={rec.origin === 'web_official' ? rec.sourceVersion : undefined}
            />
            {/* F1 — página da fonte oficial externa, em nova aba. */}
            {rec.origin === 'web_official' && rec.sourceUrl && (
              <a
                href={rec.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
              >
                {messages.recommendation.openSourcePage}
                <ArrowSquareOut className="size-3.5" aria-hidden="true" />
              </a>
            )}
            {rec.origin === 'official_unreviewed' && (
              <>
                <span className="min-w-0 truncate">{rec.sourceVersion}</span>
                {rec.sourceUrl && (
                  <a
                    href={rec.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link underline-offset-4 hover:underline"
                  >
                    Ver documento oficial
                  </a>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            aria-pressed={isAdopted}
            onClick={onAdopt}
            className={cn(
              'max-sm:h-10',
              isAdopted && 'border-transparent bg-tone-green-tag text-tone-green-ink hover:bg-tone-green-tag',
            )}
          >
            <Check weight="bold" />
            Adotar
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={isRejected}
            onClick={onReject}
            className={cn('max-sm:h-10', isRejected && 'border-transparent bg-active hover:bg-active')}
          >
            <X weight="bold" />
            Rejeitar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground max-sm:h-10"
            aria-expanded={showNote}
            onClick={() => setShowNote((s) => !s)}
          >
            <PencilSimple />
            {decision?.note ? 'Editar nota' : 'Anotar'}
          </Button>
        </div>

        {showNote && (
          <Textarea
            aria-label={`Anotação para: ${rec.action}`}
            value={decision?.note ?? ''}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Observação clínica sobre esta recomendação..."
            className="mt-2 min-h-[60px] resize-y text-sm"
            rows={2}
          />
        )}
        {decision?.note && !showNote && (
          <p className="mt-2 border-l-[3px] border-foreground/15 pl-3 text-[0.8125rem] text-muted-foreground italic">
            &ldquo;{decision.note}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

