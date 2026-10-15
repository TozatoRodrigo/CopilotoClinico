"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowUp, Microphone, Spinner, Stop } from "@phosphor-icons/react";
import { Textarea } from "@/components/ui/textarea";
import { RecordingWaveform } from "@/components/ui/recording-waveform";
import { useWhisperVoice } from "@/hooks/use-whisper-voice";
import { useMessages } from "@/lib/messages/use-messages";
import type { IntakeAnswerChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationComposerProps {
  placeholder: string;
  disabled: boolean;
  /** `true` quando a mensagem foi aceita; só então o campo limpa o texto. */
  onSend: (text: string, channel: IntakeAnswerChannel) => boolean | Promise<boolean>;
  /** Linha acima do campo: progresso das perguntas e "Analisar agora". */
  meta?: ReactNode;
  /** Pede o foco ao abrir (ex.: "Corrigir"). */
  autoFocus?: boolean;
}

/**
 * ADR-014 — o campo de baixo da conversa: responde a pergunta da vez com as
 * próprias palavras, corrige o entendimento ou acrescenta algo ao caso
 * depois do plano. O ditado entra no campo para o médico conferir antes de
 * enviar; Enter envia, Shift+Enter quebra a linha.
 */
export function ConversationComposer({
  placeholder,
  disabled,
  onSend,
  meta,
  autoFocus,
}: ConversationComposerProps) {
  const messages = useMessages();
  const copy = messages.conversation.composer;
  const inputId = useId();
  const whisper = useWhisperVoice();
  const [text, setText] = useState("");
  const [dictated, setDictated] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (whisper.error) toast.error(whisper.error);
  }, [whisper.error]);

  const canSend = !disabled && !sending && text.trim().length > 0 && !whisper.isListening;

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const accepted = await onSend(text.trim(), dictated ? "voice" : "text");
      if (!accepted) return;
      setText("");
      setDictated(false);
    } finally {
      setSending(false);
    }
  }

  function toggleDictation() {
    if (whisper.isUploading) return;
    if (whisper.isListening) {
      whisper.stop();
      return;
    }
    whisper.start((transcript) => {
      setDictated(true);
      setText((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {meta && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
          {meta}
        </div>
      )}
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border bg-background p-1.5 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/20",
          whisper.isListening ? "border-transparent bg-tone-blue-bg" : "border-input",
        )}
      >
        {whisper.isSupported && (
          <button
            type="button"
            onClick={toggleDictation}
            disabled={disabled || whisper.isUploading}
            aria-label={
              whisper.isListening
                ? copy.stopDictation
                : whisper.isUploading
                  ? copy.transcribing
                  : copy.dictate
            }
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50",
              whisper.isListening
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-hover hover:text-foreground",
            )}
          >
            {whisper.isListening ? (
              <Stop className="size-4" weight="fill" />
            ) : whisper.isUploading ? (
              <Spinner className="size-4 animate-spin" />
            ) : (
              <Microphone className="size-5" weight="fill" />
            )}
          </button>
        )}
        {whisper.isListening ? (
          <div className="flex min-h-10 flex-1 items-center gap-2 px-1 text-sm text-tone-blue-ink">
            <RecordingWaveform active className="h-5 text-tone-blue" />
            <span>{copy.stopDictation}</span>
          </div>
        ) : (
          <>
            <label htmlFor={inputId} className="sr-only">
              {placeholder}
            </label>
            <Textarea
              id={inputId}
              rows={1}
              autoFocus={autoFocus}
              value={text}
              placeholder={whisper.isUploading ? copy.transcribing : placeholder}
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[0.9375rem] shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </>
        )}
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label={copy.send}
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-[var(--brand-hover)] focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-40"
        >
          <ArrowUp className="size-5" weight="bold" />
        </button>
      </div>
    </div>
  );
}
