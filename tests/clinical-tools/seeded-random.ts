/**
 * Gerador de entradas com semente fixa para os testes diferenciais (ADR-017).
 * Mulberry32: pequeno, sem dependência e reprodutível — a mesma semente gera
 * os mesmos 1.000 casos em qualquer máquina, então uma divergência sempre se
 * reproduz pelo índice do caso.
 */
export interface SeededRandom {
  /** Uniforme em [0, 1). */
  next(): number;
  /** Inteiro uniforme em [min, max], limites incluídos. */
  integer(min: number, max: number): number;
  /** Valor da grade min, min+step, …, max (como o médico digitaria). */
  onGrid(min: number, max: number, step: number): number;
  pick<T>(values: readonly T[]): T;
}

export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    integer,
    onGrid(min, max, step) {
      const steps = Math.round((max - min) / step);
      // Arredonda para as casas do passo: 0.1 * 3 não pode virar 0.30000000000000004.
      const decimals = (String(step).split('.')[1] ?? '').length;
      return Number((min + integer(0, steps) * step).toFixed(decimals));
    },
    pick(values) {
      const value = values[integer(0, values.length - 1)];
      if (value === undefined) throw new Error('pick em lista vazia');
      return value;
    },
  };
}

/** Quantidade de entradas aleatórias por função portada (CC-303). */
export const DIFFERENTIAL_CASES = 1000;
