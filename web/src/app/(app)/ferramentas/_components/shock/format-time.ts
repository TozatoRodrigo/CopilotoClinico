const CLOCK = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Horário de um registro do roteiro ("14:05"), no fuso do aparelho. */
export function formatClock(at: number): string {
  return CLOCK.format(at);
}
