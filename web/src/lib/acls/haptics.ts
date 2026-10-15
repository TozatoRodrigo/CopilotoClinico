/**
 * Vibração do ACLS, quando o aparelho tem (Android; o Safari do iPhone não
 * implementa `navigator.vibrate`). Os padrões do ANY: 500 ms no fim do
 * ciclo, curto-curto ao registrar epinefrina, 200 ms no choque. A epinefrina
 * vencida (aviso novo do CC-313) usa um padrão próprio, para não confundir
 * com o fim do ciclo.
 */
export const ACLS_VIBRATION = {
  cycleEnd: [500],
  epinephrineDue: [300, 100, 300],
  epinephrineGiven: [100, 50, 100],
  shock: [200],
} as const satisfies Record<string, readonly number[]>;

export function vibrate(pattern: readonly number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([...pattern]);
    }
  } catch {
    /* sem permissão ou sem motor de vibração */
  }
}
