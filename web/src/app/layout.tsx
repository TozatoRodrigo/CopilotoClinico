import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { IconProvider } from "@/components/providers/icon-provider";
import { OfflineProvider } from "@/components/providers/offline-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-store";
import { ServiceWorkerRegistrar } from "@/components/providers/sw-registrar";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: ["400"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Copiloto Clínico de Plantão",
  description: "Assistência inteligente para médicos de emergência",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Copiloto Clínico",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
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
      className={`${dmSans.variable} ${dmSerifDisplay.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Script inline cru (HTML, não React) para prevenir FOUC de tema.
          Executa antes da hidratação do React — lê localStorage e aplica
          a classe 'dark' no <html>. Como é HTML puro (dangerouslySetInnerHTML),
          React 19 não alerta sobre "script em componente".
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <IconProvider>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                <OfflineProvider>
                  <TooltipProvider>
                    {children}
                    <Toaster />
                    <ServiceWorkerRegistrar />
                  </TooltipProvider>
                </OfflineProvider>
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </IconProvider>
      </body>
    </html>
  );
}
