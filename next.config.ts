import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // GitHub Pages is a static host, so the Pages workflow opts into vinext's
  // static export without changing the local/server build used for previews.
  output: process.env.STATIC_EXPORT === 'true' ? 'export' : undefined,
  assetPrefix: process.env.BASE_PATH || undefined,
};

export default nextConfig;
