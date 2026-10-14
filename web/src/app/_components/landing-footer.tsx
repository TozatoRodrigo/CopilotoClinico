'use client';

/**
 * Rodapé da landing em estilo gravura: ocupa a altura da tela, com marca,
 * nome, tagline, navegação e copyright centralizados no topo e a gravura do
 * viaduto preenchendo o resto. A gravura sobe 12svh por baixo do texto — o
 * topo dela é só céu, então tudo lê como uma ilustração só, e a ambulância
 * sempre passa abaixo do copyright (o SVG recorta o que sair da área dele).
 *
 * Só a landing usa este rodapé; /privacidade e a 404 seguem com o PublicFooter.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { EngravedScene } from './engraved-scene';

const NAV = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#confianca', label: 'Segurança' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/privacidade#contato', label: 'Contato' },
  { href: '/login', label: 'Entrar' },
  { href: '/register', label: 'Criar conta' },
];

// Estetoscópio do LogoMark (Phosphor "regular", grade de 256).
const STETHOSCOPE =
  'M220,160a12,12,0,1,1-12-12A12,12,0,0,1,220,160Zm-4.55,39.29A48.08,48.08,0,0,1,168,240H144a48.05,48.05,0,0,1-48-48V151.49A64,64,0,0,1,40,88V40a8,8,0,0,1,8-8H72a8,8,0,0,1,0,16H56V88a48,48,0,0,0,48.64,48c26.11-.34,47.36-22.25,47.36-48.83V48H136a8,8,0,0,1,0-16h24a8,8,0,0,1,8,8V87.17c0,32.84-24.53,60.29-56,64.31V192a32,32,0,0,0,32,32h24a32.06,32.06,0,0,0,31.22-25,40,40,0,1,1,16.23.27ZM232,160a24,24,0,1,0-24,24A24,24,0,0,0,232,160Z';

/**
 * A marca em traço de gravura: o quadrado do LogoMark com contorno duplo e o
 * auscultador hachurado. Decorativa — o nome logo abaixo já identifica.
 */
function EngravedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" className={className}>
      <defs>
        <pattern id="landing-mark-hatch" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M7,0 V14" strokeWidth={5} />
        </pattern>
      </defs>
      <rect x={2.5} y={2.5} width={59} height={59} rx={14} strokeWidth={2.4} />
      <rect x={7} y={7} width={50} height={50} rx={10} strokeWidth={0.8} opacity={0.5} />
      <g transform="translate(13 13) scale(0.1484)">
        <circle cx={208} cy={160} r={32} fill="url(#landing-mark-hatch)" stroke="none" />
        <path d={STETHOSCOPE} fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Pontos entre os links só na linha única (md+); em grade eles sobrariam soltos.
const navDot =
  'md:not-first:before:mx-[clamp(16px,1.8vw,24px)] md:not-first:before:size-1 md:not-first:before:flex-none md:not-first:before:rounded-full md:not-first:before:bg-foreground';
// Sublinhado que se desenha da esquerda para a direita no hover/foco.
const navUnderline =
  'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-200 hover:after:scale-x-100 focus-visible:after:scale-x-100';

export function LandingFooter() {
  // Altura da tela menos o PublicHeader fixo (h-14): no fim da rolagem, header + rodapé = tela.
  return (
    <footer className="relative isolate flex h-[calc(100svh-3.5rem)] min-h-[36rem] flex-col overflow-hidden bg-sidebar">
      <div className="relative z-10 flex flex-none flex-col items-center px-4 pt-9 text-center">
        <EngravedMark className="block w-[clamp(44px,4.1vw,54px)] text-foreground" />
        <p className="mt-[clamp(6px,0.9vw,12px)] font-serif text-[clamp(2rem,3.6vw,3rem)] leading-none font-semibold tracking-[-0.015em] text-foreground">
          <Link href="/" className="rounded-sm">
            copiloto clínico
          </Link>
        </p>
        <p className="mt-[clamp(14px,1.4vw,18px)] max-w-[48em] text-sm text-pretty text-muted-foreground md:text-[0.9375rem]">
          Da chegada do paciente ao documento assinado. Capture, analise e confirme sem sair do
          plantão.
        </p>

        <nav aria-label="Rodapé" className="mt-7 w-full lg:mt-10">
          <ul className="mx-auto grid max-w-80 grid-cols-2 gap-x-4 gap-y-1 sm:max-w-[34rem] sm:grid-cols-3 md:flex md:max-w-none md:flex-wrap md:items-center md:justify-center md:gap-x-0 md:gap-y-2.5">
            {NAV.map(({ href, label }) => (
              <li key={href} className={cn('flex items-center justify-center', navDot)}>
                <Link
                  href={href}
                  className={cn(
                    'relative rounded-sm py-2 text-[0.9375rem] text-foreground md:py-1 md:text-sm lg:text-[0.9375rem]',
                    navUnderline,
                  )}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-[clamp(22px,2.4vw,30px)] text-xs tracking-[0.01em] text-balance text-muted-foreground">
          © {new Date().getFullYear()} Strivium · A conduta é sempre do médico.
        </p>
      </div>

      <EngravedScene className="-mt-[12svh] block min-h-0 w-full flex-1" />
    </footer>
  );
}
