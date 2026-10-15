import { describe, expect, it } from 'vitest';
import {
  buildPerfusionChartNote,
  buildVneriChartNote,
  INITIAL_UNDIFFERENTIATED_STATE,
  parseUndifferentiatedShockState,
  undifferentiatedShockReducer,
  type UndifferentiatedShockAction,
} from './undifferentiated';
import { evaluatePerfusion } from './perfusion-quadrant';
import { evaluateVneri } from './vneri';
import {
  buildVtiChartNote,
  classifyVti,
  evaluateGreyZone,
  evaluateLowOutput,
  EMPTY_LOW_OUTPUT_ANSWERS,
  INITIAL_VTI_STATE,
  LOW_OUTPUT_FLUIDS,
  readVti,
  VTI_SHOCK_TYPE_CONTENT,
  vtiReducer,
  type VtiAction,
} from './vti';

function run(actions: readonly VtiAction[], from = INITIAL_VTI_STATE) {
  return actions.reduce(vtiReducer, from);
}

describe('VTI — critério de aceite do CC-317: o roteiro segue o ramo do VTI', () => {
  it.each([
    ['12', 'baixo-debito', 'investigar-baixo-debito', 'baixo-debito'],
    ['16', 'zona-cinzenta', 'avaliar-perfusao', 'zona-cinzenta'],
    ['20', 'zona-cinzenta', 'avaliar-perfusao', 'zona-cinzenta'],
    ['20,1', 'debito-adequado', 'choque-distributivo', 'distributivo'],
  ] as const)('VTI %s cm → %s', (raw, zone, action, screen) => {
    const measured = run([
      { type: 'ir-para', screen: 'medida' },
      { type: 'digitar-vti', raw },
    ]);
    const vti = readVti(measured);
    expect(vti).not.toBeNull();
    expect(classifyVti(vti ?? 0).id).toBe(zone);
    expect(vtiReducer(measured, { type: action }).screen).toBe(screen);
  });

  it('VTI fora de 1 a 40 cm não classifica', () => {
    expect(readVti(run([{ type: 'digitar-vti', raw: '45' }]))).toBeNull();
    expect(readVti(run([{ type: 'digitar-vti', raw: '0,5' }]))).toBeNull();
  });
});

describe('baixo débito', () => {
  it('o primeiro "Sim" decide o tipo; tudo "Não" abre a fluidorresponsividade', () => {
    expect(evaluateLowOutput({ ...EMPTY_LOW_OUTPUT_ANSWERS, pericardio: 'sim' }).outcome).toBe(
      'tamponamento',
    );
    const allNo = {
      ...EMPTY_LOW_OUTPUT_ANSWERS,
      pericardio: 'nao',
      vd: 'nao',
      ve: 'nao',
      valvar: 'nao',
    } as const;
    expect(evaluateLowOutput(allNo)).toEqual({
      questions: ['pericardio', 'vd', 've', 'valvar'],
      fluidBlock: true,
      fluidQuestion: false,
      outcome: null,
    });
    expect(
      evaluateLowOutput({ ...allNo, ventilation: 'mecanica', fluidResponsive: 'nao' }),
    ).toMatchObject({
      fluidQuestion: true,
      outcome: 'sem-causa',
    });
  });

  it('"Ver resumo" fixa o tipo achado; sem tipo, não sai do lugar', () => {
    const low = run([{ type: 'investigar-baixo-debito' }]);
    expect(vtiReducer(low, { type: 'ver-resumo' })).toBe(low);
    const found = run(
      [
        { type: 'responder', question: 'pericardio', answer: 'nao' },
        { type: 'responder', question: 'vd', answer: 'sim' },
        { type: 'ver-resumo' },
      ],
      low,
    );
    expect(found).toMatchObject({ screen: 'resultado', shockType: 'obstrutivo' });
  });

  it('o distributivo vai ao resumo com o tipo fixado na entrada', () => {
    const state = run([{ type: 'choque-distributivo' }, { type: 'ver-resumo' }]);
    expect(state).toMatchObject({ screen: 'resultado', shockType: 'distributivo' });
  });

  it('reiniciar volta ao início', () => {
    expect(run([{ type: 'choque-distributivo' }, { type: 'reiniciar' }])).toBe(INITIAL_VTI_STATE);
  });
});

