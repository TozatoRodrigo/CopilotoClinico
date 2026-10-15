// Ferramentas comuns dos scripts de verificação das correções para o ANY (CC-016).
//
// Os scripts rodam sobre uma CÓPIA TEMPORÁRIA dos arquivos do ANY, fora do
// repositório (ver preparar.mjs), nunca sobre tests/any-reference: a referência
// congelada é só para teste e não pode ser importada fora de tests/ (ADR-017).
// Nada aqui é importado por src/ nem por web/.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** Lê um arquivo do ANY dentro da árvore temporária (`raiz/<caminho do ANY>`). */
export function ler(raiz, caminho) {
  return readFileSync(join(raiz, caminho), 'utf-8');
}

/** TS/TSX → JS (CommonJS), sem checar tipos: o arquivo é o do ANY como está. */
export function transpilar(codigo, nome = 'trecho.tsx') {
  return ts.transpileModule(codigo, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: nome,
  }).outputText;
}

/**
 * Carrega um módulo TS do ANY inteiro. `modulos` responde aos imports (o que
 * não estiver lá vira um objeto vazio: tipos e componentes de tela que a conta
 * não usa). `React` é o React de mentira abaixo.
 */
export function carregarModulo(codigo, nome, modulos = {}) {
  const js = transpilar(codigo, nome);
  const exports = {};
  const req = (spec) => (spec in modulos ? modulos[spec] : {});
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- só verificação, sobre cópia temporária
  new Function('exports', 'require', 'React', js)(exports, req, React);
  return exports;
}

/**
 * Recorta do código o bloco que começa em `inicio` (texto exato) e vai até o
 * fecho do primeiro `{`, `[` ou `(` que aparece depois dele. Serve para tirar
 * uma função ou um array de dentro de um componente sem rodar a tela inteira.
 */
export function recortar(codigo, inicio) {
  const de = codigo.indexOf(inicio);
  if (de < 0) throw new Error(`trecho não encontrado: ${inicio}`);
  const abre = codigo.slice(de + inicio.length).search(/[{[(]/) + de + inicio.length;
  const par = { '{': '}', '[': ']', '(': ')' };
  const pilha = [];
  let aspas = null;
  for (let i = abre; i < codigo.length; i += 1) {
    const c = codigo[i];
    if (aspas) {
      if (c === '\\') i += 1;
      else if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') aspas = c;
    else if (par[c]) pilha.push(par[c]);
    else if (c === pilha[pilha.length - 1]) {
      pilha.pop();
      if (pilha.length === 0) return codigo.slice(de, i + 1);
    }
  }
  throw new Error(`bloco sem fecho: ${inicio}`);
}

/** Texto entre `inicio` (incluído) e `fim` (excluído), a partir da primeira ocorrência de `inicio`. */
export function entre(codigo, inicio, fim) {
  const de = codigo.indexOf(inicio);
  const ate = codigo.indexOf(fim, de);
  if (de < 0 || ate < 0) throw new Error(`trecho não encontrado: ${inicio} … ${fim}`);
  return codigo.slice(de, ate);
}

/** Todas as chamadas `nome(...)` do trecho, com os parênteses balanceados. */
export function chamadas(codigo, nome) {
  const achadas = [];
  let de = codigo.indexOf(`${nome}(`);
  while (de >= 0) {
    achadas.push(recortar(codigo.slice(de), `${nome}`));
    de = codigo.indexOf(`${nome}(`, de + 1);
  }
  return achadas;
}

/**
 * Lê o rótulo de uma opção de escore ("38,5-38,9 ou 34-35,9", "≥ 41 ou <= 31,9",
 * "< 2,5", "> 340.000/mm3") como lista de intervalos [mín, máx]. Serve para
 * escolher a opção que cobre um valor, igual o médico faria na tela.
 */
export function intervalos(rotulo) {
  const num = (s) => Number(s.replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  return rotulo.split(' ou ').map((parte) => {
    const p = parte.replace(/\/mm3|U\/L|—.*$/g, '').trim();
    let m = p.match(/^(?:≥|>=)\s*([\d.,]+)/);
    if (m) return [num(m[1]), Infinity];
    m = p.match(/^>\s*([\d.,]+)/);
    if (m) return [num(m[1]) + 1e-9, Infinity];
    m = p.match(/^(?:≤|<=)\s*([\d.,]+)/);
    if (m) return [-Infinity, num(m[1])];
    m = p.match(/^<\s*([\d.,]+)/);
    if (m) return [-Infinity, num(m[1]) - 1e-9];
    m = p.match(/^([\d.,]+)\s*-\s*([\d.,]+)/);
    if (m) return [num(m[1]), num(m[2])];
    return [NaN, NaN];
  });
}

/** A opção de um item de escore cujo rótulo cobre o valor (a primeira, se mais de uma). */
export function opcaoPara(item, valor) {
  const op = item.options.find((o) =>
    intervalos(o.label).some(([a, b]) => valor >= a && valor <= b),
  );
  if (!op) throw new Error(`${item.id}: nenhuma opção cobre ${valor}`);
  return op;
}

/** Avalia um trecho TS com as variáveis de `escopo` visíveis e devolve `retorno`. */
export function avaliar(trecho, escopo, retorno) {
  const js = transpilar(`${trecho}\n;__r = (${retorno});`, 'trecho.ts');
  const nomes = Object.keys(escopo);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- só verificação, sobre cópia temporária
  return new Function(...nomes, `let __r; ${js}; return __r;`)(...nomes.map((n) => escopo[n]));
}

/**
 * React de mentira: componente de função é chamado na hora; hooks devolvem o
 * valor inicial. Basta para ler o texto que uma tela mostra num estado dado.
 */
export const React = {
  createElement(type, props, ...children) {
    const all = { ...(props ?? {}), children: children.length <= 1 ? children[0] : children };
    if (typeof type === 'function') return type(all);
    return { type, props: props ?? {}, children: children.flat(Infinity) };
  },
  Fragment: 'fragment',
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useReducer: (_r, v) => [v, () => {}],
};
export const reactModule = { ...React, default: React };

/** Componente de tela do ANY trocado por uma caixa que só mostra o conteúdo. */
export const caixa = ({ children, title }) => ({
  type: 'div',
  props: {},
  children: [title ?? '', children].flat(Infinity),
});

/** Texto visível de uma árvore do React de mentira. */
export function texto(no) {
  if (no === null || no === undefined || typeof no === 'boolean') return '';
  if (typeof no === 'string' || typeof no === 'number') return String(no);
  if (Array.isArray(no)) return no.map(texto).join('');
  return (no.children ?? []).map(texto).join('');
}

/** Formata uma tabela antes × depois para o relatório. */
export function tabela(cabecalho, linhas) {
  const todas = [cabecalho, ...linhas].map((l) => l.map(String));
  const larg = cabecalho.map((_, i) => Math.max(...todas.map((l) => l[i].length)));
  return todas.map((l) => l.map((c, i) => c.padEnd(larg[i])).join(' | ')).join('\n');
}
