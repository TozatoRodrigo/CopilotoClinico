import { describe, expect, it } from 'vitest';
import { RED_FLAG_IDS, type RedFlagId } from '../../src/shared/clinical-tools/sedation/content';
import { anyText, normalizeText, REPHRASED, screenStrings } from './sedation-content-walk';
import {
  advance,
  answerRecentSedation,
  choose,
  combative,
  replay,
  urgentIm,
  type Step,
} from './sedation-steps';

/**
 * CC-328 — todo texto que a página do ANY mostra está no conteúdo do porte,
 * tela por tela (a menos de acento, caixa, travessão e do nome da droga). Pega
 * trecho esquecido no porte e mudança de dose, limiar ou critério feita sem
 * querer. No sentido inverso, nenhum número do porte falta no ANY: dose
 * inventada também falha. O que mudou de propósito está em `REPHRASED`, com o
 * motivo, e em docs/ferramentas/revisao-clinica/sedacao.md.
 */

/** Textos de navegação e ícones do ANY, que no Copiloto são da tela e não do conteúdo. */
const CHROME = [
  '← Voltar',
  'Novo paciente',
  'Peso do paciente (kg)',
  // Ícones da monitorização (letras dentro de um quadrado).
  'O2',
  'PA',
  'NC',
  // Atalho para a Via aérea: no Copiloto só aparece quando ela estiver disponível.
  'Abrir Airway Guide →',
  'Airway Guide →',
].map(normalizeText);

function isCheckable(fragment: string): boolean {
  const normalized = normalizeText(fragment);
  if (!/[\p{L}\d]/u.test(normalized)) return false; // "+", "-", "/"
  return !CHROME.includes(normalized);
}

const ANY_RED_FLAG: Record<RedFlagId, string> = {
  trauma: 'rf-trauma',
  'via-aerea-dificil': 'rf-vad',
  instabilidade: 'rf-hemo',
  jejum: 'rf-jejum',
};

function markRedFlag(id: RedFlagId): Step {
  return {
    label: `red flag ${id}`,
    port: { type: 'toggle-red-flag', id },
    any: (page) => page.toggleRedFlag(ANY_RED_FLAG[id]),
  };
}

const LOW = choose('pouco-colaborativo');
const URGENT = [LOW, choose('urgente')];
const IV = [...URGENT, choose('com-acesso-iv')];
const ORAL_FAILED = [choose('colaborativo'), choose('precisa-sedacao'), choose('vo-insuficiente')];

interface ScreenCase {
  name: string;
  steps: readonly Step[];
  /** Peso digitado na tela (ANY com ponto, porte com vírgula). */
  weight?: string;
}

const CASES: readonly ScreenCase[] = [
  { name: 'triagem', steps: [] },
  { name: 'colaborativo', steps: [choose('colaborativo')] },
  { name: 'sem sedação', steps: [choose('colaborativo'), choose('sem-sedacao')] },
  { name: 'sedação VO', steps: [choose('colaborativo'), choose('precisa-sedacao')] },
  { name: 'pouco colaborativo sem sedação recente', steps: [LOW] },
  { name: 'pouco colaborativo com sedação recente', steps: [LOW, answerRecentSedation(true)] },
  { name: 'urgente', steps: URGENT },
  { name: 'IM urgente sem medicação', steps: [...URGENT, choose('sem-acesso-iv')] },
  {
    name: 'IM urgente com cetamina e peso',
    steps: [...URGENT, choose('sem-acesso-iv'), urgentIm('cetamina')],
    weight: '72,5',
  },
  {
    name: 'IM urgente com midazolam',
    steps: [...URGENT, choose('sem-acesso-iv'), urgentIm('midazolam')],
  },
  { name: 'não urgente', steps: [LOW, choose('nao-urgente')] },
  { name: 'combativo sem medicação', steps: [choose('combativo')] },
  {
    name: 'combativo com cetamina e peso',
    steps: [choose('combativo'), combative('cetamina')],
    weight: '80',
  },
  {
    name: 'combativo com midazolam + haloperidol + prometazina',
    steps: [choose('combativo'), combative('midazolam-haloperidol-prometazina')],
  },
  {
    name: 'preparo IV com os red flags marcados',
    steps: [...IV, ...RED_FLAG_IDS.map(markRedFlag)],
  },
  { name: 'preparo IV com sedação recente', steps: [...IV, answerRecentSedation(true)] },
  { name: 'preparo IV depois da VO insuficiente', steps: ORAL_FAILED },
  { name: 'cetofol, dose padrão', steps: [...IV, advance('Calcular cetofol')], weight: '70' },
  {
    name: 'cetofol, dose reduzida',
    steps: [...ORAL_FAILED, advance('Calcular cetofol')],
    weight: '63,7',
  },
  {
    name: 'durante a sedação',
    steps: [...IV, advance('Calcular cetofol'), advance('Iniciar sedação')],
  },
  {
    name: 'pós-sedação',
    steps: [...IV, advance('Calcular cetofol'), advance('Iniciar sedação'), advance('Pós-sedação')],
  },
];

function open(screenCase: ScreenCase) {
  const { page, state } = replay(screenCase.steps);
  if (screenCase.weight) page.typeWeight(screenCase.weight.replace(',', '.'));
  return { page, state, ported: screenStrings(state, screenCase.weight ?? '') };
}

function numbers(text: string): string[] {
  return text.match(/\d+(?:,\d+)?/g) ?? [];
}

describe('texto do ANY → conteúdo do porte (CC-328)', () => {
  it.each(CASES.map((screenCase) => [screenCase.name, screenCase] as const))(
    '%s',
    (_name, screenCase) => {
      const { page, ported } = open(screenCase);
      const portedText = ported.map(normalizeText).join('|');
      const missing = page
        .texts()
        .filter(isCheckable)
        .filter((text) => !portedText.includes(anyText(text)));
      expect(missing).toEqual([]);

      // Nenhum número do porte que o ANY não mostre nesta tela.
      const anyNumbers = new Set(numbers(page.texts().map(anyText).join('|')));
      const extra = ported.flatMap(numbers).filter((value) => !anyNumbers.has(value));
      expect(extra).toEqual([]);
    },
  );

  it.each(REPHRASED.map((change) => [change.any, change] as const))(
    'trecho reescrito: "%s"',
    (_any, change) => {
      const anyTexts = CASES.flatMap((screenCase) =>
        open(screenCase).page.texts().map(normalizeText),
      );
      const portedTexts = CASES.flatMap((screenCase) =>
        open(screenCase).ported.map(normalizeText),
      ).join('|');
      expect(anyTexts.join('|')).toContain(normalizeText(change.any));
      expect(portedTexts).toContain(normalizeText(change.ported));
      // O texto novo pode conter o antigo ("Considere evitar midazolam se:"): fora dele, o antigo sumiu.
      expect(portedTexts.replaceAll(normalizeText(change.ported), '')).not.toContain(
        normalizeText(change.any),
      );
    },
  );
});
