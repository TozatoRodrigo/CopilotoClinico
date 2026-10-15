import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ler, tabela } from './lib.mjs';
import { HETRIN } from './pediatria.mjs';

export const titulo = 'HETRIN Ped: a versão nova chega a quem já instalou (service worker)';

const SW = 'v2/public/hetrinped/sw.js';

/**
 * Roda o sw.js num ambiente de mentira: instala, ativa e conta o que ele fez
 * com os caches e com as janelas abertas. `cachesAntes` simula o aparelho de
 * quem já tinha o app (o cache da versão anterior).
 */
async function simular(codigo, cachesAntes) {
  const ouvintes = {};
  const caches = new Map(cachesAntes.map((k) => [k, []]));
  const recarregadas = [];
  let assumiu = false;
  let modoDosPedidos = [];
  const self = {
    addEventListener: (tipo, fn) => {
      ouvintes[tipo] = fn;
    },
    skipWaiting: async () => {},
    location: { origin: 'https://hetrinped.netlify.app' },
    clients: {
      claim: async () => {
        assumiu = true;
      },
      matchAll: async () => [
        { url: 'https://hetrinped.netlify.app/', navigate: async (u) => recarregadas.push(u) },
      ],
    },
  };
  const cachesApi = {
    keys: async () => [...caches.keys()],
    delete: async (k) => caches.delete(k),
    open: async (k) => {
      if (!caches.has(k)) caches.set(k, []);
      return {
        addAll: async (pedidos) => {
          modoDosPedidos = pedidos.map((p) => (typeof p === 'string' ? 'default' : p.cache));
        },
        put: async () => {},
      };
    },
    match: async () => undefined,
  };
  class Request {
    constructor(url, opcoes) {
      this.url = url;
      this.cache = opcoes?.cache ?? 'default';
    }
  }
  new Function('self', 'caches', 'Request', codigo)(self, cachesApi, Request);
  let espera;
  ouvintes.install({ waitUntil: (p) => (espera = p) });
  await espera;
  ouvintes.activate({ waitUntil: (p) => (espera = p) });
  await espera;
  return { caches: [...caches.keys()], assumiu, recarregadas: recarregadas.length, modoDosPedidos };
}

export async function rodar({ antes, depois }) {
  if (!existsSync(join(antes, SW))) {
    return {
      texto:
        'sw.js não está na cópia (rode o preparar.mjs com o clone do ANY para conferir este patch).',
      conferencias: [{ nome: 'sw.js presente na cópia temporária', ok: false }],
    };
  }
  const swAntes = ler(antes, SW);
  const swDepois = ler(depois, SW);
  const nome = (c) => c.match(/CACHE_NAME = '([^']+)'/)[1];
  const rodape = (raiz) => ler(raiz, HETRIN).match(/Ped Guide v[\d.]+/)[0];

  // Quem tinha o app na versão anterior (cache v1.1.7) recebe o sw novo
  const atualizacao = await simular(swDepois, [nome(swAntes)]);
  const atualizacaoHoje = await simular(swAntes, ['hetrinped-v1.1.6']);
  // Primeira visita: não há cache antigo, nada a recarregar
  const primeira = await simular(swDepois, []);

  const linhas = [
    ['CACHE_NAME', nome(swAntes), nome(swDepois)],
    ['rodapé', rodape(antes), rodape(depois)],
    [
      'caches depois de ativar (aparelho com versão anterior)',
      `${atualizacaoHoje.caches}`,
      `${atualizacao.caches}`,
    ],
    [
      'janelas abertas recarregadas na atualização',
      atualizacaoHoje.recarregadas,
      atualizacao.recarregadas,
    ],
    ['janelas recarregadas na primeira instalação', '—', primeira.recarregadas],
    [
      'pedidos do pré-cache',
      atualizacaoHoje.modoDosPedidos.join(','),
      atualizacao.modoDosPedidos.join(','),
    ],
  ];
  const indexDepois = ler(depois, HETRIN);
  return {
    texto: tabela(['', 'antes', 'depois'], linhas),
    conferencias: [
      {
        nome: 'CACHE_NAME mudou (o navegador instala o sw novo)',
        ok: nome(swAntes) !== nome(swDepois),
      },
      {
        nome: 'versão do rodapé acompanha o CACHE_NAME',
        ok: nome(swDepois).endsWith(rodape(depois).replace('Ped Guide v', '')),
      },
      {
        nome: 'atualização: apaga o cache antigo e assume as janelas',
        ok:
          atualizacao.caches.length === 1 &&
          atualizacao.caches[0] === nome(swDepois) &&
          atualizacao.assumiu,
      },
      {
        nome: 'atualização: recarrega a janela aberta (antes não recarregava)',
        ok: atualizacao.recarregadas === 1 && atualizacaoHoje.recarregadas === 0,
      },
      { nome: 'primeira instalação: não recarrega', ok: primeira.recarregadas === 0 },
      {
        nome: 'pré-cache busca na rede (cache: reload)',
        ok: atualizacao.modoDosPedidos.every((m) => m === 'reload'),
      },
      {
        nome: 'página procura versão nova ao voltar do segundo plano',
        ok: /visibilitychange[\s\S]{0,200}reg\.update\(\)/.test(indexDepois),
      },
    ],
  };
}
