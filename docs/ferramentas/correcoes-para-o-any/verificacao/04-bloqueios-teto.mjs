import { avaliar, carregarModulo, chamadas, entre, ler, recortar, tabela } from './lib.mjs';

export const titulo = 'Bloqueios: dose máxima de anestésico local com teto absoluto';

const BLOCK = 'v2/src/pages/BlockPath.tsx';
const FORMATTERS = 'v2/src/utils/formatters.ts';

/** Os números que a calculadora de dose máxima mostra, rodando as expressões da própria tela. */
function tela(raiz, peso) {
  const codigo = ler(raiz, BLOCK);
  const { fmt } = carregarModulo(ler(raiz, FORMATTERS), 'formatters.ts');
  const dado = recortar(codigo, 'const anesthetics: AnestheticCalc[] =');
  const helper = codigo.includes('function doseMaxima(')
    ? recortar(codigo, 'function doseMaxima(')
    : '';
  const bloco = entre(codigo, '{anesthetics.map(a => (', '</table>');
  const [mgSem, mgCom, mlSem, mlCom] = chamadas(bloco, 'fmt');
  const anestesicos = avaliar(`${dado}\n${helper}`, {}, 'anesthetics');
  return anestesicos.map((a) => {
    const escopo = { a, calcWeight: peso, fmt, c: a.concentrations[a.concentrations.length - 1] };
    const ev = (expr) => avaliar(helper, escopo, expr);
    return {
      nome: a.name,
      sem: ev(mgSem),
      com: ev(mgCom),
      mlSem: `${ev(mlSem)} mL (${escopo.c.label})`,
      mlCom: `${ev(mlCom)} mL (${escopo.c.label})`,
    };
  });
}

export function rodar({ antes, depois }) {
  const linhas = [];
  for (const peso of [50, 70, 100, 150, 200]) {
    const a = tela(antes, peso);
    const d = tela(depois, peso);
    a.forEach((x, i) =>
      linhas.push([
        `${peso} kg`,
        x.nome,
        `${x.sem} / ${x.com}`,
        `${d[i].sem} / ${d[i].com}`,
        `${d[i].mlSem} / ${d[i].mlCom}`,
      ]),
    );
  }
  const lido100 = tela(depois, 100)[0];
  const bupi100 = tela(depois, 100)[1];
  const ropi200a = tela(antes, 200)[2];
  const ropi200d = tela(depois, 200)[2];
  const iguaisAbaixoDoTeto = [40, 50, 60, 66].every(
    (p) => JSON.stringify(tela(antes, p)) === JSON.stringify(tela(depois, p)),
  );
  return {
    texto: tabela(
      [
        'peso',
        'anestésico',
        'antes: sem / com epi (mg)',
        'depois: sem / com epi (mg)',
        'depois: volume na maior concentração',
      ],
      linhas,
    ),
    conferencias: [
      {
        nome: 'lidocaína 100 kg: 300 mg sem e 500 mg com epinefrina (antes 450 e 700)',
        ok: lido100.sem === '300' && lido100.com === '500' && tela(antes, 100)[0].sem === '450',
      },
      {
        nome: 'bupivacaína 100 kg: 175 mg sem e 225 mg com epinefrina',
        ok: bupi100.sem === '175' && bupi100.com === '225',
      },
      {
        nome: 'volume em mL acompanha o teto (lidocaína 2%, 100 kg: 15 mL sem epi)',
        ok: lido100.mlSem.startsWith('15'),
      },
      {
        nome: 'ropivacaína sem teto absoluto (sem valor proposto): igual ao antes',
        ok: JSON.stringify(ropi200a) === JSON.stringify(ropi200d),
      },
      { nome: 'abaixo de 66,7 kg nada muda', ok: iguaisAbaixoDoTeto },
    ],
  };
}
