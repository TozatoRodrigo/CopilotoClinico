import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 md:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Copiloto Clínico
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" asChild>
            <a href="/login">Entrar</a>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="container relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 text-center md:px-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium text-muted-foreground">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                Assistência inteligente em tempo real
              </div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Copiloto Clínico{" "}
                <span className="text-primary">de Plantão</span>
              </h1>

              <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
                Assistência inteligente para médicos de emergência.
                Protocolos clínicos, apoio decisional e gestão de plantões
                em uma única plataforma.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button size="lg" className="text-base px-8" asChild>
                  <a href="/login">Entrar</a>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" asChild>
                  <a href="#features">Saiba mais</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t bg-muted/30 py-20">
          <div className="container px-4 md:px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <h2 className="text-3xl font-bold tracking-tight">
                  Construído para o ambiente de emergência
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Ferramentas projetadas para suportar decisões rápidas e precisas
                </p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    title: "Protocolos Clínicos",
                    description: "Acesso rápido a protocolos baseados em evidências para emergências.",
                  },
                  {
                    title: "Gestão de Pacientes",
                    description: "Registro e acompanhamento integrado de pacientes durante o plantão.",
                  },
                  {
                    title: "Turno Inteligente",
                    description: "Controle de plantões com handoff estruturado e seguro.",
                  },
                  {
                    title: "Diagnóstico Assistido",
                    description: "Sugestões diagnósticas baseadas em sintomas e sinais vitais.",
                  },
                  {
                    title: "Prescrição Segura",
                    description: "Verificação automática de interações e dosagens medicamentosas.",
                  },
                  {
                    title: "Relatórios",
                    description: "Relatórios detalhados de cada plantão para auditoria e melhoria.",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <h3 className="mb-2 font-semibold">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="container flex flex-col items-center gap-2 px-4 text-center md:px-6">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Copiloto Clínico de Plantão
          </p>
        </div>
      </footer>
    </div>
  );
}
