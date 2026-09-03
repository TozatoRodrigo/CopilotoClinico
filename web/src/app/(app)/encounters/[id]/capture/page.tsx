'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ProgressSteps } from '@/components/ui/progress-steps';
import { RecordingWaveform } from '@/components/ui/recording-waveform';
import { useWhisperVoice } from '@/hooks/use-whisper-voice';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { addToQueue } from '@/lib/offline-queue';
import { syncOfflineQueue } from '@/lib/copilot-queue';
import {
  STORAGE_KEY_PREFIX,
  type StoredCopilotResult,
} from '@/hooks/use-copilot-conversation';
import { EncounterAttachments } from '@/components/domain/encounter-attachments';
import { useCopilotStream, isStreamEligible } from '@/hooks/use-copilot-stream';
import { markFirstAnalysisDone } from '@/components/domain/install-prompt-banner';
import {
  Microphone,
  MicrophoneSlash,
  WarningCircle,
  WifiSlash,
  Spinner,
  Stop,
  Sparkle,
  ShieldCheck,
  ArrowLeft,
  CheckCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { CopilotAnalysis, CopilotAnalyzeResponse, EncounterContext } from '@/lib/types';
import { getDemoCasePreset } from '@/lib/demo-case-presets';
import { useMessages } from '@/lib/messages/use-messages';
import { cn } from '@/lib/utils';

/**
 * S23-CLIN-04 — Severidade clínica dos chips de red flag.
 *
 * Alinhada com output-validator.ts (severity: critical | high | moderate):
 * - critical: muda drasticamente a conduta (imunossuprimido, gestante,
 *   anticoagulante) — vermelho sólido com ícone
 * - warning: requer atenção especial (pediátrico, idoso) — âmbar
 * - info: alerta adicional (alergia) — teal padrão
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

const MIN_CHARS = 10;
/**
 * S23-CLIN-04 — helper para variant do Badge por severidade.
 */
function redFlagVariant(severity: RedFlagSeverity): 'destructive' | 'default' | 'outline' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'default';
  return 'outline';
}

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

  const isValid = caseText.trim().length >= MIN_CHARS;

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
    <div className="flex h-screen flex-col bg-clinical-paper">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/encounters/${encounterId}`}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Fila
          </Link>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <span className="font-mono text-sm text-muted-foreground">
            {encounterId.slice(0, 8)}
          </span>
          {demoPreset?.vertical && VERTICAL_LABELS[demoPreset.vertical] && (
            <Badge variant="secondary" className="ml-1">
              {VERTICAL_LABELS[demoPreset.vertical]}
            </Badge>
          )}
        </div>
        <ProgressSteps
          steps={['Captura', 'Análise', 'Documento']}
          currentStep={0}
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        {draftRestored && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-clinical-teal/30 bg-clinical-teal/5 px-4 py-2 text-xs text-muted-foreground"
          >
            <span aria-hidden="true">↩</span>
            Rascunho recuperado do seu último acesso a este caso.
          </div>
        )}
        {demoPreset && (
          <div className="border-b border-border bg-card px-4 py-3">
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle>{demoPreset.title}</AlertTitle>
              <AlertDescription>{demoPreset.summary}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr]">
          {/* Left panel — recursos, red flags, modelos de queixa, nota LGPD */}
          <aside className="flex flex-col gap-6 border-b border-border bg-card p-4 md:border-b-0 md:border-r">
            <fieldset>
              <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {messages.capture.resources}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {RESOURCE_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => toggleContext(chip.key)}
                    aria-pressed={!!context[chip.key as keyof EncounterContext]}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Badge
                      variant={context[chip.key as keyof EncounterContext] ? 'default' : 'outline'}
                      className="cursor-pointer select-none px-3 py-1 text-sm"
                    >
                      {chip.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {messages.capture.redFlags}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {/*
                  S23-CLIN-04 — chips diferenciados por severidade clínica.
                  Crítico (imunossuprimido, gestante, anticoagulante): vermelho
                  sólido + ícone. Warning (pediátrico, 65+): âmbar. Info (alergia):
                  teal padrão. Coerente com output-validator (critical/high/moderate).
                */}
                {RED_FLAG_CHIPS.map((chip) => {
                  const active = !!redFlags[chip.key];
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => toggleRedFlag(chip.key)}
                      aria-pressed={active}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge
                        variant={active ? redFlagVariant(chip.severity) : 'outline'}
                        className={cn(
                          'cursor-pointer select-none px-3 py-1 text-sm',
                          active &&
                            chip.severity === 'critical' &&
                            'border-destructive bg-destructive text-destructive-foreground',
                          active &&
                            chip.severity === 'warning' &&
                            'border-clinical-amber bg-clinical-amber text-clinical-amber-foreground',
                        )}
                      >
                        {chip.severity === 'critical' && active && (
                          <WarningCircle
                            className="mr-1 inline size-3"
                            weight="fill"
                            aria-hidden="true"
                          />
                        )}
                        {chip.label}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* F4 — anexar a diretriz ao caso, ao lado das red flags: é onde o
                médico já está informando o que o texto do caso não diz. */}
            <EncounterAttachments encounterId={encounterId} />

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {messages.capture.complaintHint}
              </p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {COMPLAINT_TEMPLATES.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-clinical-teal/40 hover:text-foreground"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                weight="duotone"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sem dados pessoais do paciente. PII é filtrada antes de qualquer envio à IA (LGPD).
              </p>
            </div>
          </aside>

          {/* Right panel — gravação + transcrição + ação */}
          <main className="flex flex-col gap-6 p-4 md:p-6">
            {!isVoiceSupported ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-clinical-teal/30 bg-clinical-teal/5 px-4 py-3"
              >
                <MicrophoneSlash
                  className="mt-0.5 size-5 shrink-0 text-clinical-teal"
                  weight="duotone"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {messages.capture.voice.unsupportedTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {messages.capture.voice.unsupportedDescription}
                  </p>
                </div>
              </div>
            ) : null}

            <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white">
              {/* Cabeçalho do cartão — estado da gravação */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                {isVoiceSupported && whisper.isListening ? (
                  <>
                    <span className="relative flex size-2.5" aria-hidden="true">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-clinical-error opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-clinical-error" />
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {messages.capture.voice.recording}
                    </span>
                    <RecordingWaveform active={whisper.isListening} />
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {formatElapsed(whisper.elapsedMs)}
                    </span>
                    <button
                      type="button"
                      onClick={() => whisper.cancel()}
                      className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {messages.capture.voice.cancel}
                    </button>
                  </>
                ) : isVoiceSupported && whisper.isUploading ? (
                  <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Spinner className="size-4 animate-spin" />
                    {messages.capture.voice.transcribing}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">Pronto</span>
                )}
              </div>

              {/* Corpo — textarea estilo pauta */}
              <Textarea
                aria-label={messages.capture.caseLabel}
                placeholder={messages.capture.placeholder}
                className={cn(
                  'min-h-[200px] flex-1 resize-y rounded-none border-0 bg-[repeating-linear-gradient(transparent,transparent_31px,var(--line)_31px,var(--line)_32px)] text-base leading-[32px] focus-visible:ring-0',
                  !isVoiceSupported &&
                    'border-clinical-teal/40 focus-visible:ring-clinical-teal/30',
                )}
                value={caseText}
                onChange={(e) => setCaseText(e.target.value)}
                disabled={loading}
              />

              {/* Rodapé — validação + contagem */}
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
                <span
                  className={cn(
                    'flex items-center gap-1',
                    isValid ? 'text-clinical-green' : 'text-muted-foreground',
                  )}
                >
                  {isValid ? (
                    <>
                      <CheckCircle className="size-3.5" weight="fill" aria-hidden="true" />
                      {messages.capture.readyToAnalyze}
                    </>
                  ) : (
                    messages.capture.charMin(MIN_CHARS)
                  )}
                </span>
                <span className="font-mono text-muted-foreground">{caseText.trim().length}</span>
              </div>
            </section>

            {!isOnline && (
              <div className="flex items-center gap-2 rounded-full border border-clinical-amber/30 bg-clinical-amber-bg px-3 py-1.5 text-xs text-clinical-amber-foreground">
                <WifiSlash className="size-3.5" />
                {messages.capture.offlineHint}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTitle>{messages.errors.title}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* UX-06 — sinal de vida rápido enquanto o stream chega, em vez
                de um spinner mudo pelo tempo inteiro da inferência. Não
                mostra o texto bruto do delta (é JSON em construção, cru e
                por vezes ilegível — errado exibir fragmento de sintaxe a
                um médico em decisão clínica); só a confirmação de que a
                resposta já está chegando. A análise estruturada de verdade
                só aparece completa, ao final (ver hook para o porquê). */}
            {stream.status === 'streaming' && (
              <div
                className="flex items-center gap-2 rounded-lg border border-clinical-teal/30 bg-clinical-teal/5 px-3 py-2 text-sm text-clinical-teal"
                role="status"
                aria-live="polite"
              >
                <Spinner className="size-4 shrink-0 animate-spin" />
                <span>{messages.capture.streamingHint}</span>
              </div>
            )}

            <div className="mt-auto flex items-center gap-4">
              {isVoiceSupported && (
                <button
                  type="button"
                  onClick={() => {
                    if (whisper.isUploading) return;
                    if (whisper.isListening) {
                      whisper.stop();
                    } else {
                      whisper.start(handleVoiceTranscript);
                    }
                  }}
                  disabled={loading || whisper.isUploading}
                  className={cn(
                    'flex size-[72px] shrink-0 items-center justify-center rounded-full shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    whisper.isListening
                      ? 'bg-clinical-error text-white shadow-clinical-error/30 scale-105'
                      : whisper.isUploading
                        ? 'cursor-not-allowed bg-muted text-muted-foreground'
                        : 'bg-clinical-teal text-white shadow-clinical-teal/30 hover:brightness-105',
                    (loading || whisper.isUploading) && 'cursor-not-allowed',
                  )}
                  aria-label={
                    whisper.isListening
                      ? messages.capture.voice.stop
                      : whisper.isUploading
                        ? messages.capture.voice.transcribing
                        : messages.capture.voice.start
                  }
                >
                  {whisper.isListening ? (
                    <Stop className="size-7" weight="fill" />
                  ) : whisper.isUploading ? (
                    <Spinner className="size-7 animate-spin" weight="bold" />
                  ) : (
                    <Microphone className="size-7" weight="fill" />
                  )}
                </button>
              )}

              <Button
                className="h-[60px] flex-1 bg-clinical-teal text-base font-semibold hover:bg-clinical-teal/90"
                size="lg"
                disabled={!isValid || loading}
                onClick={handleSubmit}
              >
                {loading ? (
                  messages.capture.ctaLoading
                ) : (
                  <>
                    <Sparkle className="mr-2 size-5" weight="fill" />
                    {messages.capture.cta}
                  </>
                )}
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
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
