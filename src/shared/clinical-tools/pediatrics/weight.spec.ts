import { describe, expect, it } from 'vitest';
import { airwayEquipment, broselowColorForWeight, findBroselowColor } from './broselow';
import { resolvePediatricPatient, type PediatricInputs } from './weight';

function resolve(partial: Partial<PediatricInputs>) {
  return resolvePediatricPatient({ weight: '', broselow: null, age: '', ...partial });
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
