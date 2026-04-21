import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const coreSrcDir = './packages/core/src';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ['@consultare/core'],
  turbopack: {
    root: path.resolve(appDir, "../.."),
    resolveAlias: {
      '@consultare/core/db': `${coreSrcDir}/db.ts`,
      '@consultare/core/storage': `${coreSrcDir}/storage/index.ts`,
      '@consultare/core/storage/provider': `${coreSrcDir}/storage/provider.ts`,
      '@consultare/core/storage/providers/s3': `${coreSrcDir}/storage/providers/s3.ts`,
      '@consultare/core/colaboradores/constants': `${coreSrcDir}/colaboradores/constants.ts`,
      '@consultare/core/colaboradores/types': `${coreSrcDir}/colaboradores/types.ts`,
      '@consultare/core/colaboradores/status': `${coreSrcDir}/colaboradores/status.ts`,
      '@consultare/core/colaboradores/portal-repository': `${coreSrcDir}/colaboradores/portal_repository.ts`,
      '@consultare/core/employee-portal/auth': `${coreSrcDir}/employee_portal/auth.ts`,
      '@consultare/core/employee-portal/constants': `${coreSrcDir}/employee_portal/constants.ts`,
      '@consultare/core/employee-portal/errors': `${coreSrcDir}/employee_portal/errors.ts`,
      '@consultare/core/employee-portal/repository': `${coreSrcDir}/employee_portal/repository.ts`,
      '@consultare/core/employee-portal/storage': `${coreSrcDir}/employee_portal/storage.ts`,
      '@consultare/core/employee-portal/types': `${coreSrcDir}/employee_portal/types.ts`,
    },
  },
};

export default nextConfig;
