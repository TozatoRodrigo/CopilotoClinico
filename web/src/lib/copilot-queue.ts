import { apiClient } from "@/lib/api-client";
import { processQueue } from "@/lib/offline-queue";
import type { CopilotAnalyzeResponse } from "@/lib/types";

export interface RespondedEncounter {
  encounterId: string;
  result: CopilotAnalyzeResponse;
}

export interface SyncResult {
  processed: number;
  failed: number;
  respondedEncounters: RespondedEncounter[];
}

/**
 * Sends every queued offline item (analyze or respond) to the API.
 * Returns the results of any "respond" items so callers can refresh
 * an in-progress conversation with the refined analysis.
 */
export async function syncOfflineQueue(): Promise<SyncResult> {
  const respondedEncounters: RespondedEncounter[] = [];

  const { processed, failed } = await processQueue(async (item) => {
    try {
      if (item.type === "respond") {
        const result = await apiClient.post<CopilotAnalyzeResponse>(
          `/encounters/${item.encounterId}/copilot/respond`,
          { interactionId: item.interactionId, answers: item.answers },
        );
        respondedEncounters.push({ encounterId: item.encounterId, result });
      } else {
        await apiClient.post<CopilotAnalyzeResponse>(
          `/encounters/${item.encounterId}/copilot/analyze`,
          // S20-CLIN-01 — envia redFlags explícitas ao sincronizar fila offline.
          { caseText: item.caseText, context: item.context, redFlags: item.redFlags },
        );
      }
      return { success: true, encounterId: item.encounterId };
    } catch {
      return { success: false, encounterId: item.encounterId };
    }
  });

  return { processed, failed, respondedEncounters };
}
