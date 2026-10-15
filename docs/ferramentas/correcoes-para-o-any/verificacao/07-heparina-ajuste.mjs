import { avaliar, entre, ler, recortar, tabela } from './lib.mjs';

export const titulo = 'Heparina (SCA): ajuste sem dose atual parte da infusão inicial real';

const HEPARINA = 'v2/src/components/clinical/HeparinCalculator.tsx';

/** Roda as contas da própria tela (do `const modo` até a vazão) com a fase de ajuste. */
function ajuste(raiz, { modoId, peso, ttpa, doseAtual }) {
  const codigo = ler(raiz, HEPARINA);
  const dados = [
    recortar(codigo, 'const MODOS ='),
    recortar(codigo, 'const NOMOGRAMA ='),
    recortar(codigo, 'function faixaDoTtpa('),
  ].join('\n');
  const contas = entre(codigo, 'const modo = MODOS[modoId]', '// Cor do resultado');
  return avaliar(
    `${dados}\n${contas}`,
    { modoId, weight: peso, ttpaTxt: ttpa, doseAtualTxt: doseAtual },
    '{ uiHInicial, novaDose, uiHAjuste }',
  );
}

export function rodar({ antes, depois }) {
  const casos = [
    { modoId: 'sca', peso: 100, ttpa: '1,3', doseAtual: '' },
    { modoId: 'sca', peso: 120, ttpa: '1,0', doseAtual: '' },
    { modoId: 'sca', peso: 100, ttpa: '1,3', doseAtual: '10' },
    { modoId: 'sca', peso: 70, ttpa: '1,3', doseAtual: '' },
    { modoId: 'tep', peso: 100, ttpa: '1,3', doseAtual: '' },
  ];
  const linhas = casos.map((c) => {
    const a = ajuste(antes, c);
    const d = ajuste(depois, c);
    return [
      `${c.modoId.toUpperCase()}, ${c.peso} kg, TTPa ${c.ttpa}, dose atual ${c.doseAtual || 'vazia'}`,
      `${a.uiHInicial} UI/h`,
      `${a.uiHAjuste} UI/h`,
      `${Math.round(d.uiHAjuste)} UI/h`,
    ];
  });
  const r = casos.map((c) => [ajuste(antes, c), ajuste(depois, c)]);
  return {
    texto: tabela(['caso', 'infusão inicial', 'novo ritmo antes', 'novo ritmo depois'], linhas),
    conferencias: [
      {
        nome: 'SCA 100 kg, TTPa 1,3, sem dose atual: antes 1.400 UI/h, depois 1.200 UI/h (1.000 + 2 UI/kg/h)',
        ok: r[0][0].uiHAjuste === 1400 && Math.round(r[0][1].uiHAjuste) === 1200,
      },
      { nome: 'com a dose atual digitada, nada muda', ok: r[2][0].uiHAjuste === r[2][1].uiHAjuste },
      {
        nome: 'SCA 70 kg (teto não atua) e TEP: nada muda',
        ok:
          Math.round(r[3][0].uiHAjuste) === Math.round(r[3][1].uiHAjuste) &&
          Math.round(r[4][0].uiHAjuste) === Math.round(r[4][1].uiHAjuste),
      },
    ],
  };
}
