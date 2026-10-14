'use client';

/**
 * Ilustração do rodapé da landing: gravura a bico de pena de um viaduto de
 * pedra que termina num hospital. Depois de ~1s de viaduto vazio, uma
 * ambulância entra pela esquerda, cruza o viaduto e some atrás do hospital — a
 * travessia que o copiloto acompanha em cada caso, da chegada do paciente ao
 * documento assinado.
 *
 * SVG em vez de vídeo: o traço usa `currentColor` e o papel usa `fill-sidebar`,
 * então a gravura acompanha o tema claro/escuro, pesa poucos KB e não depende
 * de CDN. Com `xMidYMax slice` ela cobre a área como `object-fit: cover`,
 * ancorada no rio: telas largas cortam céu, telas estreitas cortam as margens
 * e a ambulância passa grande no centro.
 *
 * Movimento: só roda com a gravura na tela (IntersectionObserver) e fica
 * parada no meio do viaduto com `prefers-reduced-motion`. Decorativa — fora da
 * árvore de acessibilidade.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const WIDTH = 1600;
const HEIGHT = 640;
// Céu extra acima do desenho (y < 0): deixa o viewBox em ~2,2:1, perto da área
// que sobra num notebook/desktop — assim o corte lateral do `slice` não come o
// hospital; em telas mais largas, o corte cai só nesse céu.
const SKY = 80;

const ROAD_Y = 392;
const SPRING_Y = 486; // nascença dos arcos
const ARCH_R = 60;
const RING_R = 70; // extradorso das aduelas
const FOOT_Y = 600; // base dos pilares
const WATER_Y = 614;
const WALL_LEFT = -200;
const WALL_RIGHT = 1352;
// Centros dos arcos: um arco centrado em x=800 e passo de 152 (vão de 120 + pilar de 32).
const ARCH_CENTERS = [-112, 40, 192, 344, 496, 648, 800, 952, 1104, 1256];
const PIER_LEFTS = ARCH_CENTERS.slice(0, -1).map((c) => c + ARCH_R);

// Ambulância desenhada estacionada no meio do viaduto (é onde fica com
// movimento reduzido); a animação desloca a partir daqui até o hospital.
const AMBULANCE_X = 860;

const ids = {
  hatchH: 'landing-scene-hatch-h',
  hatchD: 'landing-scene-hatch-d',
  hatchV: 'landing-scene-hatch-v',
  masonry: 'landing-scene-masonry',
  dentils: 'landing-scene-dentils',
  fade: 'landing-scene-fade',
  hillsMask: 'landing-scene-hills-mask',
} as const;
const url = (id: string) => `url(#${id})`;

const paper = 'fill-sidebar';
const animated = 'group-data-[offscreen]:[animation-play-state:paused]';

/** Contorno do paredão: retângulo de cima a baixo, recortado pelos vãos. */
function wallOutline() {
  let d = `M${WALL_LEFT},${ROAD_Y + 8} H${WALL_RIGHT} V${FOOT_Y}`;
  for (const c of [...ARCH_CENTERS].reverse()) {
    d += ` H${c + ARCH_R} V${SPRING_Y} A${ARCH_R},${ARCH_R} 0 0 0 ${c - ARCH_R},${SPRING_Y} V${FOOT_Y}`;
  }
  return `${d} H${WALL_LEFT} Z`;
}

