import babelParser from "@babel/eslint-parser";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";

const nextCoreWebVitals = nextPlugin.configs["core-web-vitals"];

// eslint-config-next still loads typescript-eslint 8.x, which crashes on
// TypeScript 7 (no ts.Extension). Use the Next plugin + Babel TS parsing.
// TODO: Re-evaluate typescript-eslint on each dependency refresh and restore
// it once stable TypeScript 7 support is released. Do not install unsupported
// or canary typescript-eslint merely to regain type-aware rules.
const eslintConfig = defineConfig([
  {
    name: "river-aftercare/next",
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    plugins: nextCoreWebVitals.plugins,
    rules: nextCoreWebVitals.rules,
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: {
            plugins: ["typescript", "jsx"],
          },
        },
      },
    },
  },
  {
    name: "river-aftercare/aftercare-native-markup",
    files: ["app/(aftercare)/**/*.{ts,tsx}"],
    rules: {
      // Patient pages stay Server Components. next/link and next/image
      // would add client JS; native anchors and img are the approved contract.
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "**/*.d.ts",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
