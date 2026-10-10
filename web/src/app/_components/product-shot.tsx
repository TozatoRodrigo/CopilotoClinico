'use client';

/**
 * "Product shot" da landing feito em HTML/CSS com os mesmos tokens e
 * primitivos do app (sidebar do Notion, propriedades, callout, tags), em vez
 * de uma imagem: acompanha o tema claro/escuro e nunca fica desatualizado em
 * relação ao visual real.
 *
 * É ilustrativo: fica fora da árvore de acessibilidade (`aria-hidden` +
 * `inert`) e é descrito por uma legenda só para leitores de tela.
 */
import type { ElementType, ReactNode } from 'react';
import {
  BookOpen,
  CalendarBlank,
  CaretUpDown,
  CircleDashed,
  ClipboardText,
  Heartbeat,
  House,
  MagnifyingGlass,
  Plus,
  Question,
  SealCheck,
  Tag,
  User,
} from '@phosphor-icons/react';
import { LogoMark } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { cn } from '@/lib/utils';

function SidebarItem({
  icon: Icon,
  label,
  count,
  active,
  accent,
}: {
  icon: ElementType;
  label: string;
  count?: number;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-md px-2 font-medium',
        active ? 'bg-active text-foreground' : 'text-sidebar-foreground',
      )}
    >
      <Icon
        weight={active ? 'fill' : 'regular'}
        className={cn(
          'size-[18px] shrink-0',
          accent ? 'text-primary' : active ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </div>
  );
}

function Recommendation({ index, children, evidence }: { index: number; children: ReactNode; evidence: string }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className="w-4 shrink-0 pt-px text-right text-muted-foreground tabular-nums">{index}.</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
      <Badge variant="gray" className="mt-0.5">
        {evidence}
      </Badge>
    </li>
  );
}

// Botões de mentira (a figura é inerte): mesma aparência do `outline`, com
// fundo da página também no escuro para destacar sobre o callout.
const fakeButton = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'dark:bg-background');

export function ProductShot({ className }: { className?: string }) {
  return (
    <figure className={cn('w-full', className)}>
      <div
        aria-hidden="true"
        inert
        className="overflow-hidden rounded-xl border border-border bg-background text-left text-sm shadow-lg select-none"
      >
        {/* Barra da janela */}
        <div className="flex h-9 items-center gap-1.5 border-b border-border bg-sidebar px-3.5">
          <span className="size-2.5 rounded-full bg-tone-gray-tag" />
          <span className="size-2.5 rounded-full bg-tone-gray-tag" />
          <span className="size-2.5 rounded-full bg-tone-gray-tag" />
        </div>

        <div className="flex">
          {/* Sidebar do workspace (só no desktop, como no app) */}
          <div className="hidden w-56 shrink-0 flex-col gap-px border-r border-sidebar-border bg-sidebar p-2 md:flex">
            <div className="mb-1 flex h-[30px] items-center gap-2 px-1.5">
              <LogoMark size="sm" />
              <span className="flex-1 truncate font-semibold text-foreground">Pronto-socorro</span>
              <CaretUpDown className="size-3.5 text-muted-foreground" />
            </div>
            <SidebarItem icon={MagnifyingGlass} label="Buscar" />
            <SidebarItem icon={House} label="Plantão" count={2} active />
            <SidebarItem icon={Plus} label="Novo caso" accent />
            <p className="mt-4 px-2 pb-1 text-xs font-medium text-muted-foreground">Workspace</p>
            <SidebarItem icon={ClipboardText} label="Casos" count={23} />
            <SidebarItem icon={BookOpen} label="Diretrizes" />
            <div className="flex-1" />
            <p className="flex h-[30px] items-center gap-2 px-2 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-clinical-green" />
              Online · fila sincronizada
            </p>
          </div>

          {/* Página do caso */}
          <div className="min-w-0 flex-1">
            <div className="flex h-10 items-center gap-1.5 px-4 text-[0.8125rem] text-muted-foreground">
              <span>Casos</span>
              <span className="text-fg-tertiary">/</span>
              <span className="truncate text-foreground">Leito 4 · JMS</span>
            </div>

            <div className="mx-auto flex max-w-[620px] flex-col gap-5 px-4 pt-3 pb-8 sm:px-8 sm:pt-6 sm:pb-10">
              <div className="flex flex-col gap-2.5">
                <Heartbeat weight="duotone" className="-ml-0.5 size-10 text-tone-gray" />
                <p className="font-display text-2xl text-balance text-foreground sm:text-[1.75rem]">
                  Dor torácica em aperto há 40 min
                </p>
                <PropertyList className="text-[0.8125rem]">
                  <PropertyRow icon={User} label="Paciente" className="min-h-[30px]">
                    Leito 4 · JMS
                  </PropertyRow>
                  <PropertyRow icon={Tag} label="Vertical" className="min-h-[30px]">
                    <Badge variant="purple">Cardíaco</Badge>
                  </PropertyRow>
                  <PropertyRow icon={CircleDashed} label="Status" className="min-h-[30px]">
                    <Badge>Em revisão</Badge>
                  </PropertyRow>
                  <PropertyRow icon={CalendarBlank} label="Criado" className="min-h-[30px]">
                    há 42 min
                  </PropertyRow>
                </PropertyList>
              </div>

              <Callout tone="orange" icon={<Question weight="fill" />} title="Pergunta bloqueadora">
                <p>Há supradesnivelamento de ST no ECG de 12 derivações? A resposta muda a conduta de reperfusão.</p>
                <div className="mt-2.5 flex gap-1.5">
                  <span className={fakeButton}>Sim</span>
                  <span className={fakeButton}>Não</span>
                </div>
              </Callout>

              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  Recomendações
                  <span className="font-normal text-muted-foreground tabular-nums">2</span>
                </p>
                <ol className="flex flex-col">
                  <Recommendation index={1} evidence="Evidência A">
                    AAS 300 mg mastigado, se não houver contraindicação
                  </Recommendation>
                  <Recommendation index={2} evidence="Evidência B">
                    ECG de 12 derivações em até 10 min da chegada
                  </Recommendation>
                </ol>
              </div>

              <div className="flex items-center gap-3 rounded-md bg-tone-green-bg px-4 py-3 text-tone-green-ink">
                <SealCheck weight="fill" className="size-5 shrink-0 text-tone-green" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Documento SOAP confirmado</p>
                  <p className="truncate text-[0.8125rem] opacity-90">
                    Assinado por você · hash sha-256 <span className="font-mono">9f2c…e41a</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Exemplo de um caso no Copiloto Clínico: dor torácica com uma pergunta bloqueadora que muda a
        conduta, duas recomendações com nível de evidência e o documento SOAP confirmado com hash
        registrado.
      </figcaption>
    </figure>
  );
}
