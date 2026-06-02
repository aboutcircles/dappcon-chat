import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Client-side data loading via setState-in-effect is the canonical
      // pattern here; the new React 19 rule fires on every fetch helper.
      // Until we adopt a query library, downgrade to a warning.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
