import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack desabilitado temporariamente — causa erro de createContext
  // em Server Components no Next.js 16.2.7 neste ambiente.
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', 'radix-ui'],
  },
};

export default nextConfig;
