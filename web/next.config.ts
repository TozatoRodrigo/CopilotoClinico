import path from 'node:path';
import type { NextConfig } from 'next';

// ADR-017 — o web importa o motor clínico de ../src/shared/clinical-tools.
// O Turbopack não resolve arquivo fora da raiz, e sem raiz fixa ele adivinha
// pelo lockfile mais externo (a raiz do repo no CI, só `web/` na imagem).
// Fixar a raiz do repo nos dois deixa o build igual em todo lugar e o
// standalone sempre em .next/standalone/web/server.js.
const REPO_ROOT = path.join(__dirname, '..');

const nextConfig: NextConfig = {
  // Standalone output para Docker — gera .next/standalone (server.js independente).
  output: 'standalone',
  outputFileTracingRoot: REPO_ROOT,
  turbopack: { root: REPO_ROOT },
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  productionBrowserSourceMaps: false,
  typescript: { ignoreBuildErrors: true },
  // `eslint` foi removido de `NextConfig` nesta versão do Next.js (16.2.9) —
  // lint deixou de rodar acoplado a `next build`; o CI já roda lint como
  // step separado (ver .github/workflows/ci.yml). A chave antiga não tinha
  // efeito nenhum em runtime, só quebrava o typecheck (`tsc --noEmit`).
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', 'radix-ui'],
  },
};

export default nextConfig;
