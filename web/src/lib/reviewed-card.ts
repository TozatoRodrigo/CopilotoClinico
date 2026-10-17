/**
 * CC-408 — "Revisado por" de um cartão revisado: a mesma data e o mesmo CRM
 * na tela do plano e na página do cartão.
 */

/** dd/mm/aaaa no fuso de Brasília — a data que o revisor viu ao assinar. */
export function formatReviewDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "Dr(a). Ana Souza", ou `null` quando o revisor não tem nome cadastrado. */
export function reviewerName(name: string | null): string | null {
  return name ? `Dr(a). ${name}` : null;
}

/** "123456/SP". */
export function reviewerCrm(reviewer: { crmNumber: string; crmUf: string }): string {
  return `${reviewer.crmNumber}/${reviewer.crmUf}`;
}

/** Página do cartão — o link do "Revisado por". */
export function reviewedCardHref(cardId: string): string {
  return `/cartoes/${cardId}`;
}
