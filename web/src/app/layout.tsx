import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { OfflineProvider } from "@/components/providers/offline-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-store";
import { ServiceWorkerRegistrar } from "@/components/providers/sw-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Copiloto Clínico de Plantão",
  description: "Assistência inteligente para médicos de emergência",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Copiloto Clínico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <OfflineProvider>
              <TooltipProvider>
                {children}
                <Toaster />
                <ServiceWorkerRegistrar />
              </TooltipProvider>
            </OfflineProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
