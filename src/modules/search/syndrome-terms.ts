import { PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import { normalizeSearchText } from '../../shared/clinical-tools/catalog';

/**
 * CC-502 — como o médico escreve cada síndrome de PS na busca: o rótulo da
 * tela (o mesmo de `understanding.syndromes` no web) e os nomes de corredor
 * que caem nela. Serve para achar casos pela síndrome do entendimento e
 * cartões pela síndrome deles. "outro" fica de fora: não é um termo de busca.
 */
export const PS_SYNDROME_SEARCH_TERMS: Readonly<Record<PsSyndrome, readonly string[]>> = {
  'agitacao-psicomotora': ['Agitação psicomotora', 'delirium', 'agressividade'],
  cefaleia: ['Cefaleia', 'dor de cabeça', 'enxaqueca'],
  choque: ['Choque', 'hipotensão', 'hipoperfusão'],
  'crise-convulsiva': ['Crise convulsiva', 'convulsão', 'epilepsia', 'estado de mal'],
  'deficit-neurologico-focal': ['Déficit neurológico focal', 'AVC', 'AVE', 'derrame'],
  'diarreia-vomitos': ['Diarreia e vômitos', 'gastroenterite', 'desidratação'],
  'disturbio-glicemico': ['Distúrbio glicêmico', 'hipoglicemia', 'hiperglicemia', 'CAD', 'EHH'],
  dispneia: ['Dispneia', 'falta de ar', 'desconforto respiratório', 'insuficiência respiratória'],
  'dor-abdominal': ['Dor abdominal', 'abdome agudo'],
  'dor-lombar-flanco': ['Dor lombar ou em flanco', 'cólica renal', 'lombalgia'],
  'dor-toracica': ['Dor torácica', 'dor no peito', 'síndrome coronariana', 'IAM', 'infarto'],
  febre: ['Febre'],
  'febre-hipotensao': ['Febre com hipotensão', 'sepse', 'choque séptico'],
  'infeccao-respiratoria': ['Infecção respiratória', 'pneumonia', 'síndrome gripal'],
  intoxicacao: ['Intoxicação', 'envenenamento', 'overdose'],
  'pele-partes-moles': ['Pele e partes moles', 'celulite', 'abscesso', 'erisipela'],
  'pressao-arterial-elevada': [
    'Pressão arterial elevada',
    'hipertensão',
    'crise hipertensiva',
    'emergência hipertensiva',
  ],
  'reacao-alergica': ['Reação alérgica', 'anafilaxia', 'urticária', 'angioedema'],
  'rebaixamento-consciencia': ['Rebaixamento de consciência', 'coma', 'confusão aguda'],
  'sintomas-urinarios': ['Sintomas urinários', 'infecção urinária', 'ITU', 'disúria'],
  vertigem: ['Vertigem', 'tontura'],
  outro: [],
};

const NORMALIZED_TERMS = new Map<PsSyndrome, string[][]>(
  PS_SYNDROMES.map((syndrome) => [
    syndrome,
    PS_SYNDROME_SEARCH_TERMS[syndrome].map((term) => normalizeSearchText(term).split(/\s+/)),
  ]),
);

/** Palavras da busca, sem acento e sem caixa. */
export function searchTokens(text: string): string[] {
  const normalized = normalizeSearchText(text);
  return normalized === '' ? [] : normalized.split(/\s+/);
}

/**
 * Síndromes em que algum termo tem, para cada palavra da busca, uma palavra
 * que começa com ela: "dor tor" acha dor torácica; "dor", as três dores;
 * "anafilaxia", a reação alérgica.
 */
export function matchSyndromes(text: string): PsSyndrome[] {
  const tokens = searchTokens(text);
  if (tokens.length === 0) return [];
  return PS_SYNDROMES.filter((syndrome) =>
    (NORMALIZED_TERMS.get(syndrome) ?? []).some((words) =>
      tokens.every((token) => words.some((word) => word.startsWith(token))),
    ),
  );
}
