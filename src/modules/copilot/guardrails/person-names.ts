import { protectClinicalTerms, type TextSpan } from './protected-clinical-terms';

/**
 * CC-206 — apelidos e tratamentos. A regex não reconhece nome solto (isso é
 * do modelo local, CC-203); reconhece o nome que vem depois de um tratamento
 * ("Seu Zé", "Dona Cida", "Sr. João da Silva", "Dra. Ana") e o apelido
 * curto que o modelo deixa passar ("Tião", "Zé").
 *
 * Só palavra com inicial maiúscula e o resto minúsculo conta como nome: "dona
 * de casa", "seu filho" e "Seu ECG" ficam. "seu" minúsculo é possessivo ("seu
 * Rivotril"), por isso só "Seu" com maiúscula é tratamento. Todo trecho passa
 * pela lista de termos clínicos protegidos (CC-202): "Seu Holter" fica.
 */

/** Hipocorísticos comuns que o modelo não pega. Fora: os que também são palavra ("Nenê", "Preta"). */
export const NICKNAMES = [
  'Zé',
  'Zezinho',
  'Zezé',
  'Zeca',
  'Zequinha',
  'Tião',
  'Tiãozinho',
  'Bastião',
  'Chico',
  'Chiquinho',
  'Chica',
  'Toninho',
  'Tonho',
  'Tonha',
  'Tonico',
  'Tunico',
  'Juca',
  'Mané',
  'Neco',
  'Dinho',
  'Juninho',
  'Quinho',
  'Nando',
  'Beto',
  'Guto',
  'Kiko',
  'Dudu',
  'Duda',
  'Didi',
  'Dida',
  'Dedé',
  'Nena',
  'Cida',
  'Cidinha',
  'Lurdinha',
  'Carminha',
  'Teca',
  'Bia',
  'Bel',
  'Bebel',
  'Nanda',
  'Malu',
  'Manu',
  'Mari',
  'Tati',
  'Paty',
  'Gabi',
  'Dani',
  'Juju',
  'Lili',
  'Lulu',
  'Vivi',
  'Cacá',
  'Fafá',
  'Tatá',
  'Lelê',
  'Jô',
  'Gugu',
  'Bené',
  'Nonô',
  'Vavá',
] as const;

const NAME_WORD = String.raw`\p{Lu}\p{Ll}+(?:[-'’]\p{Lu}?\p{Ll}+)*`;
/** Nome com sobrenome: "João Pedro", "Maria das Dores", "Ana Paula dos Santos". */
const NAME_SEQUENCE = String.raw`${NAME_WORD}(?:\s+(?:(?:da|de|do|das|dos)\s+)?${NAME_WORD})*`;
const HONORIFIC = String.raw`Seu|[Dd]ona|[Ss]enhora?|[Dd]outora?|[Ss]rta|[Ss]ra?|[Dd]ra?`;

const HONORIFIC_NAME = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${HONORIFIC})(?:\.\s*|\s+)(?<name>${NAME_SEQUENCE})`,
  'gdu',
);
const NICKNAME = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?<name>(?:${NICKNAMES.join('|')})(?:\s+(?:(?:da|de|do|das|dos)\s+)?${NAME_WORD})*)(?![\p{L}\p{N}])`,
  'gdu',
);

function namedGroupSpans(pattern: RegExp, text: string): TextSpan[] {
  return [...text.matchAll(pattern)].flatMap((match) => {
    const range = match.indices?.groups?.name;
    return range ? [{ start: range[0], end: range[1] }] : [];
  });
}

/** Nomes depois de tratamento e apelidos, sem os termos clínicos protegidos. */
export function findPersonNames(text: string): TextSpan[] {
  const candidates = [...namedGroupSpans(HONORIFIC_NAME, text), ...namedGroupSpans(NICKNAME, text)];
  // "Seu Zé" casa as duas regras: fica o primeiro trecho, sem repetir.
  const spans = candidates.reduce<TextSpan[]>(
    (kept, span) =>
      kept.some((taken) => span.start < taken.end && taken.start < span.end)
        ? kept
        : [...kept, span],
    [],
  );
  spans.sort((a, b) => a.start - b.start);
  return protectClinicalTerms(text, spans);
}
