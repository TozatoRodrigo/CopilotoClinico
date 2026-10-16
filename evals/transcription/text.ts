/**
 * CC-205 — WER e CER com a normalização usual de avaliação de ASR: caixa e
 * pontuação não contam como erro, e acento conta só quando pedido. Número e
 * unidade ficam como o modelo escreveu ("120" e "cento e vinte" são palavras
 * diferentes aqui); a leitura clínica deles é medida à parte, em clinical.ts.
 */

export interface NormalizeOptions {
  /** `true`: "sódio" e "sodio" são a mesma palavra. */
  ignoreAccents: boolean;
}

export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeForWer(text: string, { ignoreAccents }: NormalizeOptions): string {
  const lowered = text.normalize('NFC').toLowerCase();
  return (
    (ignoreAccents ? stripAccents(lowered) : lowered)
      .replace(/[^\p{L}\p{N}\p{M},.]+/gu, ' ')
      // Vírgula e ponto só ficam entre dígitos: "0,5" é um número, "dor, febre" não.
      .replace(/(?<!\p{N})[.,]|[.,](?!\p{N})/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export interface EditCounts {
  substitutions: number;
  deletions: number;
  insertions: number;
}

/** Erros de edição contra uma referência de `referenceLength` itens. */
export interface ErrorCount extends EditCounts {
  errors: number;
  referenceLength: number;
}

/** Uma linha da matriz de Levenshtein: custo e a conta de cada tipo de erro. */
class Row {
  readonly cost: Int32Array;
  readonly substitutions: Int32Array;
  readonly deletions: Int32Array;
  readonly insertions: Int32Array;

  constructor(length: number) {
    this.cost = new Int32Array(length);
    this.substitutions = new Int32Array(length);
    this.deletions = new Int32Array(length);
    this.insertions = new Int32Array(length);
  }

  copy(to: number, from: Row, at: number, change: keyof EditCounts | null): void {
    this.cost[to] = (from.cost[at] ?? 0) + (change === null ? 0 : 1);
    this.substitutions[to] = (from.substitutions[at] ?? 0) + (change === 'substitutions' ? 1 : 0);
    this.deletions[to] = (from.deletions[at] ?? 0) + (change === 'deletions' ? 1 : 0);
    this.insertions[to] = (from.insertions[at] ?? 0) + (change === 'insertions' ? 1 : 0);
  }
}

/**
 * Levenshtein com a conta de cada tipo de erro. Duas linhas de memória: um
 * ditado de 2 minutos tem ~2 mil caracteres, e a matriz inteira seria grande.
 * Empate entre caminhos prefere substituição, depois omissão.
 */
export function editCounts<T>(reference: readonly T[], hypothesis: readonly T[]): EditCounts {
  const width = hypothesis.length + 1;
  let previous = new Row(width);
  let current = new Row(width);
  for (let j = 0; j < width; j++) {
    previous.cost[j] = j;
    previous.insertions[j] = j;
  }

  for (let i = 1; i <= reference.length; i++) {
    current.cost[0] = i;
    current.substitutions[0] = 0;
    current.deletions[0] = i;
    current.insertions[0] = 0;
    for (let j = 1; j < width; j++) {
      const same = reference[i - 1] === hypothesis[j - 1];
      const diagonal = (previous.cost[j - 1] ?? 0) + (same ? 0 : 1);
      const deletion = (previous.cost[j] ?? 0) + 1;
      const insertion = (current.cost[j - 1] ?? 0) + 1;
      if (diagonal <= deletion && diagonal <= insertion) {
        current.copy(j, previous, j - 1, same ? null : 'substitutions');
      } else if (deletion <= insertion) {
        current.copy(j, previous, j, 'deletions');
      } else {
        current.copy(j, current, j - 1, 'insertions');
      }
    }
    [previous, current] = [current, previous];
  }

  const last = width - 1;
  return {
    substitutions: previous.substitutions[last] ?? 0,
    deletions: previous.deletions[last] ?? 0,
    insertions: previous.insertions[last] ?? 0,
  };
}

function countErrors<T>(reference: readonly T[], hypothesis: readonly T[]): ErrorCount {
  const counts = editCounts(reference, hypothesis);
  return {
    ...counts,
    errors: counts.substitutions + counts.deletions + counts.insertions,
    referenceLength: reference.length,
  };
}

function words(text: string): string[] {
  return text === '' ? [] : text.split(' ');
}

export function wordErrors(
  reference: string,
  hypothesis: string,
  options: NormalizeOptions,
): ErrorCount {
  return countErrors(
    words(normalizeForWer(reference, options)),
    words(normalizeForWer(hypothesis, options)),
  );
}

/** CER sobre o texto normalizado, espaços incluídos (palavra colada conta). */
export function charErrors(
  reference: string,
  hypothesis: string,
  options: NormalizeOptions,
): ErrorCount {
  return countErrors(
    Array.from(normalizeForWer(reference, options)),
    Array.from(normalizeForWer(hypothesis, options)),
  );
}

/** Soma de vários arquivos: a taxa do corpus pesa cada arquivo pelo tamanho. */
export function sumErrors(counts: readonly ErrorCount[]): ErrorCount {
  return counts.reduce<ErrorCount>(
    (total, count) => ({
      substitutions: total.substitutions + count.substitutions,
      deletions: total.deletions + count.deletions,
      insertions: total.insertions + count.insertions,
      errors: total.errors + count.errors,
      referenceLength: total.referenceLength + count.referenceLength,
    }),
    { substitutions: 0, deletions: 0, insertions: 0, errors: 0, referenceLength: 0 },
  );
}

/** Taxa de erro (WER/CER); `null` sem referência. Pode passar de 1 com inserções. */
export function errorRate({ errors, referenceLength }: ErrorCount): number | null {
  return referenceLength === 0 ? null : errors / referenceLength;
}
