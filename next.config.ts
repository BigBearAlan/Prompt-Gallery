import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') || undefined;

const config: NextConfig = {
  output: 'export',
  outputFileTracingRoot: process.cwd(),
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
};

export default config;
