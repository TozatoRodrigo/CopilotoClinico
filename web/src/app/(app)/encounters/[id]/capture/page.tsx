'use client';

import { use, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useEncounterDetail } from '@/lib/clinical-queries';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Callout } from '@/components/ui/callout';
import { Kbd } from '@/components/ui/kbd';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { RecordingWaveform } from '@/components/ui/recording-waveform';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useWhisperVoice, type WhisperVoiceHook } from '@/hooks/use-whisper-voice';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { addToQueue } from '@/lib/offline-queue';
import { syncOfflineQueue } from '@/lib/copilot-queue';
import {
  STORAGE_KEY_PREFIX,
  type StoredCopilotResult,
} from '@/hooks/use-copilot-conversation';
import { EncounterAttachments } from '@/components/domain/encounter-attachments';
import { useCopilotStream, isStreamEligible } from '@/hooks/use-copilot-stream';
import { UnderstandingCard } from '@/components/domain/understanding-card';
import { markFirstAnalysisDone } from '@/components/domain/install-prompt-banner';
import {
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Flask,
  Hospital,
  Info,
  Microphone,
  MicrophoneSlash,
  Plus,
  ShieldCheck,
  Siren,
  Sparkle,
  Spinner,
  Stop,
  Warning,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { CopilotAnalysis, CopilotAnalyzeResponse, EncounterContext } from '@/lib/types';
import { getDemoCasePreset } from '@/lib/demo-case-presets';
import { useMessages } from '@/lib/messages/use-messages';
import type { Messages } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * S23-CLIN-04 — Severidade clínica dos chips de red flag.
 *
 * Alinhada com output-validator.ts (severity: critical | high | moderate):
 * - critical: muda drasticamente a conduta (imunossuprimido, gestante,
 *   anticoagulante) — tag vermelha com ícone
 * - warning: requer atenção especial (pediátrico, idoso) — tag laranja
 * - info: alerta adicional (alergia) — tag azul
 */
type RedFlagSeverity = 'critical' | 'warning' | 'info';

interface ChipDef {
  key: string;
  label: string;
}

interface RedFlagChipDef extends ChipDef {
  severity: RedFlagSeverity;
}

const RESOURCE_CHIPS: ChipDef[] = [
  { key: 'hasCT', label: 'TC' },
  { key: 'hasLab', label: 'Labs' },
  { key: 'hasICU', label: 'UTI' },
  { key: 'isSus', label: 'SUS' },
];

const RED_FLAG_CHIPS: RedFlagChipDef[] = [
  { key: 'immunosuppressed', label: 'Imunossuprimido', severity: 'critical' },
  { key: 'pregnant', label: 'Gestante', severity: 'critical' },
  { key: 'anticoagulant', label: 'Anticoagulante', severity: 'critical' },
  { key: 'pediatric', label: 'Pediátrico', severity: 'warning' },
  { key: 'elderly65', label: '65+', severity: 'warning' },
  { key: 'allergy', label: 'Alergia', severity: 'info' },
];

const COMPLAINT_TEMPLATES = [
  'Dor torácica',
  'Dispneia',
  'Dor abdominal',
  'Febre',
  'Cefaleia',
  'Síncope',
  'Trauma',
  'Síndrome gripal',
  'Dor lombar',
  'Vômitos',
  'Corização/Sangramento',
  'Alteração do sensório',
  'Dor em membro',
  'Disúria',
  'Crise hipertensiva',
  'Palpitação',
  'Síndrome convulsiva',
  'Prurido/Dermatite',
  'Dor odontológica',
  'Corpo estranho',
];

const VERTICAL_LABELS: Record<string, string> = {
  trauma: 'Trauma',
  cardiac: 'Cardíaco',
  pediatric: 'Pediátrico',
  neuro: 'Neuro',
  general: 'Geral',
};

const STEPS = ['Captura', 'Análise', 'Documento'];

const MIN_CHARS = 10;

/**
 * S23-CLIN-04 — tag ativa por severidade: cor clínica fixa + ícone próprio,
 * para o estado nunca depender só da cor.
 */
const RED_FLAG_ACTIVE: Record<RedFlagSeverity, { className: string; icon: ReactNode }> = {
  critical: {
    className: 'bg-tone-red-tag text-tone-red-ink',
    icon: <WarningCircle weight="fill" className="text-tone-red" />,
  },
  warning: {
    className: 'bg-tone-orange-tag text-tone-orange-ink',
    icon: <Warning weight="fill" className="text-tone-orange" />,
  },
  info: {
    className: 'bg-tone-blue-tag text-tone-blue-ink',
    icon: <Info weight="fill" className="text-tone-blue" />,
  },
};

/**
 * S23-CLIN-02 — chave de autosave do rascunho no sessionStorage.
 * Não usa localStorage (LGPD minimização — sessão apenas).
 */
const DRAFT_KEY = (encounterId: string) => `${STORAGE_KEY_PREFIX}${encounterId}:draft`;

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encounterId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOnline } = useOnlineStatus();
  const messages = useMessages();
  const demoPreset = getDemoCasePreset(searchParams.get('demoCase'));
  // Mesmo cache (['encounter', id]) que a trilha da barra superior já usa —
  // não gera request extra; só alimenta a etiqueta de vertical do caso.
  const encounterQuery = useEncounterDetail(encounterId);
  const vertical = demoPreset?.vertical ?? encounterQuery.data?.vertical;

  // S23-CLIN-02 — restaura rascunho salvo (autosave) ao montar.
  const [caseText, setCaseText] = useState(() => {
    if (typeof window === 'undefined') return demoPreset?.caseText ?? '';
    const draft = sessionStorage.getItem(DRAFT_KEY(encounterId));
    return draft ?? demoPreset?.caseText ?? '';
  });
  const [draftRestored, setDraftRestored] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DRAFT_KEY(encounterId)) !== null;
  });
  const [context, setContext] = useState<EncounterContext>(
    () => demoPreset?.context ?? { hasCT: false, isSus: false, hasLab: false, hasICU: false },
  );
  const [redFlags, setRedFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  );

  // UX-06 — streaming da análise inicial (ver hook para o porquê do escopo
  // ser "sinal de vida rápido", não parsing incremental de campos).
  const stream = useCopilotStream(encounterId);

  // S21-VOICE-03 — Hook Whisper (MediaRecorder + upload para /audio/transcribe).
  // Substitui o useVoiceInput (webkitSpeechRecognition não funciona em iOS Safari).
  const whisper = useWhisperVoice();
  const isVoiceSupported = whisper.isSupported;

  useEffect(() => {
    if (whisper.error) toast.error(whisper.error);
  }, [whisper.error]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setCaseText((prev) => {
      const separator = prev.trim() ? ' ' : '';
      return prev + separator + text;
    });
  }, []);

  useEffect(() => {
    if (isOnline) syncOfflineQueue().catch(() => {});
  }, [isOnline]);

  // S23-CLIN-02 — autosave do rascunho com debounce 500ms.
  // Salva texto ditado/digitado em sessionStorage para não perder se o médico
  // navegar para fora (interrupções típicas de plantão). Limpo após submit.
  useEffect(() => {
    if (!caseText.trim()) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(DRAFT_KEY(encounterId), caseText);
    }, 500);
    return () => clearTimeout(t);
  }, [caseText, encounterId]);

  // Limpa flag de "rascunho recuperado" depois de alguns segundos.
  useEffect(() => {
    if (!draftRestored) return;
    const t = setTimeout(() => setDraftRestored(false), 3500);
    return () => clearTimeout(t);
  }, [draftRestored]);

  const charCount = caseText.trim().length;
  const isValid = charCount >= MIN_CHARS;

  function toggleContext(key: string) {
    setContext((prev) => ({ ...prev, [key]: !prev[key as keyof EncounterContext] }));
  }

  function toggleRedFlag(key: string) {
    setRedFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /**
   * S23-CLIN-01 — Templates funcionais (sem tap morto).
   * Antes: se já houvesse texto no Textarea, o tap no template era no-op.
   * Agora: sempre insere — append com separador se já há texto, substitui
   * se vazio. Feedback via toast confirma a ação.
   */
  function applyTemplate(template: string) {
    setCaseText((prev) => {
      if (!prev.trim()) {
        return template + ': ';
      }
      // Já há texto — append em nova linha para não sobrescrever o ditado.
      const sep = prev.endsWith('\n') ? '' : '\n';
      return `${prev}${sep}${template}: `;
    });
    toast.success(messages.capture.templateApplied(template));
  }

  // UX-06 — extraído de dentro do try/catch original para ser reaproveitado
  // pelos dois caminhos de sucesso (streaming e POST não-streaming) sem
  // duplicar a lógica de persistência/navegação.
  function applyAnalysisResult(result: CopilotAnalyzeResponse) {
    const analysis: CopilotAnalysis = {
      ...result.output,
      citations: result.citations,
    };

    sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}${encounterId}`,
      // UX-03 — turnIndex/maxTurns precisam estar aqui desde a primeira
      // análise, senão o indicador de progresso nasce sem dado na
      // primeira visita à tela de resultado (antes de qualquer reanálise).
      JSON.stringify({
        interactionId: result.interactionId,
        analysis,
        caseText,
        turnIndex: result.metadata.turnIndex,
        maxTurns: result.metadata.maxTurns,
        // KB-005/KB-006 — mesma razão: o aviso de "a base não cobre este
        // cenário" precisa existir já na primeira visita ao resultado.
        retrievalCoverage: result.metadata.retrievalCoverage,
      } satisfies StoredCopilotResult),
    );
    // S23-CLIN-02 — limpa rascunho após submit com sucesso (não precisa mais).
    sessionStorage.removeItem(DRAFT_KEY(encounterId));
    // UX-05 — primeira análise concluída com sucesso: a partir de agora o
    // médico já viu valor, é o momento certo para oferecer instalação.
    markFirstAnalysisDone();
    router.push(`/encounters/${encounterId}/result`);
  }

  async function handleSubmit() {
    if (!isValid || loading) return;

    const trimmedCaseText = caseText.trim();

    if (!isOnline) {
      await addToQueue({
        type: 'analyze',
        encounterId,
        caseText: trimmedCaseText,
        context,
        // S20-CLIN-01 — envia redFlags explícitas na fila offline.
        redFlags,
      });
      toast.info(messages.capture.offlineQueued);
      return;
    }

    setLoading(true);
    setError(null);

    const demoCaseSlug = searchParams.get('demoCase') ?? undefined;

    // UX-06 — tenta streaming primeiro para o caminho comum. Casos-demo
    // ficam de fora (o endpoint de stream não carrega a tag `demoCase` de
    // segmentação de funil — perdê-la comprometeria a métrica de adoção
    // do piloto) e casos muito longos também (URL de GET tem limite
    // prático de tamanho — ver isStreamEligible). Qualquer falha no
    // streaming (rede, proxy bloqueando SSE, etc.) cai no POST de sempre —
    // o médico nunca fica sem resultado só porque o streaming falhou.
    if (!demoCaseSlug && isStreamEligible(trimmedCaseText)) {
      try {
        const result = await stream.start({ caseText: trimmedCaseText, context, redFlags });
        applyAnalysisResult(result);
        setLoading(false);
        return;
      } catch {
        // segue para o POST não-streaming abaixo
      }
    }

    try {
      const result = await apiClient.post<CopilotAnalyzeResponse>(
        `/encounters/${encounterId}/copilot/analyze`,
        // S20-CLIN-01 — envia redFlags explícitas no payload online.
        { caseText: trimmedCaseText, context, redFlags, demoCase: demoCaseSlug },
      );
      applyAnalysisResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.capture.errorAnalyze);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page width="narrow" className="gap-6">
      {/* Etapa do fluxo + metadado do caso. A trilha (Casos / caso / Captura)
          já está na barra superior do shell. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ProgressSteps steps={STEPS} currentStep={0} className="-ml-1.5" />
        <div className="flex items-center gap-2">
          {vertical && VERTICAL_LABELS[vertical] && (
            <Badge variant="purple">{VERTICAL_LABELS[vertical]}</Badge>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {encounterId.slice(0, 8)}
          </span>
        </div>
      </div>

      <PageHeader
        size="compact"
        title="Descreva o caso"
        description="Dite ou digite como passaria o caso a um colega. O copiloto organiza, pergunta o que falta e sugere a conduta."
      />

      {demoPreset && (
        <Callout tone="purple" icon={<Flask weight="duotone" />} title={demoPreset.title}>
          {demoPreset.summary}
        </Callout>
      )}

      {/* Bloco de ditado + editor: o coração da tela. Voz é a entrada
          principal no plantão; o texto continua editável logo abaixo. */}
      <div className="flex flex-col gap-3">
        {isVoiceSupported ? (
          <VoiceBlock
            whisper={whisper}
            disabled={loading}
            onTranscript={handleVoiceTranscript}
            messages={messages}
          />
        ) : (
          <Callout
            role="status"
            tone="gray"
            icon={<MicrophoneSlash weight="duotone" />}
            title={messages.capture.voice.unsupportedTitle}
          >
            {messages.capture.voice.unsupportedDescription}
          </Callout>
        )}

        {/* Editor no estilo página do Notion: sem moldura, texto grande,
            placeholder cinza. O foco aparece como um anel suave em volta. */}
        <div className="-mx-3 rounded-lg px-3 transition-shadow duration-150 focus-within:ring-[3px] focus-within:ring-ring/20">
          <Textarea
            aria-label={messages.capture.caseLabel}
            placeholder={messages.capture.placeholder}
            className="min-h-40 resize-none rounded-none border-0 bg-transparent px-0 py-3 text-base leading-7 shadow-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-0 disabled:opacity-60 md:min-h-60 md:text-[1.0625rem] md:leading-8"
            value={caseText}
            onChange={(e) => setCaseText(e.target.value)}
            onKeyDown={(e) => {
              // ⌘↵ / Ctrl+↵ envia, como no Notion AI.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={loading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">{messages.capture.complaintHint}</p>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1">
            {COMPLAINT_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => applyTemplate(template)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-tone-gray-bg px-2.5 text-[0.8125rem] text-foreground transition-colors hover:bg-tone-gray-tag focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:h-10"
              >
                <Plus className="size-3 text-muted-foreground" aria-hidden="true" />
                {template}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>{messages.errors.title}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Propriedades do caso: o que o texto nem sempre diz e muda a conduta. */}
      <section className="flex flex-col gap-2 border-t border-border pt-6">
        <SectionHeader
          title="Contexto do atendimento"
          description="Marque o que o relato nem sempre diz — recursos disponíveis e condições que mudam a conduta."
        />
        <PropertyList>
          <PropertyRow
            icon={Hospital}
            label={messages.capture.resources}
            className="max-sm:grid-cols-1 max-sm:gap-0"
          >
            <div role="group" aria-label={messages.capture.resources} className="flex flex-wrap gap-1.5">
              {RESOURCE_CHIPS.map((chip) => {
                const active = !!context[chip.key as keyof EncounterContext];
                return (
                  <ToggleTag
                    key={chip.key}
                    pressed={active}
                    onClick={() => toggleContext(chip.key)}
                    activeClassName="bg-tone-blue-tag text-tone-blue-ink"
                    activeIcon={<Check weight="bold" className="text-tone-blue" />}
                  >
                    {chip.label}
                  </ToggleTag>
                );
              })}
            </div>
          </PropertyRow>
          <PropertyRow
            icon={Siren}
            label={messages.capture.redFlags}
            className="max-sm:grid-cols-1 max-sm:gap-0"
          >
            {/*
              S23-CLIN-04 — chips diferenciados por severidade clínica.
              Crítico (imunossuprimido, gestante, anticoagulante): vermelho
              + ícone. Warning (pediátrico, 65+): laranja. Info (alergia):
              azul. Coerente com output-validator (critical/high/moderate).
            */}
            <div role="group" aria-label={messages.capture.redFlags} className="flex flex-wrap gap-1.5">
              {RED_FLAG_CHIPS.map((chip) => {
                const active = !!redFlags[chip.key];
                const style = RED_FLAG_ACTIVE[chip.severity];
                return (
                  <ToggleTag
                    key={chip.key}
                    pressed={active}
                    onClick={() => toggleRedFlag(chip.key)}
                    activeClassName={style.className}
                    activeIcon={style.icon}
                  >
                    {chip.label}
                  </ToggleTag>
                );
              })}
            </div>
          </PropertyRow>
        </PropertyList>
      </section>

      {/* F4 — anexar a diretriz ao caso, junto do contexto: é onde o médico
          já está informando o que o texto do caso não diz. */}
      <EncounterAttachments encounterId={encounterId} />

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" weight="duotone" aria-hidden="true" />
        Sem dados pessoais do paciente. PII é filtrada antes de qualquer envio à IA (LGPD).
      </p>

      {/* F1 — com o raciocínio em etapas, o entendimento chega antes do plano:
          o médico já confere o que o copiloto entendeu enquanto ele monta a
          conduta. Logo acima da barra de ação, onde o olhar está. */}
      {stream.status === 'streaming' && (
        <UnderstandingCard
          understanding={stream.understanding}
          footnote={messages.understanding.streamingHint}
        />
      )}

      {/* Barra de ação fixa no rodapé da página. No mobile fica acima da
          barra de abas do shell (altura dela + safe area). */}
      <div className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 -mt-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 md:bottom-0 md:mx-0 md:px-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
            <CaptureStatus
              streaming={stream.status === 'streaming'}
              offline={!isOnline}
              draftRestored={draftRestored}
              isValid={isValid}
              charCount={charCount}
              messages={messages}
            />
          </div>
          <span className="hidden items-center gap-0.5 md:flex" aria-hidden="true">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <Button size="lg" disabled={!isValid || loading} onClick={handleSubmit} className="shrink-0">
            {loading ? (
              <>
                <Spinner className="animate-spin" />
                {messages.capture.ctaLoading}
              </>
            ) : (
              <>
                <Sparkle weight="fill" />
                {messages.capture.cta}
              </>
            )}
          </Button>
        </div>
      </div>
    </Page>
  );
}

/**
 * Bloco de ditado (como o bloco de transcrição do Notion AI): botão de
 * microfone grande à esquerda, estado e tempo ao lado. Gravando, o bloco
 * ganha fundo azul (IA em andamento) e o botão vira "parar".
 */
function VoiceBlock({
  whisper,
  disabled,
  onTranscript,
  messages,
}: {
  whisper: WhisperVoiceHook;
  disabled: boolean;
  onTranscript: (text: string) => void;
  messages: Messages;
}) {
  const voice = messages.capture.voice;
  const { isListening, isUploading } = whisper;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors duration-150 sm:gap-4 sm:px-4',
        isListening ? 'border-transparent bg-tone-blue-bg' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (isUploading) return;
          if (isListening) {
            whisper.stop();
          } else {
            whisper.start(onTranscript);
          }
        }}
        disabled={disabled || isUploading}
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed',
          isListening
            ? 'bg-foreground text-background'
            : isUploading
              ? 'bg-tone-gray-bg text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-[var(--brand-hover)] disabled:opacity-40',
        )}
        aria-label={isListening ? voice.stop : isUploading ? voice.transcribing : voice.start}
      >
        {isListening ? (
          <Stop className="size-5" weight="fill" />
        ) : isUploading ? (
          <Spinner className="size-5 animate-spin" weight="bold" />
        ) : (
          <Microphone className="size-6" weight="fill" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {isListening ? (
          <>
            <div className="flex items-center gap-2.5 text-tone-blue-ink">
              <span className="text-sm font-semibold">{voice.recording}</span>
              <span className="text-sm tabular-nums">{formatElapsed(whisper.elapsedMs)}</span>
              <RecordingWaveform active className="h-5 text-tone-blue" />
            </div>
            <p className="text-[0.8125rem] text-tone-blue-ink/80">
              Toque em parar para transcrever no caso.
            </p>
          </>
        ) : isUploading ? (
          <>
            <p className="text-sm font-semibold text-foreground">{voice.transcribing}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              O texto entra no caso em instantes.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground">{voice.tapToDictate}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              O ditado é transcrito direto no caso — até 5 minutos.
            </p>
          </>
        )}
      </div>

      {isListening && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-tone-blue-ink max-sm:h-10"
          onClick={() => whisper.cancel()}
        >
          {voice.cancel}
        </Button>
      )}
    </div>
  );
}

/**
 * Tag de seleção do Notion como alternância: tracejada quando vazia, cor da
 * categoria/severidade + ícone quando marcada. `aria-pressed` comunica o
 * estado ao leitor de tela.
 */
function ToggleTag({
  pressed,
  onClick,
  activeClassName,
  activeIcon,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  activeClassName: string;
  activeIcon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[0.8125rem] transition-colors duration-100 select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:h-10 max-sm:px-3 [&_svg]:size-3.5 [&_svg]:shrink-0',
        pressed
          ? cn('border-transparent font-medium', activeClassName)
          : 'border-dashed border-input text-muted-foreground hover:bg-hover hover:text-foreground',
      )}
    >
      {pressed ? activeIcon : <Plus aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Linha de status da barra de ação, por prioridade: streaming → offline →
 * rascunho recuperado → validação do texto.
 */
function CaptureStatus({
  streaming,
  offline,
  draftRestored,
  isValid,
  charCount,
  messages,
}: {
  streaming: boolean;
  offline: boolean;
  draftRestored: boolean;
  isValid: boolean;
  charCount: number;
  messages: Messages;
}) {
  // UX-06 — sinal de vida rápido enquanto o stream chega, em vez de um
  // spinner mudo pelo tempo inteiro da inferência. Não mostra o texto bruto
  // do delta (é JSON em construção, cru e por vezes ilegível — errado exibir
  // fragmento de sintaxe a um médico em decisão clínica); só a confirmação de
  // que a resposta já está chegando. A análise estruturada de verdade só
  // aparece completa, ao final (ver hook para o porquê).
  if (streaming) {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-primary">
        <Spinner className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        <span>{messages.capture.streamingHint}</span>
      </p>
    );
  }
  if (offline) {
    return (
      <p className="flex items-center gap-1.5 text-foreground">
        <WifiSlash className="size-4 shrink-0 text-tone-orange" aria-hidden="true" />
        <span>{messages.capture.offlineHint}</span>
      </p>
    );
  }
  if (draftRestored) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
        <ArrowCounterClockwise className="size-4 shrink-0" aria-hidden="true" />
        <span>Rascunho recuperado do seu último acesso a este caso.</span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
      {isValid ? (
        <span className="flex items-center gap-1 text-foreground">
          <CheckCircle className="size-4 shrink-0" weight="fill" aria-hidden="true" />
          {messages.capture.readyToAnalyze}
        </span>
      ) : (
        <span>{messages.capture.charMin(MIN_CHARS)}</span>
      )}
      <span aria-hidden="true" className="max-sm:hidden">
        ·
      </span>
      <span className="tabular-nums max-sm:hidden">
        {charCount} {charCount === 1 ? 'caractere' : 'caracteres'}
      </span>
    </p>
  );
}

/**
 * S21-VOICE-04 — Formata milissegundos em mm:ss para o timer de gravação.
 * Usa tabular-nums via classe Tailwind no span onde é renderizado.
 */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes.toString().padStart(1, '0')}:${seconds.toString().padStart(2, '0')}`;
}
