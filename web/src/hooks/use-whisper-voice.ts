'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import { messages } from '@/lib/messages';

/**
 * S21-VOICE-03 — Hook de gravação de voz com Whisper no backend.
 *
 * Substitui o `useVoiceInput` (que dependia de `webkitSpeechRecognition`,
 * não suportado em iOS Safari e Firefox). Usa `MediaRecorder` (suporte
 * amplo iOS Safari 14.5+, Chrome, Firefox) + upload para o endpoint
 * síncrono `/audio/transcribe`.
 *
 * Fluxo:
 *   1. `start(onTranscript)` → pede permissão do microfone e inicia gravação
 *   2. `stop()` → para gravação, faz upload, chama `onTranscript(texto)`
 *   3. `cancel()` → para gravação sem enviar (descarta o áudio)
 *
 * Estados: idle → recording → uploading → done | error
 *
 * Não persiste áudio localmente (LGPD minimização) — o backend também não
 * persiste (apenas hash para rastreabilidade CFM, ver S21-VOICE-02/06).
 */

export type VoiceStatus = 'idle' | 'recording' | 'uploading' | 'error';

export interface WhisperVoiceHook {
  /** Estado atual do hook. */
  status: VoiceStatus;
  /** Compat com uso existente — true quando gravando. */
  isListening: boolean;
  /** True durante upload da transcrição (spinner). */
  isUploading: boolean;
  /** Decorrido em milissegundos desde o início da gravação. */
  elapsedMs: number;
  /** Nível de áudio atual (0..1) para waveform. Null se não gravando. */
  audioLevel: number | null;
  /** Mensagem de erro localizada (pt-BR), ou null. */
  error: string | null;
  /** MediaRecorder é suportado neste navegador? */
  isSupported: boolean;
  /** Inicia gravação. `onTranscript` é chamado quando a transcrição chega. */
  start: (onTranscript: (text: string) => void) => void;
  /** Para gravação e envia para transcrição. */
  stop: () => void;
  /** Para gravação e descarta o áudio (não envia). */
  cancel: () => void;
}

interface TranscribeResponse {
  text: string;
  model: string;
  audioHash: string;
  durationMs: number;
}

const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutos — limite de segurança
const TICK_INTERVAL_MS = 100;

function pickSupportedMimeType(): string | null {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return null;
  // Ordem de preferência — opus em webm (Chrome/Firefox) e mp4 (iOS Safari).
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4', // iOS Safari
    'audio/ogg;codecs=opus',
    'audio/mpeg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function useWhisperVoice(): WhisperVoiceHook {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const mimeRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortedRef = useRef(false);

  const isSupported =
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const cleanupStream = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    setAudioLevel(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      // Mount-only cleanup: interrompe gravação pendente ao desmontar.
      abortedRef.current = true;
      cleanupStream();
    };
  }, [cleanupStream]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // RMS simples para estimar volume (0..1).
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 2));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext pode falhar em alguns contextos; não é crítico —
      // gravação funciona sem medidor de nível.
    }
  }, []);

  const upload = useCallback(
    async (blob: Blob, mimeType: string) => {
      abortedRef.current = false;
      setStatus('uploading');
      setError(null);

      const arrayBuffer = await blob.arrayBuffer();
      const data = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer)),
      );

      try {
        const result = await apiClient.post<TranscribeResponse>('/audio/transcribe', {
          mimeType,
          sizeBytes: blob.size,
          data,
        });
        if (abortedRef.current) return; // componente desmontou
        const text = result.text.trim();
        if (text) {
          onTranscriptRef.current?.(text);
        } else {
          setError(messages.capture.voice.emptyTranscript);
        }
        setStatus('idle');
      } catch (err) {
        if (abortedRef.current) return;
        // S21-VOICE-05 — fallback gracioso
        const msg =
          err instanceof ApiError
            ? err.status === 429
              ? messages.capture.voice.rateLimited
              : err.status >= 500
                ? messages.capture.voice.serverError
                : err.message
            : messages.capture.voice.networkError;
        setError(msg);
        setStatus('error');
      }
    },
    [],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupStream();
      setStatus('idle');
      return;
    }

    // Coleta final + upload quando o recorder emite `onstop`.
    recorder.onstop = () => {
      const mime = mimeRef.current ?? 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      cleanupStream();
      if (blob.size === 0) {
        setError(messages.capture.voice.emptyRecording);
        setStatus('error');
        return;
      }
      void upload(blob, mime);
    };

    try {
      recorder.stop();
    } catch {
      // recorder já parado — força cleanup
      cleanupStream();
      setStatus('idle');
    }
  }, [cleanupStream, upload]);

  const cancel = useCallback(() => {
    abortedRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        // noop
      }
    }
    chunksRef.current = [];
    onTranscriptRef.current = null;
    cleanupStream();
    setStatus('idle');
    setElapsedMs(0);
  }, [cleanupStream]);

  const start = useCallback(
    (onTranscript: (text: string) => void) => {
      if (recorderRef.current) return; // já gravando
      if (!isSupported) {
        setError(messages.capture.voice.unsupportedDescription);
        setStatus('error');
        return;
      }

      const mimeType = pickSupportedMimeType();
      if (!mimeType) {
        setError(messages.capture.voice.unsupportedDescription);
        setStatus('error');
        return;
      }

      setError(null);
      setElapsedMs(0);
      chunksRef.current = [];
      onTranscriptRef.current = onTranscript;
      mimeRef.current = mimeType;
      abortedRef.current = false;

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream, { mimeType });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };
          recorder.onerror = () => {
            setError(messages.capture.voice.recordingError);
            setStatus('error');
            cleanupStream();
          };
          recorder.start();
          recorderRef.current = recorder;
          startedAtRef.current = Date.now();
          setStatus('recording');

          // Timer + auto-stop no limite de segurança.
          tickRef.current = setInterval(() => {
            const elapsed = Date.now() - startedAtRef.current;
            setElapsedMs(elapsed);
            if (elapsed >= MAX_RECORDING_MS) {
              stop();
            }
          }, TICK_INTERVAL_MS);

          startLevelMeter(stream);
        })
        .catch((err: unknown) => {
          const errName = (err as { name?: string }).name;
          if (errName === 'NotAllowedError' || errName === 'SecurityError') {
            setError(messages.capture.voice.micDenied);
          } else if (errName === 'NotFoundError') {
            setError(messages.capture.voice.micNotFound);
          } else {
            setError(messages.capture.voice.recordingError);
          }
          setStatus('error');
          cleanupStream();
        });
    },
    [cleanupStream, isSupported, startLevelMeter, stop],
  );

  return {
    status,
    isListening: status === 'recording',
    isUploading: status === 'uploading',
    elapsedMs,
    audioLevel,
    error,
    isSupported,
    start,
    stop,
    cancel,
  };
}
