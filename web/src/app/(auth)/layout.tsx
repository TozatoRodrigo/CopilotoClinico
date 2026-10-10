import { AuthTopBar } from './_components/auth-ui';

/**
 * Moldura das telas de entrada no estilo Notion: página branca, barra
 * superior mínima com a marca e uma coluna central estreita. Cada página
 * define a largura da própria coluna (login/cadastro ~360px, onboarding um
 * pouco mais larga por causa dos cartões de opção).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AuthTopBar />
      <main className="flex flex-1 flex-col items-center px-4 pt-6 pb-16 sm:pt-[9vh]">
        {children}
      </main>
    </div>
  );
}
