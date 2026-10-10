/**
 * Paleta de cores do Notion como tipo. Cada tom tem quatro usos:
 *  - `text`: texto/ícone colorido (≥ 4.5:1 sobre o fundo da página)
 *  - `bg`:   fundo de bloco (callout, destaque de linha)
 *  - `tag`:  fundo de tag/seleção (pílula)
 *  - `ink`:  texto sobre `bg`/`tag` (AA ≥ 10:1)
 *
 * Semântica clínica fixa (docs/design-system.md): `orange` = muda a conduta,
 * `green` = conduta confirmada, `red` = erro/risco crítico, `blue` = ação/IA.
 * Categorias sem significado clínico usam gray/brown/purple/pink/yellow.
 *
 * As classes são strings literais completas para o Tailwind detectá-las.
 */
export const TONES = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

export type Tone = (typeof TONES)[number];

export const toneText: Record<Tone, string> = {
  gray: 'text-tone-gray',
  brown: 'text-tone-brown',
  orange: 'text-tone-orange',
  yellow: 'text-tone-yellow',
  green: 'text-tone-green',
  blue: 'text-tone-blue',
  purple: 'text-tone-purple',
  pink: 'text-tone-pink',
  red: 'text-tone-red',
};

export const toneBg: Record<Tone, string> = {
  gray: 'bg-tone-gray-bg',
  brown: 'bg-tone-brown-bg',
  orange: 'bg-tone-orange-bg',
  yellow: 'bg-tone-yellow-bg',
  green: 'bg-tone-green-bg',
  blue: 'bg-tone-blue-bg',
  purple: 'bg-tone-purple-bg',
  pink: 'bg-tone-pink-bg',
  red: 'bg-tone-red-bg',
};

export const toneTag: Record<Tone, string> = {
  gray: 'bg-tone-gray-tag text-tone-gray-ink',
  brown: 'bg-tone-brown-tag text-tone-brown-ink',
  orange: 'bg-tone-orange-tag text-tone-orange-ink',
  yellow: 'bg-tone-yellow-tag text-tone-yellow-ink',
  green: 'bg-tone-green-tag text-tone-green-ink',
  blue: 'bg-tone-blue-tag text-tone-blue-ink',
  purple: 'bg-tone-purple-tag text-tone-purple-ink',
  pink: 'bg-tone-pink-tag text-tone-pink-ink',
  red: 'bg-tone-red-tag text-tone-red-ink',
};

export const toneInk: Record<Tone, string> = {
  gray: 'text-tone-gray-ink',
  brown: 'text-tone-brown-ink',
  orange: 'text-tone-orange-ink',
  yellow: 'text-tone-yellow-ink',
  green: 'text-tone-green-ink',
  blue: 'text-tone-blue-ink',
  purple: 'text-tone-purple-ink',
  pink: 'text-tone-pink-ink',
  red: 'text-tone-red-ink',
};
