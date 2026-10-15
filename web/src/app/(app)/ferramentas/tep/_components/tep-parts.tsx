'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Info, Warning, WarningOctagon } from '@phosphor-icons/react';
import type {
  RecommendationClass,
  TepDrugBlock,
  TepNotice,
  TepNoticeTone,
  TepOption,
} from '@clinical-tools/tep/content';
import { TEP_STEP_LABELS } from '@clinical-tools/tep/content';
import {
  infusionDrugHref,
  linkedToolHref,
  type TepLink,
  type TepReferenceSectionId,
} from '@clinical-tools/tep/links';
import { tepStepNumber, type TepStep } from '@clinical-tools/tep/pathway';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ProgressSteps } from '@/components/ui/progress-steps';
import type { Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Peças da tela do TEP: aviso, link, bloco de droga, opções e cabeçalho de
 * passo. Todo texto vem do motor (`@clinical-tools/tep/content`); aqui só o
 * desenho no design system.
 */

/** Aviso do roteiro → tom do design system (ADR-017: verde do ANY vira cinza). */
const NOTICE_TONE: Record<TepNoticeTone, Tone> = {
  neutral: 'gray',
  attention: 'orange',
  critical: 'red',
  info: 'blue',
};

const NOTICE_ICON = {
  neutral: Info,
  attention: Warning,
  critical: WarningOctagon,
  info: Info,
} as const;

/** Abre uma seção da aba Referência (o "Ver contraindicações" do roteiro). */
export const OpenReferenceContext = createContext<(section: TepReferenceSectionId) => void>(
  () => {},
);

export function CorBadge({ cor }: { cor: RecommendationClass }) {
  return <Badge variant={cor.startsWith('3') ? 'destructive' : 'gray'}>COR {cor}</Badge>;
}

const LINK_CLASS =
  'h-auto min-h-10 justify-start px-0 text-left whitespace-normal max-sm:h-auto max-sm:px-0';

/**
 * Link do roteiro: droga em Infusões, outra ferramenta ou seção da
 * Referência. Ferramenta ainda "em breve" abre a página de "em breve" dela.
 */
export function TepLinkAction({ link }: { link: TepLink }) {
  const openReference = useContext(OpenReferenceContext);
  if (link.kind === 'referencia') {
    return (
      <Button
        type="button"
        variant="link"
        className={LINK_CLASS}
        onClick={() => openReference(link.section)}
      >
        <BookOpen aria-hidden="true" />
        {link.label}
      </Button>
    );
  }
  const href = link.kind === 'infusao' ? infusionDrugHref(link.drug) : linkedToolHref(link.toolId);
  return (
    <Button asChild variant="link" className={LINK_CLASS}>
      <Link href={href}>
        {link.label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function LinkRow({ links }: { links: readonly TepLink[] }) {
  return (
    <div className="flex flex-wrap gap-x-5">
      {links.map((link) => (
        <TepLinkAction key={`${link.kind}-${link.label}`} link={link} />
      ))}
    </div>
  );
}

/**
 * Aviso do roteiro como callout. Os links ficam abaixo do bloco, fora do
 * fundo colorido: link azul sobre fundo vermelho não passa em contraste.
 */
export function Notice({ notice, className }: { notice: TepNotice; className?: string }) {
  const Icon = NOTICE_ICON[notice.tone];
  const body =
    notice.text || notice.cor ? (
      <>
        {notice.text}
        {notice.cor ? (
          <>
            {' '}
            <CorBadge cor={notice.cor} />
          </>
        ) : null}
      </>
    ) : null;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Callout tone={NOTICE_TONE[notice.tone]} icon={<Icon />} title={notice.title}>
        {body}
      </Callout>
      {notice.links ? <LinkRow links={notice.links} /> : null}
    </div>
  );
}

export function DrugBlockView({ block }: { block: TepDrugBlock }) {
  return (
    <div className="flex flex-col">
      <p className="text-[0.9375rem] text-pretty text-foreground">
        <span className="font-semibold">{block.name}</span> — {block.text}
      </p>
      {block.link ? <TepLinkAction link={block.link} /> : null}
    </div>
  );
}

/** Bloco de um passo (eco, suporte, trombólise): título e conteúdo dentro de uma borda. */
export function StepBlock({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-lg border border-border p-4', className)}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Respostas que fazem o roteiro andar (o ANY usava um botão por resposta):
 * botões de largura total, alvo de toque de 44px, texto quebrando em linhas.
 */
export function OptionList<T extends string>({
  label,
  options,
  onSelect,
  className,
}: {
  label: string;
  options: readonly TepOption<T>[];
  onSelect: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="outline"
          className="h-auto min-h-11 justify-start px-3 py-2.5 text-left text-[0.9375rem] whitespace-normal max-sm:h-auto"
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Cabeçalho de cada passo: a trilha dos quatro passos do ANY e o título. O
 * título recebe o foco quando o passo muda, para teclado e leitor de tela
 * seguirem o roteiro.
 */
export function StepHeader({
  step,
  title,
  description,
  eyebrow,
  headingRef,
}: {
  step: TepStep;
  title: string;
  description?: string;
  eyebrow?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const number = tepStepNumber(step);
  return (
    <div className="flex flex-col gap-3">
      <ProgressSteps
        steps={[...TEP_STEP_LABELS]}
        currentStep={number - 1}
        aria-label="Passos do roteiro"
      />
      <div className="flex flex-col gap-1">
        <p className="text-[0.8125rem] text-muted-foreground">
          {eyebrow ?? `Passo ${number} de ${TEP_STEP_LABELS.length}`}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-foreground focus-visible:outline-none"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-[0.9375rem] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
