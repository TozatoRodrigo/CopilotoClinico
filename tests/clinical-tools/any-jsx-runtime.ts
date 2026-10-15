/**
 * Peças comuns aos harnesses que rodam páginas do ANY compiladas com o JSX
 * automático (`react/jsx-runtime`): Bloqueios, Sedação e Via aérea, e os
 * tipos da árvore que a Dengue também usa (ADR-017).
 *
 * Cada harness mantém o próprio estado e o próprio `expand`: o jeito de
 * guardar `useState` e de desenhar componente local muda de página para página
 * (slots com nome nos Bloqueios, um estado só na Sedação, `useReducer` vivo na
 * Via aérea), e mudar isso mexeria na contagem de filhos que os testes leem.
 */

export interface AnyElement {
  /** Tag HTML ('div'), `@Nome` (componente importado) ou `#Nome` (componente local). */
  type: string;
  props: Record<string, unknown>;
  children: AnyNode[];
}

export type AnyNode = AnyElement | string;

/** Saída do `jsx` antes do `expand` de cada harness. */
export interface RawElement {
  $$any: true;
  type: unknown;
  props: Record<string, unknown>;
}

/** Componente importado trocado por marcador: vira `@Nome` na árvore. */
export type AnyStub = (() => null) & { stubName: string };

const stubs = new Map<string, AnyStub>();

/** O mesmo marcador para o mesmo nome (o `expand` compara pela identidade). */
export function stub(name: string): AnyStub {
  let component = stubs.get(name);
  if (!component) {
    component = Object.assign(() => null, { stubName: name });
    stubs.set(name, component);
  }
  return component;
}

/** Módulo cujos exports são todos marcadores (componentes e ícones). */
export function stubModule(): unknown {
  return new Proxy(
    {},
    { get: (_target, name) => (name === '__esModule' ? true : stub(String(name))) },
  );
}

export const jsx = (type: unknown, props: Record<string, unknown>): RawElement => ({
  $$any: true,
  type,
  props: props ?? {},
});

export const FRAGMENT = stub('Fragment');

export function isRaw(value: unknown): value is RawElement {
  return typeof value === 'object' && value !== null && '$$any' in value;
}

/** Todos os elementos que passam no filtro, em ordem de documento. */
export function findAll(
  node: AnyNode | readonly AnyNode[],
  predicate: (element: AnyElement) => boolean,
): AnyElement[] {
  if (typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child as AnyNode, predicate));
  const element = node as AnyElement;
  return [...(predicate(element) ? [element] : []), ...findAll(element.children, predicate)];
}

/** Evento de mentira para os handlers que chamam `stopPropagation`/`preventDefault`. */
export const EVENT = { stopPropagation: () => undefined, preventDefault: () => undefined };