describe('zona cinzenta', () => {
  it('precisa dos três marcadores', () => {
    expect(evaluateGreyZone({ svco2: '60', gapCO2: '8', lactateTrend: null })).toBeNull();
    expect(evaluateGreyZone({ svco2: '60', gapCO2: '8', lactateTrend: 'crescente' })).toBe(
      'baixo-debito',
    );
    expect(evaluateGreyZone({ svco2: '75', gapCO2: '4', lactateTrend: 'estavel' })).toBe(
      'distributivo',
    );
    expect(evaluateGreyZone({ svco2: '60', gapCO2: '4', lactateTrend: 'crescente' })).toBe(
      'inconclusivo',
    );
  });
});

describe('prontuário', () => {
  it('resume o tipo, o VTI, as respostas e a referência', () => {
    const state = run([
      { type: 'ir-para', screen: 'medida' },
      { type: 'digitar-vti', raw: '12,5' },
      { type: 'investigar-baixo-debito' },
      { type: 'responder', question: 'pericardio', answer: 'nao' },
      { type: 'responder', question: 'vd', answer: 'nao' },
      { type: 'responder', question: 've', answer: 'sim' },
      { type: 'ver-resumo' },
    ]);
    expect(buildVtiChartNote(state, 'Mercadal J, et al. 2022.')?.split('\n')).toEqual([
      `Classificação hemodinâmica pelo VTI: Choque cardiogênico — ${VTI_SHOCK_TYPE_CONTENT.cardiogenico.summary.subtitle}.`,
      '- VTI: 12,5 cm (VTI < 16 cm — Baixo débito cardíaco)',
      '- Função pericárdica comprometida? Não',
      '- Função do VD comprometida? Não',
      '- Função do VE comprometida? Sim',
      'Achados eco: VE dilatado, FEVE < 40%.',
      'Conduta: Considere inotrópico, vasopressor, suporte mecânico.',
      'Referência: Mercadal J, et al. 2022.',
    ]);
    expect(buildVtiChartNote(INITIAL_VTI_STATE, 'x')).toBeNull();
    expect(LOW_OUTPUT_FLUIDS.question).toBe('Responsivo a fluidos?');
  });

  it('VNERi e quadrante avulsos', () => {
    const vneri = evaluateVneri({ pad: '60', fc: '100', doseNE: '0,3' });
    if (vneri.status !== 'complete') throw new Error('VNERi deveria calcular');
    expect(buildVneriChartNote(vneri, 'Goury 2025.').split('\n')[0]).toBe(
      'VNERi: 2,0 — Hiporresponsividade grave (mortalidade ~56%).',
    );
    const perfusion = evaluatePerfusion({ svco2: '65', gapCO2: '8,5' });
    if (perfusion.status !== 'complete') throw new Error('quadrante deveria sair');
    expect(buildPerfusionChartNote(perfusion, 'Ltaief 2021.').split('\n').slice(0, 2)).toEqual([
      'Gap CO2 × SvcO2: Baixo débito cardíaco / estase.',
      '- SvcO2 65% + Gap CO2 8,5 mmHg',
    ]);
  });
});

describe('estado da tela salvo na sessão', () => {
  const actions: UndifferentiatedShockAction[] = [
    { type: 'aba', tab: 'vneri' },
    { type: 'vneri', field: 'pad', raw: '55' },
    { type: 'perfusao', field: 'svco2', raw: '68' },
    { type: 'vti', action: { type: 'avaliar-perfusao' } },
    { type: 'vti', action: { type: 'tendencia-do-lactato', trend: 'crescente' } },
  ];

  it('volta igual depois de ir e voltar como JSON', () => {
    const state = actions.reduce(undifferentiatedShockReducer, INITIAL_UNDIFFERENTIATED_STATE);
    expect(parseUndifferentiatedShockState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('descarta o que não reconhece', () => {
    expect(parseUndifferentiatedShockState('lixo')).toBeNull();
    expect(
      parseUndifferentiatedShockState({
        tab: 'outra',
        vti: { screen: 'inexistente' },
        vneri: { pad: 42 },
      }),
    ).toEqual(INITIAL_UNDIFFERENTIATED_STATE);
  });
});