/** Aduelas: anel entre o intradorso e o extradorso, com juntas radiais. */
function archRing(c: number) {
  const ring = `M${c - RING_R},${SPRING_Y} A${RING_R},${RING_R} 0 0 1 ${c + RING_R},${SPRING_Y} H${c + ARCH_R} A${ARCH_R},${ARCH_R} 0 0 0 ${c - ARCH_R},${SPRING_Y} Z`;
  let joints = '';
  for (let deg = 15; deg < 180; deg += 15) {
    if (deg === 90) continue; // lugar da chave
    const rad = (deg * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
    joints += `M${(c - ARCH_R * cos).toFixed(1)},${(SPRING_Y - ARCH_R * sin).toFixed(1)} L${(c - RING_R * cos).toFixed(1)},${(SPRING_Y - RING_R * sin).toFixed(1)} `;
  }
  const keystone = `M${c - 4.5},${SPRING_Y - ARCH_R + 0.2} L${c + 4.5},${SPRING_Y - ARCH_R + 0.2} L${c + 6},${SPRING_Y - RING_R - 6} L${c - 6},${SPRING_Y - RING_R - 6} Z`;
  return { ring, joints, keystone };
}

/** Sombra do intradorso e da face do pilar à direita de cada vão. */
function archShadow(c: number) {
  const shift = 8;
  const meetY = (SPRING_Y - Math.sqrt(ARCH_R ** 2 - (shift / 2) ** 2)).toFixed(2);
  return `M${c + ARCH_R},${FOOT_Y} V${SPRING_Y} A${ARCH_R},${ARCH_R} 0 0 0 ${c - shift / 2},${meetY} A${ARCH_R},${ARCH_R} 0 0 1 ${c + ARCH_R - shift},${SPRING_Y} V${FOOT_Y} Z`;
}

/** Copa de árvore em gravura: círculo de ondas. */
function canopy(cx: number, cy: number, r: number, bumps = 9) {
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) {
      d = `M${x.toFixed(1)},${y.toFixed(1)}`;
      continue;
    }
    const mid = a - Math.PI / bumps;
    const qx = cx + r * 1.22 * Math.cos(mid);
    const qy = cy + r * 1.22 * Math.sin(mid);
    d += ` Q${qx.toFixed(1)},${qy.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d} Z`;
}

function Tree({ x, baseY, r }: { x: number; baseY: number; r: number }) {
  const cy = baseY - r * 0.9 - r;
  const d = canopy(x, cy, r);
  return (
    <g>
      <path d={`M${x - 1.6},${baseY} L${x - 1},${cy + r * 0.6} M${x + 1.6},${baseY} L${x + 1},${cy + r * 0.6}`} strokeWidth={1.1} />
      <path d={d} className={paper} strokeWidth={1.1} />
      <path d={d} fill={url(ids.hatchD)} stroke="none" opacity={0.5} />
      <path d={`M${x - 3},${baseY} H${x + 3}`} strokeWidth={0.8} />
    </g>
  );
}

const HOUSES = [
  { x: 138, w: 18, h: 12, roof: 8 },
  { x: 160, w: 14, h: 10, roof: 7 },
  { x: 182, w: 22, h: 14, roof: 9 },
  { x: 210, w: 16, h: 11, roof: 7 },
  { x: 232, w: 20, h: 13, roof: 8 },
  { x: 284, w: 18, h: 12, roof: 8 },
  { x: 306, w: 14, h: 9, roof: 6 },
];
const VILLAGE_Y = 348;

/** Vila ao longe, de onde a ambulância sai. */
function Village() {
  return (
    <g strokeWidth={0.9} strokeOpacity={0.7}>
      {HOUSES.map(({ x, w, h, roof }) => (
        <g key={x}>
          <path
            d={`M${x},${VILLAGE_Y} V${VILLAGE_Y - h} L${x + w / 2},${VILLAGE_Y - h - roof} L${x + w},${VILLAGE_Y - h} V${VILLAGE_Y} Z`}
            className={paper}
          />
          <rect x={x + w / 2 - 1.5} y={VILLAGE_Y - h + 4} width={3} height={4} fill="currentColor" stroke="none" opacity={0.6} />
        </g>
      ))}
      {/* Igreja */}
      <path d={`M262,${VILLAGE_Y} V318 H274 V${VILLAGE_Y} Z`} className={paper} />
      <path d="M262,318 L268,296 L274,318 Z" className={paper} />
      <path d="M268,296 V289 M265.5,291.5 H270.5" />
      <rect x={266} y={324} width={4} height={6} rx={2} fill="currentColor" stroke="none" opacity={0.6} />
    </g>
  );
}

