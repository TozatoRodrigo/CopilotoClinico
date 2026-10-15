import { describe, expect, it } from 'vitest';
import { GROUP_PAGES } from '../../src/shared/clinical-tools/dengue/content';
import {
  openAnyDengue,
  type AnyDenguePage,
  type AnyDengueState,
  type AnyGroup,
  type AnyScreen,
} from './dengue-any-harness';
import { normalizeText, screenStrings } from './dengue-content-walk';

/**
 * CC-325 — todo texto que a página do ANY mostra está no conteúdo do porte,
 * tela por tela (a menos da acentuação corrigida e da caixa). Pega trecho
 * esquecido no porte de ~1.700 linhas de JSX e mudança de dose, limiar ou
 * critério feita sem querer. O que mudou de propósito está listado abaixo,
 * com o motivo, e também vai para docs/ferramentas/revisao-clinica/dengue.md.
 */

/** Textos de navegação e marca do ANY, que no Copiloto são da tela e não do conteúdo. */
const CHROME = [
  'Início',
  '← Início',
  '← Voltar',
  'Próximo →',
  'Classificar',
  'Reclassificar',
  'Dengue Path',
  'Manejo de dengue na emergência',
  'Mensagem gerada — toque para copiar',
  'Copiar mensagem',
  'Enviar no WhatsApp',
  'Fontes bibliográficas',
  // "Passo 1 de 3" (o número e o total vêm em pedaços separados).
  'Passo',
].map(normalizeText);

const STEP_COUNTER = /^passo\d+de\d+$/;

/**
 * Trechos do ANY trocados de propósito no porte, com o texto novo. O teste
 * confere que o original sumiu e que o novo está no conteúdo.
 */
const REPHRASED: readonly { any: string; ported: string; why: string }[] = [
  {
    any: 'Iniciar reposição volêmica agressiva imediatamente. Acesso venoso calibroso (dois acessos). Considere UTI.',
    ported:
      'Considere iniciar reposição volêmica agressiva sem demora. Acesso venoso calibroso (dois acessos). Considere UTI.',
    why: 'ADR-017: linguagem de sugestão, sem "imediatamente" na conduta do médico',
  },
];

function isCheckable(fragment: string): boolean {
  const normalized = normalizeText(fragment);
  if (!/[\p{L}\d]/u.test(normalized)) return false; // "--", "✓", "-"
  if (/^[\d.]{1,2}$/.test(normalized)) return false; // marcador de passo ("1", "2.")
  if (CHROME.includes(normalized) || STEP_COUNTER.test(normalized)) return false;
  return true;
}

interface ScreenCase {
  name: string;
  /** Prepara a página do ANY com o conteúdo condicional visível. */
  setup: (page: AnyDenguePage) => void;
}

const at =
  (screen: AnyScreen, extra: Partial<AnyDengueState> = {}) =>
  (page: AnyDenguePage) =>
    page.setState({ screen, ...extra });

const ONE_ALARM = [true, false, false, false, false, false, false, false];
const NO_ALARM = Array<boolean>(8).fill(false);

const CLASSIFIED: Record<AnyGroup, Partial<AnyDengueState>> = {
  A: {},
  B: { risco: [true, false, false, false, false] },
  C: { alarmes: ONE_ALARM },
  D: { gravidade: [true, false, false] },
};

const CASES: readonly ScreenCase[] = [
  { name: 'início', setup: at('home') },
  { name: 'passo 1', setup: at('step1') },
  { name: 'passo 2 com alarme', setup: at('step2', { alarmes: ONE_ALARM }) },
  ...(['A', 'B', 'C', 'D'] as const).map((group) => ({
    name: `passo 3 classificado no Grupo ${group}`,
    setup: (page: AnyDenguePage) => {
      page.setState({ screen: 'step3', alarmes: NO_ALARM, ...CLASSIFIED[group] });
      page.click('Classificar');
    },
  })),
  ...(['A', 'B', 'C', 'D'] as const).map((group) => ({
    name: `passo 4, Grupo ${group}`,
    setup: at('stepGrupo', { trilhaGrupo: group }),
  })),
  { name: 'passo 5', setup: at('step5') },
  { name: 'manejo por grupos', setup: at('grupos') },
  {
    name: 'classificação direta aberta até o passo 3, com alarme',
    setup: at('classificação', {
      alarmes: ONE_ALARM,
      classStep2Visible: true,
      classStep3Visible: true,
    }),
  },
  ...(['A', 'B', 'C', 'D'] as const).map((group) => ({
    name: `manejo do Grupo ${group}`,
    setup: at(`grupo${group}`),
  })),
  { name: 'calculadoras', setup: at('calculadoras') },
  { name: 'E-FASD', setup: at('efasd') },
  { name: 'exames e diferenciais', setup: at('examediff') },
  {
    name: 'alta segura com a mensagem gerada',
    setup: (page: AnyDenguePage) => {
      page.setState({ screen: 'altasegura' });
      page.click('Gerar orientações para WhatsApp');
    },
  },
  { name: 'referências', setup: at('referências') },
];

describe('texto do ANY → conteúdo do porte', () => {
  it.each(CASES.map((screenCase) => [screenCase.name, screenCase] as const))(
    '%s',
    (_name, screenCase) => {
      const page = openAnyDengue();
      screenCase.setup(page);
      const state = page.state();
      const ported = screenStrings(state.screen, state.trilhaGrupo).map(normalizeText).join('|');
      const rephrased = new Set(REPHRASED.map(({ any }) => normalizeText(any)));
      const missing = page
        .texts()
        // A mensagem do WhatsApp tem teste próprio (dengue-differential.spec.ts).
        .filter((text) => text !== state.wppMsg)
        .filter(isCheckable)
        .filter((text) => !rephrased.has(normalizeText(text)))
        .filter((text) => !ported.includes(normalizeText(text)));
      expect(missing).toEqual([]);
    },
  );

  it.each(REPHRASED.map((change) => [change.why, change] as const))(
    'trecho reescrito: %s',
    (_why, change) => {
      const page = openAnyDengue();
      page.setState({ screen: 'grupoD' });
      expect(page.texts().map(normalizeText)).toContain(normalizeText(change.any));
      const ported = screenStrings('grupoD', null).map(normalizeText);
      expect(ported).toContain(normalizeText(change.ported));
      expect(ported).not.toContain(normalizeText(change.any));
    },
  );

  it('o manejo de cada grupo tem as reclassificações do ANY, nos dois sentidos', () => {
    const targets = (group: AnyGroup) =>
      [
        ...(GROUP_PAGES[group].outro ?? []),
        ...GROUP_PAGES[group].sections.flatMap(({ blocks }) => blocks),
      ].flatMap((block) => (block.kind === 'reclassify' ? [`${block.label}`] : []));
    for (const group of ['A', 'B', 'C', 'D'] as const) {
      const page = openAnyDengue();
      page.setState({ screen: `grupo${group}` });
      const anyButtons = page
        .clickables()
        .map(({ label }) => label)
        .filter((label) => / → Grupo [ABCD]$/.test(label));
      expect(targets(group).sort()).toEqual(anyButtons.sort());
    }
  });
});
