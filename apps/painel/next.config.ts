import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ['@consultare/core'],
  turbopack: {
    root: path.resolve(appDir, "../.."),
  },
};

export default nextConfig;