const SLOPE = `M1340,398 C1296,446 1250,540 1206,${WATER_Y}`;
// Arbustos pela beira da encosta, do viaduto até o rio.
const BUSHES = [
  { x: 1306, y: 482, r: 9 },
  { x: 1274, y: 536, r: 11 },
  { x: 1244, y: 590, r: 10 },
];

/** Encosta onde o viaduto pousa e o hospital se apoia. */
function RightBank() {
  return (
    <g>
      <path d={`${SLOPE} H1612 V398 Z`} className={paper} stroke="none" />
      <path d={`${SLOPE} H1612 V398 Z`} fill={url(ids.hatchH)} stroke="none" opacity={0.3} />
      <path
        d={`${SLOPE} H1240 C1282,540 1328,446 1372,398 Z`}
        fill={url(ids.hatchD)}
        stroke="none"
        opacity={0.4}
      />
      <path d={`${SLOPE} M1340,398 H1612`} strokeWidth={1.1} />
      {BUSHES.map(({ x, y, r }) => {
        const d = canopy(x, y, r, 7);
        return (
          <g key={x}>
            <path d={d} className={paper} strokeWidth={1} />
            <path d={d} fill={url(ids.hatchD)} stroke="none" opacity={0.45} />
          </g>
        );
      })}
      {/* Pedras na beira d'água e capim */}
      <path
        d={`M1236,${WATER_Y} q4,-8 12,-7 q8,1 9,7 M1330,${WATER_Y} q3,-6 9,-6 q6,1 7,6 M1462,${WATER_Y} q4,-8 12,-7 q8,1 9,7 M1580,${WATER_Y} q3,-6 9,-6 q6,1 7,6`}
        className={paper}
        strokeWidth={1}
      />
      <path
        d="M1296,470 l-4,-7 M1300,468 l1,-7 M1254,520 l-4,-6 M1258,519 l1,-7 M1226,580 l-4,-6 M1230,579 l1,-6 M1560,398 l-2,-6 M1564,398 l1,-6 M1384,398 l-2,-5 M1388,398 l1,-5"
        strokeWidth={0.8}
        opacity={0.7}
      />
    </g>
  );
}

// O hospital é desenhado em 1394–1552 e deslocado para colar no fim do viaduto.
const HOSPITAL_SHIFT = -44;

/** Hospital na margem direita: pavilhão central com frontão e cruz. */
function Hospital() {
  const base = 402;
  const windowRows = [334, 362];
  const wingWindows = [1408, 1428, 1508, 1528];
  return (
    <g strokeWidth={1.2}>
      {/* Telhados das alas */}
      <path d="M1394,318 L1404,309 H1446 V318 Z M1500,318 V309 H1542 L1552,318 Z" className={paper} />
      <path d="M1394,318 L1404,309 H1446 V318 Z M1500,318 V309 H1542 L1552,318 Z" fill={url(ids.hatchH)} stroke="none" />
      <rect x={1414} y={300} width={6} height={9} className={paper} />
      {/* Alas */}
      <rect x={1398} y={324} width={150} height={base - 324} className={paper} />
      <rect x={1394} y={318} width={158} height={6} className={paper} />
      {/* Sombra da cornija e da lateral direita */}
      <rect x={1398} y={324} width={150} height={4} fill={url(ids.hatchV)} stroke="none" opacity={0.7} />
      <rect x={1540} y={328} width={8} height={base - 328} fill={url(ids.hatchV)} stroke="none" opacity={0.6} />
      {wingWindows.flatMap((x) =>
        windowRows.map((y) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width={10} height={16} className={paper} strokeWidth={0.9} />
            <rect x={x} y={y} width={10} height={16} fill={url(ids.hatchD)} stroke="none" />
            <path d={`M${x - 2},${y + 17.5} H${x + 12}`} strokeWidth={0.9} />
          </g>
        )),
      )}
      {/* Pavilhão central */}
      <rect x={1446} y={306} width={54} height={base - 306} className={paper} />
      <path d="M1440,306 L1473,284 L1506,306 Z" className={paper} />
      <path d="M1449,303 L1473,287.5 L1497,303 Z" fill="none" strokeWidth={0.6} opacity={0.6} />
      <circle cx={1473} cy={297} r={5.5} className={paper} strokeWidth={0.9} />
      <path d="M1471.2,293 H1474.8 V295.2 H1477 V298.8 H1474.8 V301 H1471.2 V298.8 H1469 V295.2 H1471.2 Z" fill="currentColor" stroke="none" />
      <path d="M1452,306 V402 M1494,306 V402" strokeWidth={0.7} opacity={0.7} />
      <path d="M1466,354 V340 A7,7 0 0 1 1480,340 V354 Z" className={paper} strokeWidth={0.9} />
      <path d="M1466,354 V340 A7,7 0 0 1 1480,340 V354 Z" fill={url(ids.hatchD)} stroke="none" />
      <path d="M1463,402 V380 A10,10 0 0 1 1483,380 V402 Z" className={paper} />
      <path d="M1463,402 V380 A10,10 0 0 1 1483,380 V402 Z" fill={url(ids.hatchD)} stroke="none" />
      <path d="M1473,370 V402" strokeWidth={0.7} />
      {/* Degraus */}
      <path d="M1456,402 H1490 V405 H1456 Z M1452,405 H1494 V408 H1452 Z" className={paper} strokeWidth={0.9} />
    </g>
  );
}

