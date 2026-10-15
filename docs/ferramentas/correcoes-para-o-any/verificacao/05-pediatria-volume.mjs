import { tabela } from './lib.mjs';
import { drogas, HETRIN, numero, PEDGUIDE } from './pediatria.mjs';

export const titulo =
  'Ped Guide e HETRIN: volume e dose do neonato sem sumir nem dobrar no arredondamento';

/** Roda o calc da droga com o toFixed desligado: o número exato que a tela arredonda. */
function exato(droga, peso) {
  const original = Number.prototype.toFixed;
  Number.prototype.toFixed = function semArredondar() {
    return String(Number(this));
  };
  try {
    return droga.calc(peso, 5, 60);
  } finally {
    Number.prototype.toFixed = original;
  }
}

/** Pesos (0,5–50 kg, passo 0,1) em que o volume mostrado some (0) ou erra 20% ou mais. */
function errados(lista) {
  const achados = [];
  for (const [id, droga] of Object.entries(lista)) {
    for (let p10 = 5; p10 <= 500; p10 += 1) {
      const p = p10 / 10;
      const mostrado = numero(droga.calc(p, 5, 60).ml);
      const real = numero(exato(droga, p).ml);
      if (!Number.isFinite(mostrado) || !Number.isFinite(real) || real <= 0) continue;
      if (mostrado === 0 || Math.abs(mostrado - real) / real >= 0.2)
        achados.push({ id, p, mostrado, real });
    }
  }
  return achados;
}

/** A partir de 3 kg o patch só pode acrescentar casa decimal: o número não muda além do arredondamento antigo. */
function soCasaDecimal(listaAntes, listaDepois) {
  for (const id of Object.keys(listaAntes)) {
    for (let p10 = 30; p10 <= 500; p10 += 1) {
      const p = p10 / 10;
      const a = listaAntes[id].calc(p, 5, 60);
      const d = listaDepois[id].calc(p, 5, 60);
      for (const campo of ['mg', 'ml']) {
        const va = String(a[campo]).split(/ [-/] /);
        const vd = String(d[campo]).split(/ [-/] /);
        for (let i = 0; i < va.length; i += 1) {
          const x = numero(va[i]);
          const y = numero(vd[i]);
          if (!Number.isFinite(x)) continue;
          const casas = (va[i].split(/[.,]/)[1] ?? '').length;
          if (Math.abs(x - y) > 0.5 * 10 ** -casas + 1e-9)
            return `${id} ${p} kg ${campo}: ${va[i]} → ${vd[i]}`;
        }
      }
    }
  }
  return null;
}

export function rodar({ antes, depois }) {
  const linhas = [];
  const resto = [];
  const conferencias = [];
  for (const [fonte, site] of [
    [PEDGUIDE, 'any.app.br'],
    [HETRIN, 'HETRIN'],
  ]) {
    const a = drogas(antes, fonte);
    const d = drogas(depois, fonte);
    for (const [id, p] of [
      ['epinefrina-iv', 0.5],
      ['amiodarona', 0.5],
      ['hidrocortisona', 0.5],
      ['difenidramina', 1],
      ['vitamina-k', 1],
      ['bicarbonato', 0.5],
    ]) {
      const ex = exato(a[id], p);
      linhas.push([
        site,
        id,
        `${String(p).replace('.', ',')} kg`,
        `${a[id].calc(p).mg} · ${a[id].calc(p).ml} mL`,
        `${d[id].calc(p).mg} · ${d[id].calc(p).ml} mL`,
        `${numero(ex.ml).toPrecision(2).replace('.', ',')} mL`,
      ]);
    }
    const errAntes = errados(a);
    const errDepois = errados(d);
    const zerosDepois = errDepois.filter((e) => e.mostrado === 0);
    const mudanca = soCasaDecimal(a, d);
    conferencias.push(
      {
        nome: `${site}: pesos×drogas com volume 0 ou erro ≥ 20% — antes ${errAntes.length}, depois ${errDepois.length}`,
        ok: errDepois.length < errAntes.length,
      },
      { nome: `${site}: nenhum volume "0" com dose > 0 depois`, ok: zerosDepois.length === 0 },
      {
        nome: `${site}: de 3 a 50 kg, nenhum número muda além da casa decimal a mais`,
        ok: mudanca === null,
      },
    );
    if (errDepois.length) {
      // O que sobra: volumes de 1 a 3 mL mostrados sem casa decimal e volumes de 0,01-0,02 mL, abaixo de 3 kg
      const porDroga = {};
      for (const e of errDepois) (porDroga[e.id] ??= []).push(String(e.p).replace('.', ','));
      resto.push(
        `${site}, ainda com erro ≥ 20% depois: ${Object.entries(porDroga)
          .map(([id, ps]) => `${id} (${ps.join(', ')} kg)`)
          .join('; ')}.`,
      );
    }
  }
  const a = drogas(antes, PEDGUIDE);
  const d = drogas(depois, PEDGUIDE);
  conferencias.push({
    nome: 'any.app.br, epinefrina IV 0,5 kg: antes "0,0 mL", depois "0,05 mL"',
    ok: a['epinefrina-iv'].calc(0.5).ml === '0,0' && d['epinefrina-iv'].calc(0.5).ml === '0,05',
  });
  const texto = [
    tabela(['site', 'droga', 'peso', 'antes (dose · volume)', 'depois', 'volume exato'], linhas),
    '',
    ...resto,
  ].join('\n');
  return { texto, conferencias };
}
