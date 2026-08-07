import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output para Docker — gera .next/standalone (server.js independente).
  output: 'standalone',
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
