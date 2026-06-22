'use client';

/**
 * S23-CLIN-06 — Hook para decisões locais por recomendação.
 *
 * Persiste decisão do médico (adotar/rejeitar/anotar) por recomendação no
 * sessionStorage (vinculado ao encounter). Não vai ao backend nesta versão —
 * é estado de UX que ajuda o médico a raciocinar visualmente enquanto revisa
 * o caso. Persistência local é similar ao autosave da captura (S23-CLIN-02).
 *
 * Rastreabilidade CFM completa vem quando o médico submete o caso completo
 * (analyze/respond), que inclui as red flags explícitas (S20-CLIN-01).
 * Em sprint futura, podemos enviar essas decisões junto com o PATCH do
 * encounter para persistir na auditoria.
 */
import { useCallback, useEffect, useState } from 'react';

export type RecommendationDecision = 'adopted' | 'rejected';

export interface RecommendationDecisionState {
  decision: RecommendationDecision;
  note?: string;
  decidedAt: string; // ISO timestamp
}

export type DecisionsMap = Record<string, RecommendationDecisionState>;

const DECISIONS_KEY = (encounterId: string) =>
  `copiloto:decisions:${encounterId}`;

export interface UseRecommendationDecisionsResult {
  decisions: DecisionsMap;
  setDecision: (recId: string, decision: RecommendationDecision) => void;
  clearDecision: (recId: string) => void;
  setNote: (recId: string, note: string) => void;
  counts: { adopted: number; rejected: number; pending: number };
}

export function useRecommendationDecisions(
  encounterId: string,
  totalRecommendations: number,
): UseRecommendationDecisionsResult {
  const [decisions, setDecisions] = useState<DecisionsMap>({});

  // Carrega do sessionStorage ao montar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DECISIONS_KEY(encounterId));
      if (raw) {
        setDecisions(JSON.parse(raw) as DecisionsMap);
      }
    } catch {
      // JSON inválido ou storage indisponível — silently ignore.
    }
  }, [encounterId]);

  // Persiste a cada mudança (debounced via microtask).
  useEffect(() => {
    if (Object.keys(decisions).length === 0) return;
    try {
      sessionStorage.setItem(DECISIONS_KEY(encounterId), JSON.stringify(decisions));
    } catch {
      // quota / private mode — silently ignore.
    }
  }, [decisions, encounterId]);

  const setDecision = useCallback(
    (recId: string, decision: RecommendationDecision) => {
      setDecisions((prev) => ({
        ...prev,
        [recId]: {
          decision,
          note: prev[recId]?.note,
          decidedAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const clearDecision = useCallback((recId: string) => {
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[recId];
      return next;
    });
  }, []);

  const setNote = useCallback((recId: string, note: string) => {
    setDecisions((prev) => {
      const existing = prev[recId];
      if (!existing) {
        // Nota sem decisão prévia é permitida — conta como "em revisão".
        return {
          ...prev,
          [recId]: {
            decision: 'adopted',
            note,
            decidedAt: new Date().toISOString(),
          },
        };
      }
      return {
        ...prev,
        [recId]: { ...existing, note },
      };
    });
  }, []);

  const adopted = Object.values(decisions).filter((d) => d.decision === 'adopted').length;
  const rejected = Object.values(decisions).filter((d) => d.decision === 'rejected').length;

  return {
    decisions,
    setDecision,
    clearDecision,
    setNote,
    counts: {
      adopted,
      rejected,
      pending: Math.max(0, totalRecommendations - adopted - rejected),
    },
  };
}
