import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const reactCompilerDebtAsWarnings = {
  "react-hooks/immutability": "warn",
  "react-hooks/preserve-manual-memoization": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/refs": "warn",
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/static-components": "warn",
};

const typeScriptLegacyDebtAsWarnings = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-require-imports": "warn",
};

const painelVitals = nextVitals.map((config) =>
  config.plugins?.["react-hooks"]
    ? {
        ...config,
        rules: {
          ...config.rules,
          ...reactCompilerDebtAsWarnings,
        },
      }
    : config
);

const painelTs = nextTs.map((config) =>
  config.rules?.["@typescript-eslint/no-explicit-any"]
    ? {
        ...config,
        rules: {
          ...config.rules,
          ...typeScriptLegacyDebtAsWarnings,
        },
      }
    : config
);

const eslintConfig = defineConfig([
  ...painelVitals,
  ...painelTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
