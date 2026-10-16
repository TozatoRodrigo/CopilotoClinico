'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Callout } from '@/components/ui/callout';
import { Kbd } from '@/components/ui/kbd';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { RecordingWaveform } from '@/components/ui/recording-waveform';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { useWhisperVoice, type WhisperVoiceHook } from '@/hooks/use-whisper-voice';
import { useOnlineStatus } from '@/components/providers/offline-provider';
import { EncounterAttachments } from '@/components/domain/encounter-attachments';
import { PracticeSiteSelect } from '@/components/domain/practice-site-select';
import { ToggleTag } from '@/components/ui/toggle-tag';
import { usePracticeSites } from '@/hooks/use-practice-sites';
import type { StartCaseInput } from '@/hooks/use-case-conversation';
import type { DemoCasePreset } from '@/lib/demo-case-presets';
import {
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  Flask,
  Hospital,
  Info,
  MapPin,
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
import type { EncounterContext } from '@/lib/types';
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

type ResourceKey = 'hasCT' | 'isSus' | 'hasLab' | 'hasICU';

const RESOURCE_CHIPS: Array<{ key: ResourceKey; label: string }> = [
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
const DRAFT_KEY = (encounterId: string) => `copilot_result_${encounterId}:draft`;


export type CaseSubmitResult = 'started' | 'queued' | 'failed';

interface CaseComposerProps {
  encounterId: string;
  demoPreset: DemoCasePreset | null;
  /**
   * CC-602 — o contexto com que o caso nasceu (o local padrão, ou o que o
   * médico escolheu ao criar o caso). Antes o relato começava sempre com
   * tudo desmarcado e apagava o que fora marcado na criação.
   */
  initialContext: EncounterContext;
  sending: boolean;
  error: string | null;
  onSubmit: (input: StartCaseInput) => Promise<CaseSubmitResult>;
}

/**
 * ADR-014 — a primeira mensagem da conversa: o caso, por voz ou texto, com
 * os chips de queixa, os recursos e as red flags que o relato nem sempre diz.
 * Depois de enviado, a conversa segue no campo de baixo.
 */
export function CaseComposer({
  encounterId,
  demoPreset,
  initialContext,
  sending,
  error,
  onSubmit,
}: CaseComposerProps) {
  const { isOnline } = useOnlineStatus();
  const messages = useMessages();

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
  const [context, setContext] = useState<EncounterContext>(initialContext);
  const sitesQuery = usePracticeSites();
  const [redFlags, setRedFlags] = useState<Record<string, boolean>>({});
  const [isMac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  );

  // S21-VOICE-03 — Hook Whisper (MediaRecorder + upload para /audio/transcribe).
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

  // S23-CLIN-02 — autosave do rascunho com debounce 500ms, para não perder o
  // ditado numa interrupção de plantão. Limpo depois do envio.
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

  function toggleContext(key: ResourceKey) {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleRedFlag(key: string) {
    setRedFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /**
   * S23-CLIN-01 — Templates funcionais (sem tap morto): sempre insere —
   * append com separador se já há texto, substitui se vazio.
   */
  function applyTemplate(template: string) {
    setCaseText((prev) => {
      if (!prev.trim()) {
        return template + ': ';
      }
      const sep = prev.endsWith('\n') ? '' : '\n';
      return `${prev}${sep}${template}: `;
    });
    toast.success(messages.capture.templateApplied(template));
  }

  async function handleSubmit() {
    if (!isValid || sending) return;
    // A conversa troca de tela enquanto lê o caso; se o envio falhar, o
    // editor volta com o texto (o autosave pode não ter rodado ainda).
    sessionStorage.setItem(DRAFT_KEY(encounterId), caseText);
    const result = await onSubmit({
      caseText: caseText.trim(),
      context,
      redFlags,
      demoCase: demoPreset?.slug,
    });
    if (result !== 'failed') sessionStorage.removeItem(DRAFT_KEY(encounterId));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        size="compact"
        title={messages.conversation.title}
        description={messages.conversation.description}
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
            disabled={sending}
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
            disabled={sending}
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
          {/* CC-602 — o local do plantão: vem do padrão das Configurações
              e troca aqui, junto com os recursos que ele marca. */}
          <PropertyRow icon={MapPin} label="Local" className="max-sm:grid-cols-1 max-sm:gap-0">
            <PracticeSiteSelect
              id="case-site"
              sites={sitesQuery.data ?? []}
              context={context}
              onChange={setContext}
              disabled={sending}
            />
          </PropertyRow>
          <PropertyRow
            icon={Hospital}
            label={messages.capture.resources}
            className="max-sm:grid-cols-1 max-sm:gap-0"
          >
            <div role="group" aria-label={messages.capture.resources} className="flex flex-wrap gap-1.5">
              {RESOURCE_CHIPS.map((chip) => {
                const active = context[chip.key];
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
            {/* S23-CLIN-04 — chips diferenciados por severidade clínica. */}
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

      {/* Barra de ação fixa no rodapé da página. No mobile fica acima da
          barra de abas do shell (altura dela + safe area). */}
      <div className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 -mt-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 md:bottom-0 md:mx-0 md:px-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
            <CaptureStatus
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
          <Button size="lg" disabled={!isValid || sending} onClick={handleSubmit} className="shrink-0">
            {sending ? (
              <>
                <Spinner className="animate-spin" />
                {messages.conversation.sendingCase}
              </>
            ) : (
              <>
                <Sparkle weight="fill" />
                {messages.conversation.sendCase}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
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
 * Linha de status da barra de ação, por prioridade: streaming → offline →
 * rascunho recuperado → validação do texto.
 */
function CaptureStatus({
  offline,
  draftRestored,
  isValid,
  charCount,
  messages,
}: {
  offline: boolean;
  draftRestored: boolean;
  isValid: boolean;
  charCount: number;
  messages: Messages;
}) {
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
