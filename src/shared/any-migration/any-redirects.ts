import type { CopilotoToolPath } from './copiloto-tools-snapshot';

/**
 * CC-336 — para onde vai cada endereço do ANY (any.app.br e
 * anyapp.netlify.app, o mesmo site no Netlify) quando ele for desligado.
 * É a fonte do `_redirects` e do `netlify.toml` (netlify-redirects.ts), que
 * vão para o repositório do ANY; os arquivos gerados ficam em
 * deploy/any-app/ e o teste confere que estão em dia com este mapa.
 *
 * Rotas do ANY v4: `Routes` de v2/src/App.tsx e as pastas de v2/public/
 * (github.com/bugamoreira/any-app, revisão 95c8fba). O v4 não tem subrotas:
 * as telas internas de cada roteiro (as abas do Tox Path, por exemplo) são
 * estado do React, sem endereço próprio; o `*` do ANY mandava para o hub.
 *
 * Mudou o mapa: suba `ANY_REDIRECTS_VERSION`, rode `pnpm any:redirects` e
 * leve os arquivos novos ao ANY. Um 301 fica no cache do navegador, então
 * corrigir destino depois não alcança quem já foi redirecionado.
 */
export const ANY_REDIRECTS_VERSION = 1;

/** Destino fora do Copiloto: só enquanto uma decisão de produto está aberta. */
export interface ExternalDestination {
  url: `https://${string}`;
  /** A história que decide o destino definitivo. */
  pendingDecision: `CC-${number}`;
}

export interface AnyRedirect {
  /** Caminho no ANY. `/*` no fim pega a pasta inteira. */
  from: `/${string}`;
  to: CopilotoToolPath | ExternalDestination;
  /** Nome da ferramenta no hub do ANY, para quem lê o arquivo gerado. */
  anyName: string;
  note?: string;
}

/**
 * Em ordem: o Netlify usa a primeira regra que casa, então o pega-tudo
 * fica por último. A query string vai junto para o destino (o Netlify a
 * repassa em 301).
 */
export const ANY_REDIRECTS: readonly AnyRedirect[] = [
  { from: '/', to: '/ferramentas', anyName: 'Hub' },
  {
    from: '/login',
    to: '/ferramentas',
    anyName: 'Login',
    note: 'sem sessão, o Copiloto leva ao próprio login',
  },
  {
    from: '/infusion',
    to: '/ferramentas/infusoes',
    anyName: 'Calculadora de infusões',
    note: 'o ?drug= dos links do ANY segue na query e a tela de Infusões o aceita',
  },
  { from: '/airway', to: '/ferramentas/via-aerea', anyName: 'Airway Guide' },
  { from: '/vm', to: '/ferramentas/ventilacao-mecanica', anyName: 'VM Guide' },
  { from: '/tep', to: '/ferramentas/tep', anyName: 'TEP Guide' },
  { from: '/seda', to: '/ferramentas/sedacao', anyName: 'Seda Path' },
  { from: '/tox', to: '/ferramentas/toxicologia', anyName: 'Tox Path' },
  { from: '/ped', to: '/ferramentas/pediatria', anyName: 'Ped Guide' },
  { from: '/palia', to: '/ferramentas/paliativos', anyName: 'Palia Path' },
  { from: '/block', to: '/ferramentas/bloqueios', anyName: 'Block Path' },
  { from: '/acls', to: '/ferramentas/acls', anyName: 'ACLS Guide' },
  { from: '/dengue', to: '/ferramentas/dengue', anyName: 'Dengue Path' },
  {
    from: '/shock',
    to: '/ferramentas/choque-septico',
    anyName: 'Shock Path',
    note: 'a tela inicial do Shock Path era o choque séptico; VNERi e gap CO2 estão no choque indiferenciado',
  },
  { from: '/keto', to: '/ferramentas/cad-ehh', anyName: 'KetoPath' },
  { from: '/calculadoras', to: '/ferramentas/calculadoras', anyName: 'Calculadoras' },
  // A pasta inteira e a raiz dela: não é garantido que o splat case com
  // `/hetrinped` sem nada depois, e cair no pega-tudo mandaria o hospital
  // para uma tela com login.
  {
    from: '/hetrinped',
    to: { url: 'https://hetrinped.netlify.app/', pendingDecision: 'CC-337' },
    anyName: 'HETRIN Ped',
    note: 'sem login e offline, como a equipe do hospital usa; a CC-337 decide o destino definitivo',
  },
  {
    from: '/hetrinped/*',
    to: { url: 'https://hetrinped.netlify.app/:splat', pendingDecision: 'CC-337' },
    anyName: 'HETRIN Ped (arquivos)',
  },
  {
    from: '/*',
    to: '/ferramentas',
    anyName: 'Qualquer outro endereço',
    note: 'como o * do ANY, que levava ao hub',
  },
];
