import { tabela } from './lib.mjs';
import { drogas, PEDGUIDE } from './pediatria.mjs';

export const titulo =
  'Ped Guide (sem patch): drogas sem teto no cálculo, no maior peso aceito (50 kg)';

export function rodar({ antes }) {
  const d = drogas(antes, PEDGUIDE);
  const ids = ['glicose', 'glicose-g10', 'glicose-g25', 'manitol', 'nacl', 'cisatracurio'];
  const linhas = ids.map((id) => [
    id,
    d[id].doseBadge,
    `${d[id].calc(50).mg} ${d[id].calc(50).unit}`,
    `${d[id].calc(50).ml} mL`,
  ]);
  return {
    texto: tabela(['droga', 'dose/kg', 'dose a 50 kg', 'volume a 50 kg'], linhas),
    conferencias: [
      {
        nome: 'a 50 kg as doses são de adulto: glicose 25 g, manitol 25 g, NaCl 3% 150 mL, cisatracúrio 7,5 mg',
        ok:
          d.glicose.calc(50).mg === '25,0' &&
          d.manitol.calc(50).mg === '25.0' &&
          d.nacl.calc(50).ml === '150' &&
          d.cisatracurio.calc(50).mg === '7.50',
      },
    ],
  };
}
