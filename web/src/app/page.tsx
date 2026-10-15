'use client';

import Link from 'next/link';
import type { ElementType } from 'react';
import {
  ArrowRight,
  FileText,
  LockKey,
  Microphone,
  SealCheck,
  ShieldCheck,
  Stethoscope,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { LandingFooter } from './_components/landing-footer';
import { PublicHeader } from './_components/public-chrome';
import { ProductShot } from './_components/product-shot';

interface Block {
  icon: ElementType;
  label: string;
  title: string;
  description: string;
}

// O mesmo fluxo que o copiloto percorre em todo caso real: Captura → Análise → Documento.
const STEPS: Block[] = [
  {
    icon: Microphone,
    label: 'Captura',
    title: 'Capture o caso por voz',
    description:
      'Fale ou digite o quadro clínico. O copiloto identifica recursos disponíveis (TC, laboratório, UTI) e red flags automaticamente.',
  },
  {
    icon: Stethoscope,
    label: 'Análise',
    title: 'Receba recomendações fundamentadas',
    description:
      'Diretrizes clínicas (ACLS, ATLS, protocolos institucionais) com citação de fonte e nível de evidência. Perguntas bloqueadoras antes da conduta.',
  },
  {
    icon: FileText,
    label: 'Documento',
    title: 'Gere documentos e confirme',
    description:
      'SOAP, SBAR, prescrição, alta ou atestado a partir da análise. Você revisa, edita e assina digitalmente com trilha de auditoria.',
  },
];

const TRUST: Block[] = [
  {
    icon: SealCheck,
    label: 'CFM',
    title: 'Confirmação humana auditável',
    description: 'Nenhuma conduta vira documento sem a sua confirmação, e tudo fica registrado.',
  },
  {
    icon: ShieldCheck,
    label: 'LGPD',
    title: 'Pseudonimização e filtro de PII',
    description: 'O identificador do paciente é pseudonimizado e dados pessoais são filtrados antes da IA.',
  },
  {
    icon: LockKey,
    label: 'auditoria',
    title: 'Cadeia de hash verificada',
    description:
      'Cada decisão entra numa trilha encadeada por hash, verificada todos os dias; qualquer alteração fica evidente.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pt-14 sm:px-6 md:pt-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-tone-gray-bg px-3 py-1 text-[0.8125rem] font-medium text-muted-foreground">
              <Stethoscope className="size-3.5" aria-hidden="true" />
              Copiloto para o plantão de emergência
            </p>
            <h1 className="font-display text-[2.5rem] leading-[1.08] tracking-tight text-balance text-foreground sm:text-6xl md:text-[4.25rem]">
              A conduta é sua.
              <br />
              A papelada é nossa.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground md:text-xl">
              SOAP, SBAR e prescrições geradas do seu ditado, com evidência citada, perguntas que
              mudam a conduta e trilha de auditoria verificável.
            </p>
            <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Criar conta com CRM
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Já tenho conta</Link>
              </Button>
            </div>
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              Leva menos de 1 minuto. Você só precisa do seu CRM.
            </p>
          </div>

          <ProductShot className="mx-auto mt-14 max-w-5xl md:mt-20" />
        </section>

        {/* Confiança: CFM, LGPD e cadeia de hash */}
        <section aria-labelledby="confianca" className="px-4 pt-20 sm:px-6 md:pt-28">
          <div className="mx-auto max-w-5xl">
            <h2 id="confianca" className="sr-only scroll-mt-20">
              Segurança e conformidade
            </h2>
            <ul className="grid gap-6 border-y border-border py-8 sm:grid-cols-3 sm:gap-8">
              {TRUST.map(({ icon: Icon, label, title, description }) => (
                <li key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {title} <span className="font-normal text-muted-foreground">({label})</span>
                    </p>
                    <p className="text-[0.8125rem] text-pretty text-muted-foreground">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Como funciona */}
        <section aria-labelledby="como-funciona" className="px-4 pt-20 sm:px-6 md:pt-28">
          <div className="mx-auto max-w-5xl">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Como funciona</p>
              <h2
                id="como-funciona"
                className="scroll-mt-28 font-display text-3xl tracking-tight text-balance text-foreground md:text-[2.75rem] md:leading-[1.1]"
              >
                Do ditado ao documento assinado, sem sair do plantão.
              </h2>
            </div>
            <ol className="mt-10 grid gap-3 md:mt-14 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, label, title, description }, index) => (
                <li key={title} className="flex flex-col gap-3 rounded-lg bg-sidebar p-6">
                  <Icon className="size-8 text-foreground" weight="duotone" aria-hidden="true" />
                  <p className="pt-2 text-[0.8125rem] font-medium text-muted-foreground">
                    {index + 1} · {label}
                  </p>
                  <h3 className="-mt-1.5 text-lg font-semibold text-foreground">{title}</h3>
                  <p className="text-[0.9375rem] text-pretty text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA final */}
        <section className="px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h2 className="font-display text-3xl tracking-tight text-balance text-foreground md:text-5xl">
              Pronto para o próximo plantão?
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Crie sua conta com CRM e comece em menos de 1 minuto.
            </p>
            <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">Criar conta com CRM</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/login">Entrar</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
