import { describe, expect, it } from 'vitest';
import { airwayEquipment, broselowColorForWeight, findBroselowColor } from './broselow';
import {
  estimateWeightFromAge,
  estimateWeightFromLength,
  LENGTH_WEIGHT_BANDS,
  resolvePediatricPatient,
  type PediatricInputs,
} from './weight';

function resolve(partial: Partial<PediatricInputs>) {
  return resolvePediatricPatient({ weight: '', broselow: null, length: '', age: '', ...partial });
}

describe('peso da criança (CC-319)', () => {
  it('sem peso nem cor não há peso', () => {
    expect(resolve({}).weight).toEqual({ status: 'vazio' });
  });

  it('peso digitado é aferido e acha a cor mais próxima', () => {
    const { weight } = resolve({ weight: '12,5' });
    expect(weight).toMatchObject({
      status: 'pronto',
      kg: 12.5,
      source: 'medido',
      estimated: false,
    });
    expect(weight.status === 'pronto' && weight.color.key).toBe('yellow');
  });

  it('peso fora de 0,5 a 50 kg é erro e não vira peso, mesmo com cor escolhida', () => {
    for (const raw of ['0,4', '50,1', '120', 'abc', '1.500']) {
      expect(resolve({ weight: raw, broselow: 'green' }).weight.status, raw).toBe('invalido');
    }
    expect(resolve({ weight: '0,5' }).weight.status).toBe('pronto');
    expect(resolve({ weight: '50' }).weight.status).toBe('pronto');
  });

  it('cor de Broselow sem peso digitado dá o peso da cor, marcado como estimado', () => {
    expect(resolve({ broselow: 'purple' }).weight).toMatchObject({
      status: 'pronto',
      kg: 10,
      source: 'broselow',
      estimated: true,
    });
  });

  it('o peso digitado manda sobre a cor', () => {
    expect(resolve({ weight: '20', broselow: 'gray' }).weight).toMatchObject({
      kg: 20,
      source: 'medido',
    });
  });

  it('avisa neonato abaixo de 3 kg', () => {
    expect(resolve({ weight: '2,9' }).weight).toMatchObject({ neonatal: true });
    expect(resolve({ weight: '3' }).weight).toMatchObject({ neonatal: false });
    expect(resolve({ broselow: 'gray' }).weight).toMatchObject({ kg: 3, neonatal: false });
  });
});

describe('peso estimado pelo comprimento e pela idade (CC-320)', () => {
  it('a tabela de comprimento tem 29 faixas e cobre 40 a 160 cm sem buraco', () => {
    expect(LENGTH_WEIGHT_BANDS).toHaveLength(29);
    for (let cm = 40; cm <= 160; cm += 1) {
      expect(estimateWeightFromLength(cm), `${cm} cm`).not.toBeNull();
    }
    expect(estimateWeightFromLength(47.6)).toBe(4);
    expect(estimateWeightFromLength(100)).toBe(16);
    expect(estimateWeightFromLength(160)).toBe(50);
  });

  it('APLS por idade: abaixo de 1 ano, de 1 a 5 e acima de 5, limitado a 50 kg', () => {
    expect(estimateWeightFromAge(0)).toBe(4);
    expect(estimateWeightFromAge(0.5)).toBe(7);
    expect(estimateWeightFromAge(1)).toBe(10);
    expect(estimateWeightFromAge(5)).toBe(18);
    expect(estimateWeightFromAge(5.5)).toBe(24);
    expect(estimateWeightFromAge(10)).toBe(37);
    expect(estimateWeightFromAge(15)).toBe(50);
  });

  it('comprimento e idade dão peso marcado como estimado, e a cor vem do peso', () => {
    expect(resolve({ length: '100' }).weight).toMatchObject({
      status: 'pronto',
      kg: 16,
      source: 'comprimento',
      estimated: true,
    });
    const byAge = resolve({ age: '3' }).weight;
    expect(byAge).toMatchObject({ kg: 14, source: 'idade', estimated: true });
    expect(byAge.status === 'pronto' && byAge.color.key).toBe('white');
  });

  it('vale a melhor fonte: aferido, cor, comprimento, idade', () => {
    expect(resolve({ weight: '9', length: '100', age: '3' }).weight).toMatchObject({
      source: 'medido',
    });
    expect(resolve({ broselow: 'red', length: '100' }).weight).toMatchObject({
      source: 'broselow',
    });
    expect(resolve({ length: '100', age: '3' }).weight).toMatchObject({ source: 'comprimento' });
  });

  it('a fonte preenchida fora da faixa é erro, e não cai para a próxima', () => {
    expect(resolve({ length: '30', age: '3' }).weight).toMatchObject({
      status: 'invalido',
      field: 'comprimento',
    });
    expect(resolve({ age: '19' }).weight).toMatchObject({ status: 'invalido', field: 'idade' });
  });
});

describe('idade (anti-histamínicos)', () => {
  it('a idade digitada manda; sem ela vale a da cor escolhida', () => {
    expect(resolve({ age: '4' }).age).toEqual({ status: 'pronto', years: 4, source: 'informada' });
    expect(resolve({ broselow: 'blue' }).age).toEqual({
      status: 'pronto',
      years: 4.5,
      source: 'broselow',
    });
    expect(resolve({ broselow: 'blue', age: '7' }).age).toMatchObject({ years: 7 });
  });

  it('idade fora de 0 a 18 anos é erro e não cai para a da cor', () => {
    expect(resolve({ broselow: 'blue', age: '19' }).age.status).toBe('invalido');
  });
});

describe('fita de Broselow', () => {
  it('no empate de distância fica a cor mais leve', () => {
    expect(broselowColorForWeight(13).key).toBe('yellow');
    expect(broselowColorForWeight(16).key).toBe('white');
    expect(broselowColorForWeight(50).key).toBe('green');
    expect(broselowColorForWeight(0.5).key).toBe('gray');
  });

  it('mostra o material de via aérea da cor com vírgula decimal', () => {
    const red = findBroselowColor('red');
    if (!red) throw new Error('cor vermelha ausente');
    expect(airwayEquipment(red)).toEqual({
      tube: '3,5',
      fixation: '10',
      blade: '1 reta',
      laryngealMask: '1,5',
      bougie: '6',
      suctionCatheter: '8',
      checklist: {
        blade: 'Lâmina 1 reta',
        tube: '3,5 e 3,0',
        bougie: '6 Fr',
        laryngealMask: 'Tam. 1,5',
      },
    });
  });
});