/** Ambulância voltada para a direita; origem no chão, atrás da roda traseira. */
function Ambulance() {
  const wheels = [18, 88];
  return (
    <g strokeWidth={1.4} strokeLinejoin="round">
      {/* Poeira/fumaça que fica para trás */}
      {[0, 0.4, 0.8].map((delay) => (
        <circle
          key={delay}
          cx={-6}
          cy={-5}
          r={4}
          fill="none"
          strokeWidth={0.8}
          className={cn(
            'animate-scene-puff opacity-0 [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden',
            animated,
          )}
          style={{ animationDelay: `-${delay}s` }}
        />
      ))}
      <path d="M-4,0.6 H110" strokeWidth={0.8} opacity={0.6} />

      <g className={cn('animate-scene-bob motion-reduce:animate-none', animated)}>
        {/* Baú */}
        <path d="M0,-13 V-46 Q0,-50 4,-50 H68 V-13 Z" className={paper} />
        {/* Cabine */}
        <path d="M68,-40 H81 Q83,-40 84,-38 L92,-29 L102,-27.5 Q105,-27 105,-24 V-13 H68 Z" className={paper} />
        <path d="M71,-37 H81 L87,-30 H71 Z" className={paper} strokeWidth={0.9} />
        <path d="M71,-37 H81 L87,-30 H71 Z" fill={url(ids.hatchD)} stroke="none" opacity={0.7} />
        <circle cx={101.5} cy={-21.5} r={1.6} strokeWidth={0.8} className={paper} />
        <path d="M98,-15 H107 V-12 H98 Z" className={paper} strokeWidth={0.9} />
        {/* Faixa lateral */}
        <path d="M0,-24 H105 V-20 H0 Z" fill={url(ids.hatchD)} stroke="none" opacity={0.6} />
        <path d="M0,-24 H105 M0,-20 H105" strokeWidth={0.6} />
        {/* Cruz */}
        <path d="M30.5,-43 H37.5 V-39.5 H41 V-32.5 H37.5 V-29 H30.5 V-32.5 H27 V-39.5 H30.5 Z" fill="currentColor" stroke="none" />
        {/* Porta lateral do baú */}
        <path d="M50,-46 H64 V-15 H50 Z" fill="none" strokeWidth={0.8} />
        <path d="M53,-43 H61 V-36 H53 Z" fill={url(ids.hatchD)} strokeWidth={0.7} />
        <path d="M51.5,-30 H54" strokeWidth={1} />
        {/* Sinalizador no teto */}
        <path d="M56,-50 V-53 Q56,-54 57,-54 H65 Q66,-54 66,-53 V-50 Z" className={paper} strokeWidth={1} />
        <path d="M61,-56.5 V-60 M56.5,-55.5 L54,-58 M65.5,-55.5 L68,-58" strokeWidth={0.7} strokeLinecap="round" opacity={0.7} />
        {/* Caixas de roda */}
        {wheels.map((x) => (
          <g key={x}>
            <path d={`M${x - 12},-13 A12,12 0 0 1 ${x + 12},-13 Z`} className={paper} stroke="none" />
            <path d={`M${x - 12},-13 A12,12 0 0 1 ${x + 12},-13 Z`} fill={url(ids.hatchD)} strokeWidth={1} />
          </g>
        ))}
      </g>

      {wheels.map((x) => (
        <g key={x} transform={`translate(${x} -9.5)`}>
          <circle r={9.5} className={paper} />
          <g
            className={cn(
              'animate-scene-spin [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none',
              animated,
            )}
          >
            <circle r={6.2} fill="none" strokeWidth={0.8} />
            <path d="M0,-2.4 V-6.2 M2.3,-0.7 L5.9,-1.9 M1.4,1.9 L3.6,5 M-1.4,1.9 L-3.6,5 M-2.3,-0.7 L-5.9,-1.9" strokeWidth={0.8} />
          </g>
          <circle r={2.4} fill="currentColor" stroke="none" />
        </g>
      ))}
    </g>
  );
}

