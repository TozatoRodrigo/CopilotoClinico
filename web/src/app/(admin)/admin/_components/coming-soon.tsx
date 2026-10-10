import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { ArrowRight, Circle, Hourglass } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';

/**
 * S20-UX-01 — página de área ainda não pronta (escondida do sidebar, mas
 * acessível por URL). Diz com honestidade que é "em breve", o que está
 * planejado e onde resolver a tarefa hoje.
 */
export function ComingSoonPage({
  icon,
  title,
  summary,
  planned,
  meanwhile,
}: {
  icon: ElementType;
  title: string;
  /** Frase do que a área vai fazer (aparece no callout). */
  summary: ReactNode;
  planned: string[];
  meanwhile: { href: string; label: string; description: string; icon: ElementType }[];
}) {
  return (
    <Page width="narrow">
      <PageHeader
        icon={icon}
        eyebrow={<Badge variant="secondary">Em breve</Badge>}
        title={title}
      />

      <Callout tone="gray" icon={<Hourglass />} title="Ainda não disponível">
        {summary}
      </Callout>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Planejado" />
        <ul className="flex flex-col gap-1.5">
          {planned.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] text-muted-foreground">
              <Circle className="mt-[0.4375rem] size-2 shrink-0 text-fg-tertiary" weight="fill" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Enquanto isso" />
        <ul className="divide-y divide-border border-y border-border">
          {meanwhile.map((link) => {
            const LinkIcon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex min-h-12 items-center gap-3 px-2 py-2.5 transition-colors duration-75 hover:bg-hover/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <LinkIcon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{link.label}</span>
                    <span className="block text-[0.8125rem] text-muted-foreground">{link.description}</span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-fg-tertiary transition-colors group-hover:text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}
