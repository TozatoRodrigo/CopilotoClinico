import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output para Docker — gera .next/standalone (server.js independente).
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  // Otimizador de imagens desligado: nenhuma imagem do app passa por ele (as
  // duas `next/image` — QR code do MFA em data URI e figura da evidência — já
  // usam `unoptimized`). Com ele ligado, `/_next/image` ficava exposto sem
  // login e, com `remotePatterns` aceitando qualquer domínio, baixava e
  // processava no `sharp` imagem de qualquer lugar (SSRF e RCE do CC-022).
  // Desligado, a rota responde 404 e nenhum `remotePatterns` é necessário.
  images: { unoptimized: true },
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
