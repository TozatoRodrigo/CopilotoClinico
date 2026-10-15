/**
 * Flags de build do web. `NEXT_PUBLIC_*` é embutida no bundle no `next build`
 * (o Next troca o acesso literal pelo valor), então mudar exige rebuild.
 * Funções, e não constantes, para os testes poderem trocar o valor com
 * `vi.stubEnv` depois do import.
 */

/**
 * ADR-017 — área Ferramentas (calculadoras e roteiros de beira-leito do ANY).
 * Desligada por padrão até a cessão do ANY (CC-301) e a revisão clínica
 * (CC-310). Só `on` liga.
 */
export function isFerramentasEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FERRAMENTAS === 'on';
}