export function EngravedScene({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  // Só anima com a gravura na tela; fora dela, pausa (como o vídeo da referência).
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const arches = ARCH_CENTERS.map((c) => ({ c, ...archRing(c), shadow: archShadow(c) }));

  return (
    <svg
      ref={ref}
      viewBox={`0 ${-SKY} ${WIDTH} ${HEIGHT + SKY}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      data-offscreen={offscreen || undefined}
      className={cn('group pointer-events-none text-foreground select-none', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <defs>
        <pattern id={ids.hatchH} width={8} height={5} patternUnits="userSpaceOnUse">
          <path d="M0,2.5 H8" strokeWidth={0.6} />
        </pattern>
        <pattern id={ids.hatchD} width={3.4} height={3.4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M1.7,0 V3.4" strokeWidth={0.7} />
        </pattern>
        <pattern id={ids.hatchV} width={2.6} height={4} patternUnits="userSpaceOnUse">
          <path d="M1.3,0 V4" strokeWidth={0.6} />
        </pattern>
        <pattern id={ids.masonry} width={36} height={14} patternUnits="userSpaceOnUse">
          <rect width={36} height={14} className={paper} stroke="none" />
          <path
            d="M0,3.5 H36 M0,10.5 H36 M9,3.5 V10.5 M27,10.5 V14 M27,0 V3.5"
            strokeWidth={0.6}
            strokeOpacity={0.4}
            strokeLinecap="butt"
          />
        </pattern>
        <pattern id={ids.dentils} width={12} height={4} patternUnits="userSpaceOnUse">
          <rect width={6} height={4} fill="currentColor" stroke="none" opacity={0.55} />
        </pattern>
        {/* A hachura dos morros só sombreia perto da crista e some antes da
            estrada: os vãos dos arcos ficam limpos, como papel. */}
        <linearGradient id={ids.fade} x1={0} y1={300} x2={0} y2={392} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={ids.hillsMask} maskUnits="userSpaceOnUse" x={0} y={0} width={WIDTH} height={HEIGHT}>
          <rect width={WIDTH} height={HEIGHT} fill={url(ids.fade)} />
        </mask>
      </defs>

      {/* Céu: nuvens e pássaros em traço leve */}
      <g strokeWidth={1} opacity={0.35}>
        <path d="M90,240 H170 M112,246 H204 M80,252 H150" />
        <path d="M1180,210 H1270 M1158,216 H1300 M1202,222 H1262" />
        <path d="M1440,252 H1500 M1420,258 H1530" />
      </g>
      <g strokeWidth={1} opacity={0.6}>
        {[
          [360, 262],
          [384, 254],
          [399, 270],
        ].map(([x, y]) => (
          <path key={x} d={`M${x - 5},${y} Q${x - 2.5},${y - 3} ${x},${y} Q${x + 2.5},${y - 3} ${x + 5},${y}`} />
        ))}
      </g>

      {/* Morros ao fundo */}
      <path
        d={`M-10,350 C80,330 140,312 220,318 S380,346 470,340 S620,318 720,324 S900,350 1010,344 S1180,316 1290,306 S1480,330 1610,322 V${WATER_Y} H-10 Z`}
        fill={url(ids.hatchH)}
        stroke="none"
        opacity={0.45}
        mask={url(ids.hillsMask)}
      />
      <path
        d="M-10,350 C80,330 140,312 220,318 S380,346 470,340 S620,318 720,324 S900,350 1010,344 S1180,316 1290,306 S1480,330 1610,322"
        strokeWidth={0.9}
        opacity={0.5}
      />
      <Village />

      {/* Margem direita (atrás do viaduto, aparece no último vão) */}
      <RightBank />

      {/* Rio */}
      <g strokeWidth={0.8} opacity={0.45}>
        <path d={`M0,${WATER_Y + 5} H1600`} strokeDasharray="44 9 14 7" />
        <path d={`M12,${WATER_Y + 11} H1600`} strokeDasharray="28 12 36 8" />
        <path d={`M0,${WATER_Y + 17} H1600`} strokeDasharray="18 10 52 6" />
        <path d={`M30,${WATER_Y + 23} H1600`} strokeDasharray="60 14 20 9" />
      </g>
      <g strokeWidth={0.8} opacity={0.35} strokeDasharray="5 4">
        {PIER_LEFTS.map((x) => (
          <path key={x} d={`M${x + 6},${WATER_Y + 2} V${HEIGHT} M${x + 16},${WATER_Y + 4} V${HEIGHT} M${x + 26},${WATER_Y + 2} V${HEIGHT}`} />
        ))}
      </g>

      {/* Viaduto */}
      <path d={wallOutline()} fill={url(ids.masonry)} strokeWidth={1.3} strokeLinejoin="round" />
      {arches.map(({ c, shadow }) => (
        <path key={c} d={shadow} fill={url(ids.hatchD)} stroke="none" opacity={0.6} />
      ))}
      {arches.map(({ c, ring, joints, keystone }) => (
        <g key={c} strokeWidth={0.9}>
          <path d={ring} className={paper} />
          <path d={joints} />
          <path d={keystone} className={paper} />
        </g>
      ))}
      {PIER_LEFTS.map((x) => (
        <g key={x}>
          <rect x={x - 4} y={FOOT_Y - 2} width={40} height={WATER_Y - FOOT_Y + 2} className={paper} strokeWidth={1} />
          <rect x={x - 4} y={FOOT_Y - 2} width={40} height={WATER_Y - FOOT_Y + 2} fill={url(ids.hatchD)} stroke="none" opacity={0.4} />
        </g>
      ))}
      <path d={`M${WALL_LEFT},${ROAD_Y + 12.5} H${WALL_RIGHT}`} strokeWidth={0.7} opacity={0.6} />
      <rect x={WALL_LEFT} y={ROAD_Y + 8} width={WALL_RIGHT - WALL_LEFT} height={4} fill={url(ids.dentils)} stroke="none" />
      <rect x={WALL_LEFT} y={ROAD_Y} width={WALL_RIGHT - WALL_LEFT + 6} height={8} className={paper} strokeWidth={1.2} />

      {/* Ambulância: o grupo de fora anda (CSS), o de dentro posiciona (atributo). */}
      <g className={cn('animate-scene-drive motion-reduce:animate-none', animated)}>
        <g transform={`translate(${AMBULANCE_X} ${ROAD_Y})`}>
          <Ambulance />
        </g>
      </g>

      {/* Na frente da estrada: árvore e hospital escondem a chegada */}
      <g transform={`translate(${HOSPITAL_SHIFT} 0)`}>
        <Hospital />
      </g>
      <Tree x={1530} baseY={404} r={15} />
      <Tree x={1556} baseY={406} r={10} />
    </svg>
  );
}
