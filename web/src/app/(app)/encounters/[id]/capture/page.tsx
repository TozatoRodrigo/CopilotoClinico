'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useWhisperVoice } from '@/hooks/use-whisper-voice';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { addToQueue } from '@/lib/offline-queue';
import { syncOfflineQueue } from '@/lib/copilot-queue';
import { STORAGE_KEY_PREFIX } from '@/hooks/use-copilot-conversation';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  Microphone,
  MicrophoneSlash,
  WarningCircle,
  WifiSlash,
  Spinner,
  Stop,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { CopilotAnalysis, CopilotAnalyzeResponse, EncounterContext } from '@/lib/types';
import { getDemoCasePreset } from '@/lib/demo-case-presets';
import { messages } from '@/lib/messages';
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

  async function handleSubmit() {
    if (!isValid || loading) return;

    if (!isOnline) {
      await addToQueue({
        type: 'analyze',
        encounterId,
        caseText: caseText.trim(),
        context,
        // S20-CLIN-01 — envia redFlags explícitas na fila offline.
        redFlags,
      });
      toast.info(messages.capture.offlineQueued);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.post<CopilotAnalyzeResponse>(
        `/encounters/${encounterId}/copilot/analyze`,
        // S20-CLIN-01 — envia redFlags explícitas no payload online.
        { caseText: caseText.trim(), context, redFlags, demoCase: searchParams.get('demoCase') ?? undefined },
      );
      const analysis: CopilotAnalysis = {
        ...result.output,
        citations: result.citations,
      };

      sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${encounterId}`,
        JSON.stringify({ interactionId: result.interactionId, analysis }),
      );
      // S23-CLIN-02 — limpa rascunho após submit com sucesso (não precisa mais).
      sessionStorage.removeItem(DRAFT_KEY(encounterId));
      router.push(`/encounters/${encounterId}/result`);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.capture.errorAnalyze);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-6">
      {/*
        S22-NAV-01 — breadcrumb no fluxo de atendimento. Antes o médico não
        sabia onde estava na hierarquia (Atendimentos > paciente > Captura).
      */}
      <Breadcrumb
        items={[
          { label: 'Atendimentos', href: '/encounters' },
          { label: encounterId.slice(0, 8), href: `/encounters/${encounterId}` },
          { label: 'Captura' },
        ]}
      />
      {/*
        S23-CLIN-02 — feedback sutil de rascunho recuperado. Indica ao médico
        que o texto que ele vê veio do autosave (não foi perdido ao navegar).
      */}
      {draftRestored && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-md border border-clinical-teal/30 bg-clinical-teal/5 px-3 py-2 text-xs text-muted-foreground"
        >
          <span aria-hidden="true">↩</span>
          Rascunho recuperado do seu último acesso a este caso.
        </div>
      )}
      {demoPreset && (
        <Alert className="mb-4">
          <AlertTitle>{demoPreset.title}</AlertTitle>
          <AlertDescription>{demoPreset.summary}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
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
                      active && chip.severity === 'critical' &&
                        'border-destructive bg-destructive text-destructive-foreground',
                      active && chip.severity === 'warning' &&
                        'border-clinical-amber bg-clinical-amber text-clinical-amber-foreground',
                    )}
                  >
                    {chip.severity === 'critical' && active && (
                      <WarningCircle className="mr-1 inline size-3" weight="fill" aria-hidden="true" />
                    )}
                    {chip.label}
                  </Badge>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>
      <section className="mt-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
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
      </section>

      <section className="mt-6 flex flex-1 flex-col justify-end pb-4">
        {isVoiceSupported ? (
          <div className="flex flex-col items-center gap-3">
            {/* S21-VOICE-04 — Estados: idle (mic) → recording (stop, vermelho)
                → uploading (spinner). Botão grande de 64px acessível. */}
            <button
              type="button"
              onClick={() => {
                if (whisper.isUploading) return; // não interrompe upload
                if (whisper.isListening) {
                  whisper.stop();
                } else {
                  whisper.start(handleVoiceTranscript);
                }
              }}
              disabled={loading || whisper.isUploading}
              className={cn(
                'flex size-16 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                whisper.isListening
                  ? 'bg-clinical-teal text-white shadow-lg shadow-clinical-teal/30 scale-105'
                  : whisper.isUploading
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-card border-2 border-clinical-teal/40 text-clinical-teal hover:bg-clinical-teal/10',
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
                <Stop className="size-8" weight="fill" />
              ) : whisper.isUploading ? (
                <Spinner className="size-8 animate-spin" weight="bold" />
              ) : (
                <Microphone className="size-8" weight="bold" />
              )}
            </button>

            {/* S21-VOICE-04 — feedback contínuo durante gravação.
                Waveform simples com 5 barras animadas pelo audioLevel do hook. */}
            {whisper.isListening && (
              <div
                className="flex items-center gap-2"
                role="status"
                aria-live="polite"
                aria-label={`${messages.capture.voice.recording} ${formatElapsed(whisper.elapsedMs)}`}
              >
                <div className="flex items-end gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const baseLevel = whisper.audioLevel ?? 0.15;
                    // Variação por barra para parecer waveform natural.
                    const barLevel = Math.min(
                      1,
                      baseLevel * (0.6 + Math.sin(Date.now() / 200 + i) * 0.4 + i * 0.05),
                    );
                    return (
                      <span
                        key={i}
                        className="inline-block w-1 rounded-full bg-clinical-teal transition-[height] duration-75"
                        style={{ height: `${4 + barLevel * 20}px` }}
                      />
                    );
                  })}
                </div>
                <span className="ml-1 font-mono text-sm tabular-nums text-clinical-teal">
                  {formatElapsed(whisper.elapsedMs)}
                </span>
                <button
                  type="button"
                  onClick={() => whisper.cancel()}
                  className="ml-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {messages.capture.voice.cancel}
                </button>
              </div>
            )}

            {/* S21-VOICE-04 — feedback durante upload da transcrição. */}
            {whisper.isUploading && (
              <p
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {messages.capture.voice.transcribing}
              </p>
            )}

            {/* Idle: dica inicial. */}
            {!whisper.isListening && !whisper.isUploading && (
              <p className="text-sm text-muted-foreground">
                {messages.capture.voice.tapToDictate}
              </p>
            )}
          </div>
        ) : (
          // S21-VOICE-05 — fallback quando nem MediaRecorder existe (muito raro;
          // cobre browsers legados sem suporte a getUserMedia). Mensagem clara
          // em pt-BR destacando o textarea.
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
        )}

        <div className="mt-4">
          <Textarea
            aria-label={messages.capture.caseLabel}
            placeholder={messages.capture.placeholder}
            className={cn(
              'min-h-[100px] resize-y border-border/50 bg-transparent text-sm',
              // S20-VOICE-01 — realça o textarea quando voz não está disponível,
              // direcionando o médico para onde a ação acontece agora.
              !isVoiceSupported && 'border-clinical-teal/40 focus-visible:ring-clinical-teal/30',
            )}
            value={caseText}
            onChange={(e) => setCaseText(e.target.value)}
            disabled={loading}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {caseText.trim().length < MIN_CHARS
                ? messages.capture.charMin(MIN_CHARS)
                : messages.capture.readyToAnalyze}
            </span>
            <span className="font-mono">{caseText.trim().length}</span>
          </div>
        </div>
      </section>

      {!isOnline && (
        <div className="mt-2 flex items-center gap-2 rounded-full border border-clinical-amber/30 bg-clinical-amber-bg px-3 py-1.5 text-xs text-clinical-amber-foreground">
          <WifiSlash className="size-3.5" />
          {messages.capture.offlineHint}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>{messages.errors.title}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        className="mt-4 w-full"
        size="lg"
        disabled={!isValid || loading}
        onClick={handleSubmit}
      >
        {loading ? messages.capture.ctaLoading : messages.capture.cta}
      </Button>
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
