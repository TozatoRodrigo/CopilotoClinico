'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { addToQueue } from '@/lib/offline-queue';
import { syncOfflineQueue } from '@/lib/copilot-queue';
import { STORAGE_KEY_PREFIX } from '@/hooks/use-copilot-conversation';
import { Microphone, MicrophoneSlash, WifiSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { CopilotAnalysis, CopilotAnalyzeResponse, EncounterContext } from '@/lib/types';
import { getDemoCasePreset } from '@/lib/demo-case-presets';
import { messages } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface ChipDef {
  key: string;
  label: string;
}

const RESOURCE_CHIPS: ChipDef[] = [
  { key: 'hasCT', label: 'TC' },
  { key: 'hasLab', label: 'Labs' },
  { key: 'hasICU', label: 'UTI' },
  { key: 'isSus', label: 'SUS' },
];

const RED_FLAG_CHIPS: ChipDef[] = [
  { key: 'immunosuppressed', label: 'Imunossuprimido' },
  { key: 'pregnant', label: 'Gestante' },
  { key: 'anticoagulant', label: 'Anticoagulante' },
  { key: 'pediatric', label: 'Pediátrico' },
  { key: 'elderly65', label: '65+' },
  { key: 'allergy', label: 'Alergia' },
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

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encounterId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOnline } = useOnlineStatus();
  const demoPreset = getDemoCasePreset(searchParams.get('demoCase'));

  const [caseText, setCaseText] = useState(() => demoPreset?.caseText ?? '');
  const [context, setContext] = useState<EncounterContext>(
    () => demoPreset?.context ?? { hasCT: false, isSus: false, hasLab: false, hasICU: false },
  );
  const [redFlags, setRedFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isListening,
    startListening,
    stopListening,
    isSupported: isVoiceSupported,
    error: voiceError,
  } = useVoiceInput();

  useEffect(() => {
    if (voiceError) toast.error(voiceError);
  }, [voiceError]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setCaseText((prev) => {
      const separator = prev.trim() ? ' ' : '';
      return prev + separator + text;
    });
  }, []);

  useEffect(() => {
    if (isOnline) syncOfflineQueue().catch(() => {});
  }, [isOnline]);

  const isValid = caseText.trim().length >= MIN_CHARS;

  function toggleContext(key: string) {
    setContext((prev) => ({ ...prev, [key]: !prev[key as keyof EncounterContext] }));
  }

  function toggleRedFlag(key: string) {
    setRedFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function applyTemplate(template: string) {
    setCaseText((prev) => {
      if (prev.trim()) return prev;
      return template + ': ';
    });
  }

  async function handleSubmit() {
    if (!isValid || loading) return;

    if (!isOnline) {
      await addToQueue({
        type: 'analyze',
        encounterId,
        caseText: caseText.trim(),
        context,
      });
      toast.info(messages.capture.offlineQueued);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.post<CopilotAnalyzeResponse>(
        `/encounters/${encounterId}/copilot/analyze`,
        { caseText: caseText.trim(), context },
      );
      const analysis: CopilotAnalysis = {
        ...result.output,
        citations: result.citations,
      };

      sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${encounterId}`,
        JSON.stringify({ interactionId: result.interactionId, analysis }),
      );
      router.push(`/encounters/${encounterId}/result`);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.capture.errorAnalyze);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-6">
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
            {RED_FLAG_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => toggleRedFlag(chip.key)}
                aria-pressed={!!redFlags[chip.key]}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge
                  variant={redFlags[chip.key] ? 'destructive' : 'outline'}
                  className="cursor-pointer select-none px-3 py-1 text-sm"
                >
                  {chip.label}
                </Badge>
              </button>
            ))}
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
        {isVoiceSupported && (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() =>
                isListening ? stopListening() : startListening(handleVoiceTranscript)
              }
              disabled={loading}
              className={cn(
                'flex size-16 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isListening
                  ? 'bg-clinical-teal text-white shadow-lg shadow-clinical-teal/30 scale-105'
                  : 'bg-card border-2 border-clinical-teal/40 text-clinical-teal hover:bg-clinical-teal/10',
                loading && 'opacity-50 pointer-events-none',
              )}
              aria-label={isListening ? messages.capture.voice.stop : messages.capture.voice.start}
            >
              {isListening ? (
                <MicrophoneSlash className="size-8" weight="fill" />
              ) : (
                <Microphone className="size-8" weight="bold" />
              )}
            </button>
            {isListening && (
              <div className="flex items-center gap-1" role="status" aria-live="polite">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="inline-block h-3 w-1 rounded-full bg-clinical-teal animate-pulse"
                    style={{ animationDelay: `${i * 0.15}s`, height: `${8 + (i % 3) * 6}px` }}
                  />
                ))}
                <span className="ml-2 text-sm text-clinical-teal">{messages.capture.voice.listening}</span>
              </div>
            )}
            {!isListening && <p className="text-sm text-muted-foreground">{messages.capture.voice.tapToDictate}</p>}
          </div>
        )}

        <div className="mt-4">
          <Textarea
            aria-label={messages.capture.caseLabel}
            placeholder={messages.capture.placeholder}
            className="min-h-[100px] resize-y border-border/50 bg-transparent text-sm"
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
