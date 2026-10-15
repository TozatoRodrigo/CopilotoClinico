import { describe, expect, it } from 'vitest';
import { TOOLS, type ToolEntry } from './catalog';
import { infusionHref, readInfusionParam } from './infusions/items';
import {
  calculatorHref,
  originFromPath,
  readOrigin,
  readToolReturn,
  toolHref,
  withQuery,
} from './links';

function params(query: string) {
  const search = new Map(
    query
      .replace(/^\?/, '')
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const [name, value = ''] = pair.split('=');
        return [name, decodeURIComponent(value)] as const;
      }),
  );
  return { get: (name: string) => search.get(name) ?? null };
}

function queryOf(href: string) {
  return params(href.split('?')[1] ?? '');
}

describe('endereços entre ferramentas (CC-331)', () => {
  it('junta os parâmetros na ordem, sem os vazios', () => {
    expect(withQuery('/x', { a: '1', b: undefined, c: null, d: '' })).toBe('/x?a=1');
    expect(withQuery('/x', {})).toBe('/x');
    expect(withQuery('/x', { de: 'calculadoras/ciwa-ar' })).toBe('/x?de=calculadoras/ciwa-ar');
  });

  it('leva a origem e o lugar de abrir', () => {
    expect(toolHref('via-aerea', { from: { tool: 'acls' } })).toBe(
      '/ferramentas/via-aerea?de=acls',
    );
    expect(
      toolHref('choque-indiferenciado', {
        from: { calculator: 'vti-classificacao' },
        query: { aba: 'vti' },
      }),
    ).toBe('/ferramentas/choque-indiferenciado?aba=vti&de=calculadoras/vti-classificacao');
    expect(calculatorHref('delta-gap', { from: { tool: 'cad-ehh' } })).toBe(
      '/ferramentas/calculadoras/delta-gap?de=cad-ehh',
    );
  });

  it('acha a origem pela rota atual', () => {
    expect(originFromPath('/ferramentas/choque-septico')).toEqual({ tool: 'choque-septico' });
    expect(originFromPath('/ferramentas/toxicologia/antidotos')).toEqual({ tool: 'toxicologia' });
    expect(originFromPath('/ferramentas/calculadoras/ciwa-ar')).toEqual({ calculator: 'ciwa-ar' });
    expect(originFromPath('/ferramentas/calculadoras')).toBeNull();
    expect(originFromPath('/ferramentas')).toBeNull();
    expect(originFromPath('/encounters/1')).toBeNull();
  });

  it('volta para o roteiro ou a calculadora de origem', () => {
    expect(readToolReturn(params('de=choque-septico'))).toEqual({
      href: '/ferramentas/choque-septico',
      label: 'Choque séptico',
    });
    expect(readToolReturn(params('de=calculadoras/ciwa-ar'))).toMatchObject({
      href: '/ferramentas/calculadoras/ciwa-ar',
      label: expect.stringContaining('CIWA'),
    });
  });

  it('ignora origem que não existe, editada à mão ou "em breve"', () => {
    expect(readToolReturn(params(''))).toBeNull();
    expect(readToolReturn(params('de=nao-existe'))).toBeNull();
    expect(readToolReturn(params('de=calculadoras/nao-existe'))).toBeNull();
    expect(readToolReturn(params('de=https://exemplo.com'))).toBeNull();
    expect(readOrigin(params('de=../../admin'))).toBeNull();
    const pending = TOOLS.map(
      (tool): ToolEntry => (tool.id === 'tep' ? { ...tool, status: 'em-breve' } : tool),
    );
    expect(readToolReturn(params('de=tep'), pending)).toBeNull();
  });
});

describe('Infusões pelo endereço (CC-331)', () => {
  it('a heparina do TEP abre na indicação do TEP', () => {
    const href = infusionHref('heparina', { indication: 'tep', from: { tool: 'tep' } });
    expect(href).toBe('/ferramentas/infusoes?droga=heparina&indicacao=tep&de=tep');
    expect(readInfusionParam(queryOf(href))).toMatchObject({
      item: { id: 'heparina' },
      indication: 'tep',
    });
  });

  it('indicação só vale para a heparina e só se for conhecida', () => {
    expect(readInfusionParam(params('droga=heparina&indicacao=xyz')).indication).toBeNull();
    expect(readInfusionParam(params('droga=noradrenalina&indicacao=tep')).indication).toBeNull();
  });

  it('a lista abre com o grupo pedido primeiro', () => {
    const href = infusionHref(null, { group: 'sedation', from: { tool: 'via-aerea' } });
    expect(href).toBe('/ferramentas/infusoes?grupo=sedation&de=via-aerea');
    expect(readInfusionParam(queryOf(href))).toMatchObject({ item: null, group: 'sedation' });
    expect(readInfusionParam(params('grupo=nada')).group).toBeNull();
  });
});
