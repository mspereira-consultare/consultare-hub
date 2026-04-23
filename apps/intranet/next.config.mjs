import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const coreSrcDir = './packages/core/src';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  transpilePackages: ['@consultare/core'],
  turbopack: {
    root: path.resolve(appDir, '../..'),
    resolveAlias: {
      '@consultare/core/auth': `${coreSrcDir}/auth.ts`,
      '@consultare/core/db': `${coreSrcDir}/db.ts`,
      '@consultare/core/permissions': `${coreSrcDir}/permissions.ts`,
      '@consultare/core/storage': `${coreSrcDir}/storage/index.ts`,
      '@consultare/core/storage/provider': `${coreSrcDir}/storage/provider.ts`,
      '@consultare/core/storage/providers/s3': `${coreSrcDir}/storage/providers/s3.ts`,
    },
  },
};

export default nextConfig;
