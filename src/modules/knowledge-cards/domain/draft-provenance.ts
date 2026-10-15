import { sha256Hex } from '../../audit/audit-hash';
import { normalizeForCitation } from './citation-check';

/**
 * CC-412 (ADR-017) — anti-circularidade: um caso do gabarito e um cartão não
 * podem nascer do mesmo rascunho. Se nascerem, o gabarito mede o Copiloto
 * contra ele mesmo — o problema do gabarito v1, em que casos e base saíram da
 * mesma fonte e a nota subiu sem o Copiloto melhorar.
 *
 * A origem de um rascunho tem duas impressões digitais:
 * - `draftId`: o pedido de rascunho (`knowledge_card_drafts.id`);
 * - `sourceContentSha256`: o conteúdo de origem, os trechos de fonte
 *   entregues ao modelo. Pega o mesmo material reaproveitado num pedido novo
 *   (outro id, mesmos trechos).
 */

export interface DraftOrigin {
  draftId: string;
  sourceContentSha256: string;
}

/** SHA-256 do texto exato de um chunk: fixa o que as citações conferiram. */
export function chunkTextSha256(text: string): string {
  return sha256Hex(text);
}

/**
 * Impressão digital do conteúdo de origem: independe da ordem dos trechos e
 * de diferenças de acento, caixa e espaço (a mesma normalização da checagem
 * de citação). Trecho repetido conta uma vez.
 */
export function sourceContentSha256(sourceTexts: readonly string[]): string {
  const digests = [
    ...new Set(sourceTexts.map((text) => sha256Hex(normalizeForCitation(text)))),
  ].sort();
  return sha256Hex(digests.join('\n'));
}

export interface GoldCaseOrigin {
  caseId: string;
  origin: DraftOrigin;
}

/** Uma versão de cartão que saiu de um rascunho de IA. */
export interface CardOrigin {
  cardId: string;
  version: number;
  origin: DraftOrigin;
}

export interface CircularOrigin {
  caseId: string;
  cardId: string;
  draftId: string;
  matchedBy: 'draft_id' | 'source_content';
}

const sameHex = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/**
 * Pares (caso do gabarito, cartão) com a mesma origem, um por par. O mesmo
 * id de rascunho tem precedência sobre o mesmo conteúdo de origem no motivo.
 */
export function findCircularOrigins(
  goldCases: readonly GoldCaseOrigin[],
  cards: readonly CardOrigin[],
): CircularOrigin[] {
  const found = new Map<string, CircularOrigin>();
  for (const goldCase of goldCases) {
    for (const card of cards) {
      const matchedBy = sameHex(goldCase.origin.draftId, card.origin.draftId)
        ? 'draft_id'
        : sameHex(goldCase.origin.sourceContentSha256, card.origin.sourceContentSha256)
          ? 'source_content'
          : null;
      if (!matchedBy) continue;
      const key = `${goldCase.caseId}\u0000${card.cardId}`;
      const previous = found.get(key);
      if (previous && (previous.matchedBy === 'draft_id' || matchedBy === 'source_content')) {
        continue;
      }
      found.set(key, {
        caseId: goldCase.caseId,
        cardId: card.cardId,
        draftId: card.origin.draftId,
        matchedBy,
      });
    }
  }
  return [...found.values()];
}

/** Uma linha por par circular, para o CI e o terminal. */
export function describeCircularOrigin(circular: CircularOrigin): string {
  const reason =
    circular.matchedBy === 'draft_id' ? 'mesmo rascunho' : 'mesmo conteúdo de origem do rascunho';
  return `caso ${circular.caseId} × cartão ${circular.cardId}: ${reason} (${circular.draftId})`;
}
