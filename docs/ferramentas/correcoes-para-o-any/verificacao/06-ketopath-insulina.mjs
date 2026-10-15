import { caixa, carregarModulo, ler, reactModule, tabela, texto } from './lib.mjs';

export const titulo = 'CAD e EHH (KetoPath): calculadora de insulina travada com potássio < 3,5';

const MANEJO = 'v2/src/components/clinical/KetoManejo.tsx';

/** Renderiza o passo de insulina da própria tela do ANY e devolve o texto visível. */
function passoInsulina(raiz, potassio, peso) {
  const formatters = carregarModulo(ler(raiz, 'v2/src/utils/formatters.ts'), 'formatters.ts');
  const ketoData = carregarModulo(ler(raiz, 'v2/src/data/ketoData.ts'), 'ketoData.ts');
  const ketoCalc = carregarModulo(ler(raiz, 'v2/src/utils/ketoCalc.ts'), 'ketoCalc.ts');
  const tela = carregarModulo(ler(raiz, MANEJO), 'KetoManejo.tsx', {
    react: reactModule,
    '../common/Collapsible': { Collapsible: caixa },
    '../common/AlertCard': { AlertCard: caixa },
    '../../utils/formatters': formatters,
    '../../utils/ketoCalc': ketoCalc,
    '../../data/ketoData': ketoData,
  });
  return texto(tela.PassoInsulina({ dados: { potassio }, peso, trilha: 'cad' }));
}

/** O que a calculadora de velocidade mostra (o número em U/h, ou a frase no lugar dele). */
function calculadora(t) {
  const depoisDoTitulo = t.slice(t.indexOf('Calculadora de velocidade'));
  const numero = depoisDoTitulo.match(/U\/kg\/h.*?Insulina([\d,]+)U\/h/);
  if (numero) return `${numero[1]} U/h`;
  const frase = depoisDoTitulo.match(/(Velocidade não calculada[^.]*\.|Informe o peso[^.]*\.)/);
  return frase ? frase[1] : '(nada)';
}

export function rodar({ antes, depois }) {
  const casos = [
    [3.0, 70],
    [3.4, 70],
    [3.5, 70],
    [4.2, 70],
    [3.0, null],
  ];
  const linhas = casos.map(([k, peso]) => {
    const a = passoInsulina(antes, k, peso);
    const d = passoInsulina(depois, k, peso);
    return [
      `K ${String(k).replace('.', ',')}, peso ${peso ?? '—'}`,
      a.includes('Insulina bloqueada') ? 'sim' : 'não',
      calculadora(a),
      calculadora(d),
    ];
  });
  const [k30, , k35, k42] = casos.map(([k, p]) => [
    calculadora(passoInsulina(antes, k, p)),
    calculadora(passoInsulina(depois, k, p)),
  ]);
  return {
    texto: tabela(
      ['potássio e peso', 'aviso "Insulina bloqueada"', 'calculadora antes', 'calculadora depois'],
      linhas,
    ),
    conferencias: [
      {
        nome: 'K 3,0 e 70 kg: antes mostrava 7,0 U/h abaixo do bloqueio; depois não mostra velocidade',
        ok: k30[0] === '7,0 U/h' && k30[1].startsWith('Velocidade não calculada'),
      },
      {
        nome: 'K 4,2: velocidade igual antes e depois (7,0 U/h)',
        ok: k42[0] === '7,0 U/h' && k42[1] === '7,0 U/h',
      },
      { nome: 'K 3,5 exato: segue liberado como no ANY (borda não mudou)', ok: k35[0] === k35[1] },
    ],
  };
}
