"use client";

/**
 * UX-06 — consome o SSE do plano (ADR-014: GET
 * /encounters/:id/copilot/intake/:intakeId/stream, só com o id da conversa
 * na URL — o caso nunca vai na querystring) para a análise começar a
 * dar sinal de vida em segundos, em vez do médico encarar um spinner pelo
 * tempo inteiro da inferência (reclamação direta do Dr. Gustavo comparando
 * com o concorrente: "achei que é lento... enquanto aqui, se eu responder
 * rapidão, ele já me responde").
 *
 * ESCOPO DELIBERADO — leia antes de estender:
 * O corpo do stream são fragmentos de texto (`delta`) do JSON bruto que o
 * modelo está gerando, NÃO campos estruturados parciais. Fazer parsing de
 * JSON incompleto de forma confiável (strings não fechadas, arrays em
 * progresso, aspas escapadas) é um parser não-trivial por si só — e
 * mostrar um campo clínico parcialmente errado (ex: uma red flag com
 * "action" truncada) é pior que não mostrar nada, numa ferramenta de apoio
 * a decisão clínica. Por isso este hook expõe o texto bruto acumulado
 * (`partialText`) só como sinal de "algo está acontecendo" — a revelação
 * estruturada (raciocínio, red flags, recomendações) continua acontecendo
 * de uma vez só, no evento `done`, já validado pelo backend exatamente
 * como no caminho POST não-streaming. Ver CC-02/CC-03 (Sprint 26) para o
 * porquê desse validador ser a última linha de defesa que não se abre mão.
 */
import { useCallback, useRef, useState } from "react";
import type {
  CaseUnderstanding,
  CopilotAnalyzeResponse,
  CopilotStreamEvent,
} from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/v1";

export type CopilotStreamStatus = "idle" | "streaming" | "done" | "error";

export function useCopilotStream(encounterId: string) {
  const [status, setStatus] = useState<CopilotStreamStatus>("idle");
  const [partialText, setPartialText] = useState("");
  // F1 — Etapa 1 (ADR-013): chega antes do primeiro delta quando o backend
  // roda com COPILOT_REASONING=stages. Diferente dos deltas, é estrutura já
  // validada no servidor — pode ir para a tela enquanto o plano é montado.
  const [understanding, setUnderstanding] = useState<CaseUnderstanding | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Distingue "onerror por falha real" de "onerror porque o servidor
  // fechou a conexão normalmente depois do done" — EventSource dispara
  // onerror nos dois casos, sem diferenciação nativa.
  const gotTerminalEventRef = useRef(false);

  const stop = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const open = useCallback(
    (url: string): Promise<CopilotAnalyzeResponse> => {
      return new Promise((resolve, reject) => {
        gotTerminalEventRef.current = false;
        setPartialText("");
        setUnderstanding(null);
        setStatus("streaming");

        // withCredentials: true — o access_token vive num cookie HttpOnly
        // (ver JwtStrategy), e a API roda em origem diferente do Next.js
        // em dev (CORS já configurado com credentials:true no backend).
        // Sem isto, o cookie não é enviado e a conexão cai em 401.
        const eventSource = new EventSource(url, { withCredentials: true });
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          let parsed: CopilotStreamEvent;
          try {
            parsed = JSON.parse(event.data) as CopilotStreamEvent;
          } catch {
            // Frame malformado isolado — ignora e aguarda o próximo em vez
            // de derrubar o stream inteiro por um evento.
            return;
          }

          if (parsed.type === "understanding") {
            setUnderstanding(parsed.understanding);
            return;
          }

          if (parsed.type === "delta") {
            setPartialText((prev) => prev + parsed.delta);
            return;
          }

          if (parsed.type === "done") {
            gotTerminalEventRef.current = true;
            setStatus("done");
            stop();
            resolve(parsed.result);
            return;
          }

          // parsed.type === "error"
          gotTerminalEventRef.current = true;
          setStatus("error");
          stop();
          reject(new Error(parsed.errors.join("; ") || "Falha na análise em streaming."));
        };

        eventSource.onerror = () => {
          if (gotTerminalEventRef.current) return;
          // CC-03/UX-06 — decisão deliberada: REINICIAR, não retomar. Não
          // há protocolo de resumo (Last-Event-ID) implementado no
          // backend, e deixar o EventSource reconectar sozinho geraria uma
          // segunda inferência sem o médico saber. Fecha explicitamente e
          // deixa o chamador cair para o POST /analyze não-streaming.
          setStatus("error");
          stop();
          reject(new Error("Conexão de streaming perdida."));
        };
      });
    },
    [stop],
  );

  /**
   * ADR-014 — plano a partir da conversa do Copiloto guiado. Só o id da
   * conversa vai na URL: o caso e as respostas já estão no servidor.
   */
  const startFromIntake = useCallback(
    (intakeId: string): Promise<CopilotAnalyzeResponse> =>
      open(`${BASE_URL}/encounters/${encounterId}/copilot/intake/${intakeId}/stream`),
    [encounterId, open],
  );

  return { startFromIntake, stop, status, partialText, understanding };
}
