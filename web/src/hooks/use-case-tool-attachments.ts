"use client";

import { useCallback, useState } from "react";
import { isFerramentasEnabled } from "@/lib/feature-flags";
import {
  readCaseAttachments,
  removeCaseAttachments,
  type CaseToolAttachment,
} from "@/lib/case-tool-link";

/**
 * CC-332 — resultados de ferramenta anexados ao caso, à espera da próxima
 * reanálise. O anexo nasce na tela da ferramenta (outra rota); ao voltar, a
 * conversa monta de novo e lê a sessão da aba. Com as Ferramentas desligadas
 * no web, não há anexo: a reanálise sai como antes.
 */
export function useCaseToolAttachments(encounterId: string) {
  const [items, setItems] = useState<CaseToolAttachment[]>(() =>
    isFerramentasEnabled() ? readCaseAttachments(encounterId) : [],
  );

  const remove = useCallback(
    (ids: readonly string[]) => setItems(removeCaseAttachments(encounterId, ids)),
    [encounterId],
  );

  return { items, remove };
}
