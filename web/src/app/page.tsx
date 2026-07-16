'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Stethoscope,
  SealCheck,
  ShieldCheck,
  LockKey,
  Microphone,
  Brain,
  FileText,
} from '@phosphor-icons/react';

const STEPS = [
  {
    icon: Microphone,
    title: 'Capture o caso por voz',
    description:
      'Fale ou digite o quadro clínico. O copiloto identifica recursos disponíveis (TC, laboratório, UTI) e red flags automaticamente.',
  },
  {
    icon: Brain,
    title: 'Receba recomendações fundamentadas',
    description:
      'Diretrizes clínicas (ACLS, ATLS, protocolos institucionais) com citação de fonte e nível de evidência. Perguntas bloqueadoras antes da conduta.',
  },
  {
    icon: FileText,
    title: 'Gere documentos e confirme',
    description:
      'SOAP, SBAR, prescrição, alta ou atestado a partir da análise. Você revisa, edita e assina digitalmente com trilha de auditoria.',
  },
];

const TRUST_BULLETS = [
  { icon: SealCheck, text: 'Confirmação humana auditável (CFM)' },
  { icon: ShieldCheck, text: 'Pseudonimização e filtro de PII (LGPD)' },
  { icon: LockKey, text: 'Cadeia de hash verificada diariamente' },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-clinical-paper">
      <header className="sticky top-0 z-50 border-b border-clinical-line bg-clinical-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 md:px-6">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--sidebar-dark-bg)' }}
            >
              <Stethoscope className="size-4" style={{ color: 'var(--sidebar-dark-accent)' }} />
            </span>
            <span className="font-display text-lg tracking-tight text-clinical-ink">
              Copiloto Clínico
            </span>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero with dark brand panel */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 pt-16 pb-24 md:grid-cols-2 md:gap-16 md:px-6 md:pt-20">
            <div className="space-y-6">
              <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-clinical-ink md:text-[2.75rem]">
                A conduta é sua.<br />
                <span className="text-clinical-teal">A papelada é nossa.</span>
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                SOAP, SBAR e prescrições geradas do seu ditado, com evidência citada e trilha de auditoria inviolável.
              </p>
              <div>
                <Button size="lg" className="h-12 gap-2 px-8 text-base shadow-[0_4px_14px_rgba(14,124,123,0.3)]" asChild>
                  <Link href="/register">
                    Entrar no plantão
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col gap-2.5 pt-2">
                {TRUST_BULLETS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon className="size-4 shrink-0 fill text-clinical-teal" />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* Demo card */}
            <div className="relative">
              <div className="rounded-xl border border-clinical-line bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="size-2.5 rounded-full bg-clinical-teal" />
                  <span className="font-mono text-xs text-muted-foreground">Captura ao vivo</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-clinical-teal-tint px-3 py-2">
                    <p className="text-sm text-clinical-teal-deep">
                      "Paciente masculino, 62 anos, dor torácica em aperto há 40min…"
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="size-2 rounded-full bg-clinical-green" />
                    <span>2 recomendações · 1 pergunta bloqueadora · evidência A</span>
                  </div>
                  <div className="rounded-lg border border-clinical-green/20 bg-clinical-green-bg px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-clinical-green-foreground">
                      <SealCheck className="size-3.5" weight="fill" />
                      Documento SOAP confirmado · hash sha-256 registrado
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-clinical-line bg-white py-20">
          <div className="mx-auto max-w-5xl px-4 md:px-6">
            <h2 className="mb-12 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Como funciona
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'var(--sidebar-dark-bg)' }}
                    >
                      <step.icon className="size-5" style={{ color: 'var(--sidebar-dark-accent)' }} />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="font-display text-lg text-clinical-ink">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-clinical-line py-16">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
            <h2 className="font-display text-2xl text-clinical-ink md:text-3xl">
              Pronto para o próximo plantão?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Crie sua conta com CRM e comece em menos de 1 minuto.
            </p>
            <div className="mt-6">
              <Button size="lg" className="h-12 gap-2 px-8 shadow-[0_4px_14px_rgba(14,124,123,0.3)]" asChild>
                <Link href="/register">
                  Criar conta com CRM
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-clinical-line py-6">
        <div className="mx-auto max-w-5xl px-4 text-center md:px-6">
          <p className="font-mono text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Copiloto Clínico de Plantão — Strivium
          </p>
        </div>
      </footer>
    </div>
  );
}
