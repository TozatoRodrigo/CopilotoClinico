import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ShieldCheck,
  Microphone,
  Brain,
  FileText,
  Fingerprint,
  Scale,
} from '@phosphor-icons/react';

const STEPS = [
  {
    icon: Microphone,
    title: 'Capture o caso por voz',
    description:
      'Fale ou digite o quadro clínico. O copiloto identifica recursos disponíveis (TC, laboratório, UTI) e red flags automaticamente.',
    direction: 'left' as const,
  },
  {
    icon: Brain,
    title: 'Receba recomendações fundamentadas',
    description:
      'Diretrizes clínicas (ACLS, ATLS, protocolos institucionais) com citação de fonte e nível de evidência. Perguntas bloqueadoras antes da conduta.',
    direction: 'right' as const,
  },
  {
    icon: FileText,
    title: 'Gere documentos e confirme',
    description:
      'SOAP, SBAR, prescrição, alta ou atestado a partir da análise. Você revisa, edita e assina digitalmente com trilha de auditoria.',
    direction: 'left' as const,
  },
];

const PROOFS = [
  {
    icon: ShieldCheck,
    label: 'LGPD compliant',
    detail: 'Consentimento explícito, dados criptografados, direito ao esquecimento',
  },
  {
    icon: Fingerprint,
    label: 'MFA obrigatório',
    detail: 'TOTP + backup codes — acesso protegido por padrão médico-legal',
  },
  {
    icon: Scale,
    label: 'CFM responsável',
    detail: 'Copiloto, não substituto — você mantém decisão clínica e autoria do documento',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-clinical-paper">
      <header className="sticky top-0 z-50 border-b border-clinical-line bg-clinical-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 md:px-6">
          <span className="font-display text-lg tracking-tight text-clinical-ink">
            Copiloto Clínico
          </span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-20 pb-24 md:px-6">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <div className="space-y-6">
              <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-clinical-ink md:text-5xl">
                Seu copiloto <span className="text-clinical-teal">no plantão</span>
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                Recomendações clínicas fundamentadas em diretrizes, no momento da decisão. Voz →
                análise → documento — você confirma, o sistema registra.
              </p>
              <div>
                <Button size="lg" className="h-12 px-8 text-base" asChild>
                  <Link href="/register">Criar conta com CRM</Link>
                </Button>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Copiloto, não substituto — você mantém a decisão clínica.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-xl border border-clinical-line bg-white p-6 shadow-2xs">
                <div className="mb-4 flex items-center gap-2">
                  <div className="size-2.5 rounded-full bg-clinical-teal" />
                  <span className="font-mono text-xs text-muted-foreground">Captura</span>
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg bg-clinical-teal-tint px-3 py-2">
                    <p className="text-sm text-clinical-teal-deep">
                      "Paciente masculino, 62 anos, dor torácica em aperto há 40min, irrigação SUS,
                      TC disponível…"
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="size-2 rounded-full bg-clinical-green" />
                    <span>2 recomendações · 1 pergunta bloqueadora</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-clinical-line bg-white py-20">
          <div className="mx-auto max-w-5xl px-4 md:px-6">
            <h2 className="mb-12 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Como funciona
            </h2>
            <div className="space-y-16">
              {STEPS.map((step) => (
                <div
                  key={step.title}
                  className={`grid items-center gap-8 md:grid-cols-2 ${
                    step.direction === 'right' ? 'md:[direction:rtl]' : ''
                  }`}
                >
                  <div
                    className={`space-y-3 ${
                      step.direction === 'right' ? 'md:[direction:ltr]' : ''
                    }`}
                  >
                    <step.icon className="size-8 text-clinical-teal" />
                    <h3 className="font-display text-xl text-clinical-ink">{step.title}</h3>
                    <p className="leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                  <div
                    className={`flex items-center justify-center ${
                      step.direction === 'right' ? 'md:[direction:ltr]' : ''
                    }`}
                  >
                    <div className="size-40 rounded-2xl border border-clinical-line bg-clinical-paper" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-clinical-line py-16">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2 className="mb-8 text-center font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Segurança & conformidade
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {PROOFS.map((proof) => (
                <div
                  key={proof.label}
                  className="space-y-2 rounded-lg border border-clinical-line bg-white px-4 py-5 text-center"
                >
                  <proof.icon className="mx-auto size-7 text-clinical-teal" />
                  <p className="font-medium text-foreground">{proof.label}</p>
                  <p className="text-sm text-muted-foreground">{proof.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-clinical-line py-6">
        <div className="mx-auto max-w-5xl px-4 text-center md:px-6">
          <p className="font-mono text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Copiloto Clínico de Plantão
          </p>
        </div>
      </footer>
    </div>
  );
}
