"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceInputReturn {
  isListening: boolean;
  startListening: (onTranscript: (text: string) => void) => void;
  stopListening: () => void;
  isSupported: boolean;
  error: string | null;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);

  const isSupported = typeof window !== "undefined" && getSpeechRecognition() !== null;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    onTranscriptRef.current = null;
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      const SpeechRecognitionCtor = getSpeechRecognition();
      if (!SpeechRecognitionCtor) {
        setError("Reconhecimento de voz não suportado neste navegador.");
        return;
      }

      setError(null);
      onTranscriptRef.current = onTranscript;

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "pt-BR";
      recognition.maxAlternatives = 1;

      let finalTranscript = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        onTranscriptRef.current?.(finalTranscript + interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed") {
          setError("Permissão de microfone negada.");
        } else if (event.error === "no-speech") {
          setError("Nenhuma fala detectada.");
        } else {
          setError(`Erro no reconhecimento: ${event.error}`);
        }
        setIsListening(false);
        recognitionRef.current = null;
        onTranscriptRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        onTranscriptRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    startListening,
    stopListening,
    isSupported,
    error,
  };
}
